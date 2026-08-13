/**
 * The Reporting Manager landing page.
 *
 * The mock this replaces counted two of the three approval queues — the
 * attendance queue, which is this role's own, was missing entirely. And team
 * size is no longer its own card: it is the denominator of "present today"
 * (`14 of 16`), where it actually means something.
 */

import prisma from "../../config/prisma"
import { listApprovals } from "../attendance/attendance.approval"
import { getMonthlySummary, getWeeklySummary } from "../attendance/attendance.summary"
import { officeToday } from "../attendance/attendance.time"
import type { AccessTokenPayload } from "../auth/auth.types"
import { listEvents } from "../event/event.service"
import { getTeamStatus, requireEmployeeForUser } from "../leave/leave.service"
import { settleCards } from "./dashboard.cards"
import { days, ofTotal, percent } from "./dashboard.format"
import { timeOfDayGreeting } from "./dashboard.greeting"
import { toActivityItems } from "./dashboard.feed"
import { toneFor } from "./dashboard.tone"
import { addDays } from "../../utils/dates"
import type { ChartBar, DashboardPayload, DashboardStat, TableCell } from "./dashboard.types"

/** How far ahead the coverage card looks. */
const OUTLOOK_DAYS = 14

interface Queues {
  leave: number
  expense: number
  attendance: number
  total: number
}

async function pendingQueues(actor: AccessTokenPayload, teamIds: string[]): Promise<Queues> {
  if (teamIds.length === 0) {
    return { leave: 0, expense: 0, attendance: 0, total: 0 }
  }
  const [leave, expense, attendance] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: "PENDING", employeeId: { in: teamIds } } }),
    prisma.expenseClaim.count({ where: { status: "PENDING", employeeId: { in: teamIds } } }),
    listApprovals(actor).then((items) => items.length),
  ])
  return { leave, expense, attendance, total: leave + expense + attendance }
}

function pendingCard(queues: Queues): DashboardStat {
  return {
    label: "Pending approvals",
    value: String(queues.total),
    // Broken down by queue, because "7 pending" does not tell a manager
    // which screen to open.
    sub: `${queues.leave} leave · ${queues.attendance} attendance · ${queues.expense} expense`,
    tag: queues.total === 0 ? "Clear" : "Action needed",
    tone: toneFor.queue(queues.total),
    href: "/manager/approvals",
  }
}

async function presentTodayCard(actor: AccessTokenPayload): Promise<DashboardStat> {
  const team = await getTeamStatus(actor.sub)
  // `LEFT` is excluded from both sides: a leaver is not present, and they are
  // not part of the team the denominator describes either.
  const roster = team.filter((m) => m.status !== "LEFT")
  const present = roster.filter((m) => m.status === "ACTIVE").length

  return {
    label: "Present today",
    // Team size is the denominator, not a card of its own.
    value: roster.length === 0 ? "—" : ofTotal(present, roster.length),
    sub: roster.length === 0 ? "No direct reports" : `${roster.length - present} on leave`,
    tag: "Today",
    tone: "neutral",
    href: "/manager/employees",
  }
}

/**
 * Who is away over the next fortnight.
 *
 * Counted by **distinct employee**, not by request: two requests from one
 * person is one person missing, and a manager planning cover needs heads.
 */
async function outlookCard(teamIds: string[]): Promise<DashboardStat> {
  const today = officeToday()
  const until = addDays(today, OUTLOOK_DAYS)

  const requests =
    teamIds.length === 0
      ? []
      : await prisma.leaveRequest.findMany({
          where: {
            employeeId: { in: teamIds },
            status: "APPROVED",
            // Inclusive both ends: leave ending *today* still counts as
            // somebody out today. Off-by-one on a coverage window is how a
            // manager approves the day that leaves nobody in.
            startDate: { lte: until },
            endDate: { gte: today },
          },
          select: { employeeId: true },
        })

  const people = new Set(requests.map((r) => r.employeeId)).size
  return {
    label: "On leave, next 14 days",
    value: String(people),
    sub: people === 0 ? "Full team available" : `${people} of ${teamIds.length} away at some point`,
    tag: "Next 14 days",
    tone: toneFor.queue(people),
    href: "/manager/leave",
  }
}

async function teamAttendanceCard(actor: AccessTokenPayload): Promise<DashboardStat> {
  const summaries = await getMonthlySummary(actor)
  const present = summaries.reduce((sum, s) => sum + s.present, 0)
  const workingDays = summaries.reduce((sum, s) => sum + s.workingDays, 0)
  const late = summaries.reduce((sum, s) => sum + s.late, 0)

  const rate = workingDays > 0 ? (present / workingDays) * 100 : null
  return {
    label: "Team attendance",
    // "—" rather than NaN: a roster with no working days has no rate.
    value: percent(present, workingDays),
    sub: workingDays === 0 ? "No working days yet this month" : `${late} late arrival${late === 1 ? "" : "s"}`,
    tag: "This month",
    tone: rate === null ? "neutral" : toneFor.rate(rate, { good: 90, bad: 75 }),
    href: "/manager/attendance",
  }
}

/** Mon–Fri of the current office week, one grid build for the whole range. */
async function weekChart(actor: AccessTokenPayload): Promise<ChartBar[]> {
  const today = officeToday()
  // getUTCDay: 0 Sun … 6 Sat. The office week here starts Saturday, matching
  // the Friday weekly off the shift defines.
  const start = addDays(today, -((today.getUTCDay() + 1) % 7))
  const summary = await getWeeklySummary(
    actor,
    start.toISOString().slice(0, 10),
    addDays(start, 6).toISOString().slice(0, 10)
  )

  const max = Math.max(summary.headcount, 1)
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return summary.days.map((d) => ({
    label: DAY_LABELS[new Date(`${d.date}T00:00:00.000Z`).getUTCDay()],
    // A holiday and a weekly off say so rather than rendering as a silent
    // gap: four bars in a working week should be explicable.
    display:
      d.kind === "HOLIDAY" ? "Holiday" : d.kind === "WEEKLY_OFF" ? "Off" : String(d.present),
    height: d.kind === "WORKING" ? Math.round((d.present / max) * 100) : 0,
  }))
}

/**
 * The three queues in one list, **oldest first**.
 *
 * Not newest-first: the ageing row is the one that matters, which is why
 * `ApprovalItem` already carries `agingDays` and `stalled`.
 */
async function queueRows(actor: AccessTokenPayload, teamIds: string[]): Promise<TableCell[][]> {
  if (teamIds.length === 0) return []

  const today = officeToday()
  const [leave, expense, attendance] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "PENDING", employeeId: { in: teamIds } },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { createdAt: true, employee: { select: { fullName: true } }, leaveType: { select: { name: true } } },
    }),
    prisma.expenseClaim.findMany({
      where: { status: "PENDING", employeeId: { in: teamIds } },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { createdAt: true, category: { select: { name: true } }, employee: { select: { fullName: true } } },
    }),
    listApprovals(actor),
  ])

  const rows = [
    ...leave.map((r) => ({
      when: r.createdAt,
      name: r.employee.fullName,
      queue: "Leave",
      detail: r.leaveType.name,
    })),
    ...expense.map((c) => ({
      when: c.createdAt,
      name: c.employee.fullName,
      queue: "Expense",
       detail: c.category.name,
    })),
    ...attendance.slice(0, 5).map((a) => ({
      when: new Date(`${a.date}T00:00:00.000Z`),
      name: a.employee.fullName,
      queue: "Attendance",
      detail: a.exceptions.length > 0 ? a.exceptions.join(", ").toLowerCase() : a.date,
    })),
  ].sort((a, b) => a.when.getTime() - b.when.getTime())

  return rows.slice(0, 6).map((r) => {
    const age = Math.max(0, Math.round((today.getTime() - r.when.getTime()) / 86_400_000))
    return [
      { text: r.name, weight: 500 },
      { tag: r.queue },
      { text: r.detail },
      { tag: days(age), tone: toneFor.aging(age) },
    ]
  })
}

export async function buildManagerDashboard(
  actor: AccessTokenPayload
): Promise<DashboardPayload> {
  const self = await requireEmployeeForUser(actor.sub)
  const reports = await prisma.employee.findMany({
    where: { reportingManagerId: self.id },
    select: { id: true },
  })
  const teamIds = reports.map((r) => r.id)

  // Counted once, read by both the card and the nav badge.
  const queues = await pendingQueues(actor, teamIds)

  const [stats, bars, rows, events] = await Promise.all([
    settleCards([
      { label: "Pending approvals", build: async () => pendingCard(queues) },
      { label: "Present today", build: () => presentTodayCard(actor) },
      { label: "On leave, next 14 days", build: () => outlookCard(teamIds) },
      { label: "Team attendance", build: () => teamAttendanceCard(actor) },
    ]),
    weekChart(actor),
    queueRows(actor, teamIds),
    listEvents(actor, { limit: 5 }),
  ])

  return {
    role: "REPORTING_MANAGER",
    greeting: {
      kicker: timeOfDayGreeting(),
      heading: "Your team",
      sub:
        queues.total === 0
          ? "Nothing waiting on your decision."
          : `${queues.total} item${queues.total === 1 ? "" : "s"} waiting on your decision.`,
      cta: { label: "Review approvals", href: "/manager/approvals" },
    },
    stats,
    chart: { title: "Present this week", sub: `Out of ${teamIds.length + 1}`, bars },
    table: {
      title: "Waiting on you",
      headers: ["Employee", "Queue", "Detail", "Waiting"],
      rows,
      href: "/manager/approvals",
    },
    feed: toActivityItems(events.items),
    badges: { "/manager/approvals": queues.total, "/manager/leave": queues.leave },
  }
}
