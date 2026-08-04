/**
 * Per-person history charts for the three elevated tiers.
 *
 * Every series here is computed from dated rows that already exist —
 * Attendance.date, LeaveRequest.startDate/endDate, PayrollRun.month/year,
 * ExpenseClaim.expenseDate. Nothing is interpolated, smoothed, or back-filled,
 * per the rule at the top of dashboard.series.ts: a fake sparkline is worse
 * than none, because it is indistinguishable from a real one.
 *
 * The corollary matters as much: a month BEFORE the subject joined, or before
 * ATTENDANCE_GO_LIVE, is *no data* — not zero. It renders as a zero-height bar
 * with an empty display. Within the measured window a genuine zero does render
 * as "0". Collapsing the two gives a new hire a flawless six-month attendance
 * record on their first day.
 */

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { MONTH_LABELS, lastMonths, scale } from "../dashboard/dashboard.series"
import { bdt } from "../dashboard/dashboard.format"
import { buildDayGrid, goLiveDate } from "../attendance/attendance.grid"
import { summariseDays } from "../attendance/attendance.summary"
import { countChargedDays } from "../leave/leave.dates"
import type { AccessTokenPayload } from "../auth/auth.types"
import type { ChartBar } from "../dashboard/dashboard.types"
import { visibilityTierFor } from "./employee.access"
import { employeeIdForUser } from "./employee.service"

export const INSIGHTS_MONTHS = 6

export interface EmployeeInsights {
  /** The shared axis, e.g. ["Mar","Apr","May","Jun","Jul","Aug"]. */
  months: string[]
  /** FULL and MANAGER. */
  personal?: {
    attendanceRate: ChartBar[]
    lateArrivals: ChartBar[]
    leaveDaysTaken: ChartBar[]
  }
  /** FULL and FINANCE. */
  money?: {
    netPay: ChartBar[]
    expenseClaims: ChartBar[]
  }
  /** FULL and MANAGER, and only when the subject has subordinates. */
  team?: {
    teamSize: ChartBar[]
    leaveDecisions: ChartBar[]
  }
}

interface MonthWindow {
  month: number
  year: number
  start: Date
  end: Date
  label: string
  /** False for a month entirely before the employee could be measured. */
  measured: boolean
}

function monthWindows(measurableFrom: Date): MonthWindow[] {
  return lastMonths(INSIGHTS_MONTHS).map((m) => {
    const start = new Date(Date.UTC(m.year, m.month - 1, 1))
    return {
      month: m.month,
      year: m.year,
      start,
      end: m.endDay,
      label: MONTH_LABELS[m.month - 1],
      measured: m.endDay.getTime() >= measurableFrom.getTime(),
    }
  })
}

/**
 * Builds bars where an unmeasured month is blank rather than zero.
 *
 * `display` is produced only for measured months; the caller's formatter
 * decides what a measured zero looks like ("0" for a count, "" for money that
 * was never run).
 */
function toBars(
  windows: MonthWindow[],
  values: number[],
  display: (value: number, window: MonthWindow) => string
): ChartBar[] {
  const heights = scale(values.map((v, i) => (windows[i].measured ? v : 0)))
  return windows.map((w, i) => ({
    label: w.label,
    display: w.measured ? display(values[i], w) : "",
    height: w.measured ? heights[i] : 0,
  }))
}

export async function getEmployeeInsights(
  viewer: AccessTokenPayload,
  employeeId: string
): Promise<EmployeeInsights> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) throw new AppError(404, "Employee not found")

  const tier = visibilityTierFor(viewer, employee, await employeeIdForUser(viewer.sub))
  if (tier !== "FULL" && tier !== "FINANCE" && tier !== "MANAGER") {
    throw new AppError(403, "Insights are not available for this employee")
  }

  // Nothing derives before the later of the employee's joining date and the
  // date attendance became the record of truth.
  const goLive = goLiveDate()
  const measurableFrom =
    employee.joiningDate.getTime() > goLive.getTime() ? employee.joiningDate : goLive
  const windows = monthWindows(measurableFrom)
  const months = windows.map((w) => w.label)

  const subordinates = await prisma.employee.findMany({
    where: { reportingManagerId: employeeId },
    select: { joiningDate: true, lastWorkingDay: true },
  })

  const insights: EmployeeInsights = { months }

  if (tier === "FULL" || tier === "MANAGER") {
    insights.personal = {
      attendanceRate: await attendanceRateSeries(employee, windows),
      lateArrivals: await lateArrivalSeries(employeeId, windows),
      leaveDaysTaken: await leaveDaysSeries(employeeId, windows),
    }
    if (subordinates.length > 0) {
      insights.team = {
        teamSize: teamSizeSeries(subordinates, windows),
        leaveDecisions: await leaveDecisionSeries(employee.userId, windows),
      }
    }
  }

  if (tier === "FULL" || tier === "FINANCE") {
    insights.money = {
      netPay: await netPaySeries(employeeId, windows),
      expenseClaims: await expenseSeries(employeeId, windows),
    }
  }

  return insights
}

/**
 * One grid over the whole window, sliced per month.
 *
 * `getMonthlySummary` is not reused because it builds a role-scoped roster;
 * here the roster is one known person, and building the grid once instead of
 * six times is the difference between one query set and six.
 */
async function attendanceRateSeries(
  employee: {
    id: string
    joiningDate: Date
    employmentStatus: string
    shiftId: string | null
    lastWorkingDay: Date | null
  },
  windows: MonthWindow[]
): Promise<ChartBar[]> {
  const from = windows[0].start
  const to = windows[windows.length - 1].end
  const grid = await buildDayGrid(
    [
      {
        id: employee.id,
        joiningDate: employee.joiningDate,
        employmentStatus: employee.employmentStatus as never,
        shiftId: employee.shiftId,
        lastWorkingDay: employee.lastWorkingDay,
      } as never,
    ],
    from,
    to
  )
  const days = grid.get(employee.id) ?? []

  const ref = {
    id: employee.id,
    fullName: "",
    employeeCode: "",
    designation: "",
  } as never

  const rates = windows.map((w) => {
    const summary = summariseDays(ref, days, w.month, w.year)
    if (summary.workingDays === 0) return 0
    return Math.round((summary.present / summary.workingDays) * 100)
  })

  return toBars(windows, rates, (v) => `${v}%`)
}

async function lateArrivalSeries(
  employeeId: string,
  windows: MonthWindow[]
): Promise<ChartBar[]> {
  const rows = await prisma.attendance.findMany({
    where: {
      employeeId,
      isLate: true,
      date: { gte: windows[0].start, lte: windows[windows.length - 1].end },
    },
    select: { date: true },
  })

  const counts = windows.map(
    (w) =>
      rows.filter(
        (r) => r.date.getTime() >= w.start.getTime() && r.date.getTime() <= w.end.getTime()
      ).length
  )
  // A measured zero shows "0" — nobody was late is a real and welcome fact.
  return toBars(windows, counts, (v) => String(v))
}

async function leaveDaysSeries(
  employeeId: string,
  windows: MonthWindow[]
): Promise<ChartBar[]> {
  const from = windows[0].start
  const to = windows[windows.length - 1].end
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: {
      startDate: true,
      endDate: true,
      startSession: true,
      endSession: true,
      leaveType: { select: { countsHolidays: true } },
    },
  })

  const totals = windows.map((w) => {
    let days = 0
    for (const req of requests) {
      // Clipped to the month. Attributing the whole request to its start month
      // would show days taken in a month the person was present.
      const clippedStart = req.startDate.getTime() > w.start.getTime() ? req.startDate : w.start
      const clippedEnd = req.endDate.getTime() < w.end.getTime() ? req.endDate : w.end
      if (clippedStart.getTime() > clippedEnd.getTime()) continue

      // A session only applies at the request's own edge. Where the clip cuts
      // mid-request the day is served in full, so the interior edge is a whole
      // day — carrying the request's SECOND_HALF onto a clipped July 31 would
      // drop half a day the employee actually took.
      days += countChargedDays(
        clippedStart,
        clippedEnd,
        {
          startSession:
            clippedStart.getTime() === req.startDate.getTime()
              ? req.startSession
              : "FIRST_HALF",
          endSession:
            clippedEnd.getTime() === req.endDate.getTime() ? req.endSession : "SECOND_HALF",
        },
        { countsHolidays: req.leaveType.countsHolidays }
      )
    }
    return days
  })

  return toBars(windows, totals, (v) => String(v))
}

async function netPaySeries(employeeId: string, windows: MonthWindow[]): Promise<ChartBar[]> {
  const payslips = await prisma.payslip.findMany({
    where: {
      employeeId,
      payrollRun: {
        status: { in: ["APPROVED", "DISBURSED"] },
        OR: windows.map((w) => ({ month: w.month, year: w.year })),
      },
    },
    select: { netPayableBdt: true, payrollRun: { select: { month: true, year: true } } },
  })

  const byKey = new Map<string, number>()
  for (const slip of payslips) {
    const key = `${slip.payrollRun.year}-${slip.payrollRun.month}`
    byKey.set(key, (byKey.get(key) ?? 0) + slip.netPayableBdt.toNumber())
  }

  const totals = windows.map((w) => byKey.get(`${w.year}-${w.month}`) ?? 0)
  // Empty, not "৳0" — zero is a claim that payroll ran and came to nothing.
  // Same treatment payrollSeries already gives a month with no run.
  return toBars(windows, totals, (v) => (v > 0 ? bdt(v) : ""))
}

async function expenseSeries(employeeId: string, windows: MonthWindow[]): Promise<ChartBar[]> {
  const claims = await prisma.expenseClaim.findMany({
    where: {
      employeeId,
      // ExpenseStatus has no "PAID" value — REIMBURSED is the terminal state
      // once a payslip or settlement has actually paid the claim.
      status: { in: ["APPROVED", "REIMBURSED"] },
      expenseDate: { gte: windows[0].start, lte: windows[windows.length - 1].end },
    },
    select: { amount: true, fxRateToBdt: true, expenseDate: true },
  })

  const totals = windows.map((w) =>
    claims
      .filter(
        (c) =>
          c.expenseDate.getTime() >= w.start.getTime() &&
          c.expenseDate.getTime() <= w.end.getTime()
      )
      // A USD claim without a rate is counted at face value rather than
      // dropped: dropping it understates the month silently.
      .reduce((sum, c) => sum + c.amount.toNumber() * (c.fxRateToBdt?.toNumber() ?? 1), 0)
  )

  return toBars(windows, totals, (v) => (v > 0 ? bdt(v) : "0"))
}

/**
 * Month-end team size, derived the same way `headcountSeries` derives company
 * headcount: somebody counts if they had joined by the month end and had not
 * left by it. `lastWorkingDay` is the authority, not `employmentStatus` —
 * the latter is current-state and would report a leaver as absent from every
 * month, including the ones they worked.
 */
function teamSizeSeries(
  subordinates: { joiningDate: Date; lastWorkingDay: Date | null }[],
  windows: MonthWindow[]
): ChartBar[] {
  const counts = windows.map(
    (w) =>
      subordinates.filter(
        (s) =>
          s.joiningDate.getTime() <= w.end.getTime() &&
          // `>=`, not `>`: somebody whose last day is the 30th was employed
          // on the 30th.
          (s.lastWorkingDay === null || s.lastWorkingDay.getTime() >= w.end.getTime())
      ).length
  )
  return windows.map((w, i) => ({
    label: w.label,
    // Team size is measured from the moment the team exists, independent of
    // the subject's own attendance window.
    display: String(counts[i]),
    height: scale(counts)[i],
  }))
}

/**
 * Leave decisions this person made, per month.
 *
 * `approvedBy` holds a **User** id, the same convention as `changedBy` on the
 * audit tables. Querying the employee id here returns a plausible always-empty
 * chart rather than an error, which is exactly the kind of bug that ships.
 */
async function leaveDecisionSeries(
  subjectUserId: string,
  windows: MonthWindow[]
): Promise<ChartBar[]> {
  const decisions = await prisma.leaveRequest.findMany({
    where: {
      approvedBy: subjectUserId,
      decidedAt: { gte: windows[0].start, lte: windows[windows.length - 1].end },
    },
    select: { decidedAt: true },
  })

  const counts = windows.map(
    (w) =>
      decisions.filter(
        (d) =>
          d.decidedAt !== null &&
          d.decidedAt.getTime() >= w.start.getTime() &&
          d.decidedAt.getTime() <= w.end.getTime()
      ).length
  )
  return windows.map((w, i) => ({
    label: w.label,
    display: String(counts[i]),
    height: scale(counts)[i],
  }))
}
