/**
 * The only two real sparkline series this system can honestly draw.
 *
 * Everything else on these dashboards is current-state with no stored
 * history — `LeaveRequest.status` holds today's answer and nothing about
 * yesterday's — so those cards get **no** `trend` rather than a synthesised
 * one. A fake sparkline is worse than none, because it is indistinguishable
 * from a real one.
 */

import prisma from "../../config/prisma"
import { officeToday } from "../attendance/attendance.time"
import { bdt } from "./dashboard.format"
import type { ChartBar } from "./dashboard.types"

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

interface MonthKey {
  month: number
  year: number
  /** Last instant of the month. */
  end: Date
  /**
   * The month's last calendar day at UTC midnight.
   *
   * Separate from `end` because `joiningDate` and `lastWorkingDay` are
   * date-only values pinned to UTC midnight: comparing them against
   * 23:59:59.999 would put somebody whose last working day *is* the month
   * end outside the month, and the last working day is worked.
   */
  endDay: Date
}

/** The `count` months ending with the current one, oldest first. */
export function lastMonths(count: number, today = officeToday()): MonthKey[] {
  const out: MonthKey[] = []
  for (let back = count - 1; back >= 0; back--) {
    const year = today.getUTCFullYear()
    const month = today.getUTCMonth() - back
    // Day 0 of the following month is the last day of this one, and Date
    // normalises a negative month index into the previous year for us.
    const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    const endDay = new Date(Date.UTC(year, month + 1, 0))
    out.push({ month: end.getUTCMonth() + 1, year: end.getUTCFullYear(), end, endDay })
  }
  return out
}

/**
 * Scales to 0–100 with the largest value as 100. All-zero stays all-zero.
 *
 * Exported for `employee.insights.ts`, which draws the same kind of bars.
 */
export function scale(values: number[]): number[] {
  const max = Math.max(...values)
  if (max <= 0) return values.map(() => 0)
  return values.map((v) => Math.round((v / max) * 100))
}

/**
 * Month-end active headcount for the last `count` months.
 *
 * Derived rather than stored: somebody counts if they had joined by the
 * month end and had not left by it. `lastWorkingDay` is the authority on
 * leaving — `employmentStatus` is current-state and would report a leaver as
 * absent from every month in the series, including the ones they worked.
 */
export async function headcountSeries(count: number): Promise<number[]> {
  const months = lastMonths(count)
  const employees = await prisma.employee.findMany({
    select: { joiningDate: true, lastWorkingDay: true },
  })
  if (employees.length === 0) return []

  const counts = months.map(
    ({ endDay }) =>
      employees.filter(
        (e) =>
          e.joiningDate <= endDay &&
          // `>=`, not `>`: somebody whose last working day is the 30th was
          // employed on the 30th.
          (e.lastWorkingDay === null || e.lastWorkingDay >= endDay)
      ).length
  )
  return scale(counts)
}

/**
 * Net payable per month over runs that actually reached the bank.
 *
 * **A month with no run is a zero-height bar with an empty display, not an
 * omitted entry.** A gap in the axis is information — nobody was paid that
 * month — and closing it silently draws a continuous line through the fact.
 */
export async function payrollSeries(count: number): Promise<ChartBar[]> {
  const months = lastMonths(count)
  const runs = await prisma.payrollRun.findMany({
    where: {
      status: { in: ["APPROVED", "DISBURSED"] },
      OR: months.map(({ month, year }) => ({ month, year })),
    },
    select: {
      month: true,
      year: true,
      payslips: { select: { netPayableBdt: true } },
    },
  })

  const totalByKey = new Map<string, number>()
  for (const run of runs) {
    const total = run.payslips.reduce((sum, p) => sum + p.netPayableBdt.toNumber(), 0)
    totalByKey.set(`${run.year}-${run.month}`, total)
  }

  const totals = months.map(({ month, year }) => totalByKey.get(`${year}-${month}`) ?? 0)
  const heights = scale(totals)

  return months.map((m, i) => ({
    label: MONTH_LABELS[m.month - 1],
    // Empty, not "৳0". Zero is a claim that payroll ran and came to nothing.
    display: totals[i] > 0 ? bdt(totals[i]) : "",
    height: heights[i],
  }))
}
