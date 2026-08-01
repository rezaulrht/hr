/**
 * The Super Admin landing page.
 *
 * Framed as **"what needs me, and is the org healthy"** rather than "org
 * vitals". This role's only job in the payroll workflow is approving what
 * Finance submitted, and the mock it replaces had no card saying so.
 */

import prisma from "../../config/prisma"
import { officeToday } from "../attendance/attendance.time"
import type { AccessTokenPayload } from "../auth/auth.types"
import { listEvents } from "../event/event.service"
import { settleCards } from "./dashboard.cards"
import { ageInDays, days } from "./dashboard.format"
import { timeOfDayGreeting } from "./dashboard.greeting"
import { currentPayrollCard } from "./dashboard.payroll-card"
import { headcountSeries, payrollSeries } from "./dashboard.series"
import { toneFor } from "./dashboard.tone"
import type { DashboardPayload, DashboardStat, TableCell } from "./dashboard.types"

/**
 * What is actually waiting on this person's decision.
 *
 * A `DRAFT` settlement that was never calculated is a stub, not a queued
 * decision — counting it puts a number on the card that nobody can action.
 */
async function approvalQueue(): Promise<{ runs: number; settlements: number; total: number }> {
  const [runs, settlements] = await Promise.all([
    prisma.payrollRun.count({ where: { status: "SUBMITTED" } }),
    prisma.settlement.count({ where: { status: "DRAFT", calculatedAt: { not: null } } }),
  ])
  return { runs, settlements, total: runs + settlements }
}

async function awaitingApprovalCard(count: number): Promise<DashboardStat> {
  const { runs, settlements } = await approvalQueue()
  return {
    label: "Awaiting your approval",
    value: String(count),
    sub: `${runs} payroll run${runs === 1 ? "" : "s"} · ${settlements} settlement${settlements === 1 ? "" : "s"}`,
    tag: count === 0 ? "Clear" : "Action needed",
    tone: toneFor.blockers(count),
    href: "/admin/payroll",
  }
}

async function headcountCard(): Promise<DashboardStat> {
  const today = officeToday()
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))

  const [active, joinedThisMonth, departments, trend] = await Promise.all([
    prisma.employee.count({ where: { employmentStatus: "ACTIVE" } }),
    prisma.employee.count({ where: { joiningDate: { gte: monthStart } } }),
    prisma.department.count(),
    headcountSeries(6),
  ])

  return {
    label: "Total employees",
    value: String(active),
    sub: `+${joinedThisMonth} joined this month · ${departments} department${departments === 1 ? "" : "s"}`,
    tag: "Active",
    tone: "neutral",
    // Omitted rather than zeroed when there is no history to draw.
    ...(trend.length > 0 ? { trend, hotBar: trend.length - 1 } : {}),
    href: "/admin/employees",
  }
}

/**
 * The backlog that silently blocks month-end: `preflight` gates a payroll run
 * on there being no pending attendance, so this queue is a payroll problem
 * dressed as an attendance one.
 */
async function attendanceBacklogCard(count: number): Promise<DashboardStat> {
  const oldest = await prisma.attendance.findFirst({
    where: { approval: "PENDING" },
    orderBy: { date: "asc" },
    select: { date: true },
  })
  const age = oldest ? ageInDays(oldest.date, officeToday()) : 0

  return {
    label: "Attendance backlog",
    value: String(count),
    sub: count === 0 ? "Nothing pending" : `Oldest waiting ${days(age)}`,
    tag: count === 0 ? "Clear" : "Pending",
    tone: count === 0 ? "green" : toneFor.aging(age),
    href: "/admin/attendance",
  }
}

/**
 * The event log, rendered as rows.
 *
 * `title` and `meta` are frozen at emit, so there is **no** name resolution
 * and no diff-to-prose mapping here. If this function ever starts batching
 * `User` lookups, the event log is being used wrong — and an event whose
 * actor has since been deleted still renders correctly today.
 */
function eventRows(events: Awaited<ReturnType<typeof listEvents>>["items"]): TableCell[][] {
  const severityTone = { INFO: "neutral", SUCCESS: "green", WARNING: "yellow", ERROR: "red" } as const
  return events.map((e) => [
    { text: e.title, sub: e.meta ?? undefined, weight: 500 },
    { text: e.entity.replace(/_/g, " ").toLowerCase() },
    { tag: e.severity.toLowerCase(), tone: severityTone[e.severity] },
    { text: e.createdAt },
  ])
}

export async function buildAdminDashboard(actor: AccessTokenPayload): Promise<DashboardPayload> {
  // Counted once and used by both the card and the nav badge. Two sources
  // drift, and the one that drifts is always the one nobody is looking at.
  const [queue, attendanceBacklog] = await Promise.all([
    approvalQueue(),
    prisma.attendance.count({ where: { approval: "PENDING" } }),
  ])

  const [stats, bars, events] = await Promise.all([
    settleCards([
      { label: "Awaiting your approval", build: () => awaitingApprovalCard(queue.total) },
      { label: "Total employees", build: () => headcountCard() },
      { label: "This month's payroll", build: () => currentPayrollCard("/admin/payroll") },
      { label: "Attendance backlog", build: () => attendanceBacklogCard(attendanceBacklog) },
    ]),
    payrollSeries(6),
    listEvents(actor, { limit: 5 }),
  ])

  return {
    role: "SUPER_ADMIN",
    greeting: {
      kicker: timeOfDayGreeting(),
      heading: "Organisation overview",
      sub:
        queue.total === 0
          ? "Nothing is waiting on you."
          : `${queue.total} decision${queue.total === 1 ? "" : "s"} waiting on you.`,
      cta: { label: "Review payroll", href: "/admin/payroll" },
    },
    stats,
    chart: { title: "Payroll disbursed", sub: "Last six months, BDT", bars },
    table: {
      title: "Recent activity",
      headers: ["What happened", "Area", "Severity", "When"],
      rows: eventRows(events.items),
      href: "/admin/reports",
    },
    badges: {
      "/admin/payroll": queue.total,
      "/admin/attendance": attendanceBacklog,
    },
  }
}
