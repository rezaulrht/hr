/**
 * The HR Admin landing page.
 *
 * `getDailySummary` is imported rather than re-derived: attendance status is
 * computed on read, so that function *is* the source of truth, and a second
 * day grid living here would drift.
 */

import prisma from "../../config/prisma"
import { getDailySummary } from "../attendance/attendance.summary"
import { officeToday } from "../attendance/attendance.time"
import type { AccessTokenPayload } from "../auth/auth.types"
import { settleCards } from "./dashboard.cards"
import { ageInDays, days, when } from "./dashboard.format"
import { rollingAttrition } from "./dashboard.attrition"
import { timeOfDayGreeting } from "./dashboard.greeting"
import { headcountSeries } from "./dashboard.series"
import { toneFor } from "./dashboard.tone"
import type { ChartBar, DashboardPayload, DashboardStat, TableCell } from "./dashboard.types"

async function pendingLeaveCard(count: number): Promise<DashboardStat> {
  const oldest = await prisma.leaveRequest.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  })
  const age = oldest ? ageInDays(oldest.createdAt, officeToday()) : 0

  return {
    label: "Leave requests",
    value: String(count),
    sub: count === 0 ? "Nothing waiting" : `Oldest waiting ${days(age)}`,
    tag: count === 0 ? "Clear" : "Pending",
    tone: toneFor.queue(count),
    href: "/hr/leave",
  }
}

async function headcountCard(): Promise<DashboardStat> {
  const [active, onLeave, trend] = await Promise.all([
    prisma.employee.count({ where: { employmentStatus: "ACTIVE" } }),
    prisma.employee.count({ where: { employmentStatus: "ON_LEAVE" } }),
    headcountSeries(6),
  ])

  return {
    label: "Headcount",
    value: String(active + onLeave),
    sub: `${active} active · ${onLeave} on leave`,
    tag: "On the books",
    tone: "neutral",
    ...(trend.length > 0 ? { trend, hotBar: trend.length - 1 } : {}),
    href: "/hr/employees",
  }
}

async function onLeaveTodayCard(actor: AccessTokenPayload): Promise<DashboardStat> {
  const summary = await getDailySummary(actor)
  const { onLeave, present, absent, notCheckedIn } = summary.totals
  const roster = onLeave + present + absent + notCheckedIn

  return {
    label: "On leave today",
    value: String(onLeave),
    sub: roster === 0 ? "Nobody rostered today" : `of ${roster} rostered`,
    tag: summary.date,
    tone: "neutral",
    href: "/hr/attendance",
  }
}

async function attritionCard(): Promise<DashboardStat> {
  const { rate, leavers, averageHeadcount } = await rollingAttrition(12)

  if (rate === null) {
    return {
      label: "Attrition",
      // Not "0%", which would read as a perfect retention record.
      value: "—",
      sub: "No headcount to measure against",
      tag: "Rolling 12 months",
      tone: "neutral",
      href: "/hr/reports",
    }
  }

  return {
    label: "Attrition",
    value: `${rate.toFixed(1)}%`,
    // The window named in words, so nobody reads it as quarterly. The rate is
    // *not* annualised from a shorter period — it is already a year.
    sub: `${leavers} left over the last 12 months · avg headcount ${averageHeadcount.toFixed(0)}`,
    tag: "Rolling 12 months",
    tone: toneFor.rate(rate, { good: 10, bad: 20 }),
    href: "/hr/reports",
  }
}

/** Active headcount per department, largest first. One name lookup, not N. */
async function departmentChart(): Promise<ChartBar[]> {
  const grouped = await prisma.employee.groupBy({
    by: ["departmentId"],
    where: { employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] } },
    _count: { _all: true },
  })
  if (grouped.length === 0) return []

  const departments = await prisma.department.findMany({ select: { id: true, name: true } })
  const nameById = new Map(departments.map((d) => [d.id, d.name]))

  const rows = grouped
    .map((g) => ({
      label: g.departmentId ? (nameById.get(g.departmentId) ?? "Unknown") : "Unassigned",
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count)

  const max = Math.max(...rows.map((r) => r.count))
  return rows.map((r) => ({
    label: r.label,
    display: String(r.count),
    height: max > 0 ? Math.round((r.count / max) * 100) : 0,
  }))
}

async function pendingLeaveRows(): Promise<TableCell[][]> {
  const requests = await prisma.leaveRequest.findMany({
    where: { status: "PENDING" },
    // Oldest first: the ageing row is the one that matters.
    orderBy: { createdAt: "asc" },
    take: 5,
    select: {
      startDate: true,
      endDate: true,
      createdAt: true,
      employee: { select: { fullName: true, employeeCode: true } },
      leaveType: { select: { name: true } },
    },
  })

  const today = officeToday()
  return requests.map((r) => {
    const age = ageInDays(r.createdAt, today)
    return [
      { text: r.employee.fullName, sub: r.employee.employeeCode, weight: 500 },
      { text: r.leaveType.name },
      { text: `${when(r.startDate)} → ${when(r.endDate)}` },
      { tag: days(age), tone: toneFor.aging(age) },
    ]
  })
}

export async function buildHrDashboard(actor: AccessTokenPayload): Promise<DashboardPayload> {
  // Counted once, read by both the card and the nav badge.
  const pendingLeave = await prisma.leaveRequest.count({ where: { status: "PENDING" } })

  const [stats, bars, rows] = await Promise.all([
    settleCards([
      { label: "Leave requests", build: () => pendingLeaveCard(pendingLeave) },
      { label: "Headcount", build: () => headcountCard() },
      { label: "On leave today", build: () => onLeaveTodayCard(actor) },
      { label: "Attrition", build: () => attritionCard() },
    ]),
    departmentChart(),
    pendingLeaveRows(),
  ])

  return {
    role: "HR_ADMIN",
    greeting: {
      kicker: timeOfDayGreeting(),
      heading: "People operations",
      sub:
        pendingLeave === 0
          ? "No leave requests waiting."
          : `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} waiting on you.`,
      cta: { label: "Review leave requests", href: "/hr/leave" },
    },
    stats,
    chart: { title: "Headcount by department", sub: "Active and on leave", bars },
    table: {
      title: "Leave requests waiting",
      headers: ["Employee", "Type", "Dates", "Waiting"],
      rows,
      href: "/hr/leave",
    },
    badges: { "/hr/leave": pendingLeave },
  }
}
