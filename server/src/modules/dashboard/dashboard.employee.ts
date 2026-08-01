/**
 * The employee landing page.
 *
 * The only dashboard that **writes** (the time clock) and the only one where
 * the feed is primary content rather than a sidebar.
 */

import prisma from "../../config/prisma"
import { getToday } from "../attendance/attendance.service"
import { getMonthlySummary } from "../attendance/attendance.summary"
import type { AccessTokenPayload } from "../auth/auth.types"
import { listEvents } from "../event/event.service"
import { getMyBalances, requireEmployeeForUser } from "../leave/leave.service"
import { getMyPayslips } from "../payroll/payroll.service"
import { REPORTING_CURRENCY } from "../payroll/payroll.money"
import { settleCards } from "./dashboard.cards"
import { toActivityItems } from "./dashboard.feed"
import { bdt, money, percent } from "./dashboard.format"
import { timeOfDayGreeting } from "./dashboard.greeting"
import { monthName } from "../payroll/payroll.events"
import { toneFor } from "./dashboard.tone"
import type { DashboardPayload, DashboardStat, TimeClockState } from "./dashboard.types"

async function leaveBalanceCard(actor: AccessTokenPayload): Promise<DashboardStat> {
  const balances = await getMyBalances(actor.sub)
  const total = balances.reduce((sum, b) => sum + b.balance, 0)

  return {
    label: "Leave balance",
    // **Not clamped.** Earned leave can legitimately run negative under the
    // BD Labour Act rework, and hiding a real deficit behind a zero is how
    // somebody plans a holiday they cannot take.
    value: `${total} day${total === 1 || total === -1 ? "" : "s"}`,
    sub:
      balances.length === 0
        ? "No leave types configured"
        : balances.map((b) => `${b.name} ${b.balance}`).join(" · "),
    tag: "Available",
    tone: total < 0 ? "red" : "neutral",
    href: "/employee/leave",
  }
}

async function attendanceCard(actor: AccessTokenPayload): Promise<DashboardStat> {
  // Self only — `getMonthlySummary` gives an EMPLOYEE a one-row roster.
  const [summary] = await getMonthlySummary(actor)
  if (!summary) {
    return {
      label: "Attendance",
      value: "—",
      sub: "Nothing recorded this month",
      tag: "This month",
      tone: "neutral",
      href: "/employee/attendance",
    }
  }

  const rate = summary.workingDays > 0 ? (summary.present / summary.workingDays) * 100 : null
  return {
    label: "Attendance",
    value: percent(summary.present, summary.workingDays),
    sub: `${summary.present} of ${summary.workingDays} working days · ${summary.late} late`,
    tag: "This month",
    tone: rate === null ? "neutral" : toneFor.rate(rate, { good: 90, bad: 75 }),
    href: "/employee/attendance",
  }
}

/**
 * The one card that is deliberately **not** in BDT.
 *
 * Somebody paid in USD reading a BDT-only figure cannot reconcile it against
 * their own bank statement, so the payslip renders in its own currency with
 * the BDT equivalent underneath.
 */
async function payslipCard(actor: AccessTokenPayload): Promise<DashboardStat> {
  const [latest] = await getMyPayslips(actor)
  if (!latest) {
    return {
      label: "Latest payslip",
      value: "None yet",
      sub: "No payslip has been published to you",
      tag: "Payroll",
      tone: "neutral",
      href: "/employee/payslips",
    }
  }

  const label = monthName(latest.payrollRun.month, latest.payrollRun.year)
  const native = money(latest.netPayable, latest.currency)
  return {
    label: "Latest payslip",
    value: native,
    sub:
      latest.currency === REPORTING_CURRENCY
        ? label
        : `${label} · ${bdt(latest.netPayableBdt)} equivalent`,
    tag: latest.payrollRun.status === "DISBURSED" ? "Paid" : "Approved",
    tone: latest.payrollRun.status === "DISBURSED" ? "green" : "yellow",
    href: "/employee/payslips",
  }
}

async function expenseCard(employeeId: string): Promise<DashboardStat> {
  const claims = await prisma.expenseClaim.findMany({
    where: { employeeId, status: { in: ["PENDING", "APPROVED"] } },
    select: { amount: true, currency: true, status: true },
  })
  const pending = claims.filter((c) => c.status === "PENDING").length

  return {
    label: "Expense claims",
    value: String(claims.length),
    sub:
      claims.length === 0
        ? "Nothing outstanding"
        : `${pending} awaiting review · ${claims.length - pending} approved, not yet paid`,
    tag: claims.length === 0 ? "Clear" : "Open",
    tone: "neutral",
    href: "/employee/expenses",
  }
}

/**
 * The time clock, re-shaped from attendance's own "today" state.
 *
 * `serverNow` is the server's instant. The client ticks a display from it and
 * never seeds it from `new Date()`: lateness is decided server-side against
 * the shift, and a browser clock four minutes fast turns an on-time check-in
 * into a visibly late one.
 */
function toTimeClock(today: Awaited<ReturnType<typeof getToday>>): TimeClockState {
  return {
    checkedIn: today.checkIn !== null && today.checkOut === null,
    serverNow: today.serverTime,
    // From the assigned shift, never a hardcoded string.
    shift: `${today.shift.name} · ${today.shift.startTime}–${today.shift.endTime}`,
    checkIn: today.checkIn,
    checkOut: today.checkOut,
    hoursToday: today.workedHours,
    canCheckIn: today.canCheckIn,
    canCheckOut: today.canCheckOut,
    detail: today.detail,
  }
}

export async function buildEmployeeDashboard(
  actor: AccessTokenPayload
): Promise<DashboardPayload> {
  // Throws the module's existing 403 for an account with no employee row,
  // rather than dereferencing null four cards deep.
  const self = await requireEmployeeForUser(actor.sub)

  const [stats, today, events] = await Promise.all([
    settleCards([
      { label: "Leave balance", build: () => leaveBalanceCard(actor) },
      { label: "Attendance", build: () => attendanceCard(actor) },
      { label: "Latest payslip", build: () => payslipCard(actor) },
      { label: "Expense claims", build: () => expenseCard(self.id) },
    ]),
    getToday(actor.sub),
    listEvents(actor, { limit: 5 }),
  ])

  return {
    role: "EMPLOYEE",
    greeting: {
      kicker: timeOfDayGreeting(),
      heading: `${self.fullName.split(" ")[0]}'s day`,
      sub: today.detail ?? "Your clock, your balances and what has happened to you lately.",
      cta: { label: "Apply for leave", href: "/employee/leave" },
    },
    stats,
    feed: toActivityItems(events.items),
    timeClock: toTimeClock(today),
    badges: {},
  }
}
