import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/env", () => ({
  env: { APP_TIMEZONE: "Asia/Dhaka", ATTENDANCE_GO_LIVE: "2026-01-01" },
}))

vi.mock("../../config/prisma", () => ({
  default: {
    employee: { findMany: vi.fn() },
    leaveRequest: { count: vi.fn(), findMany: vi.fn() },
    expenseClaim: { count: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock("../attendance/attendance.approval", () => ({ listApprovals: vi.fn() }))
vi.mock("../attendance/attendance.summary", () => ({
  getMonthlySummary: vi.fn(),
  getWeeklySummary: vi.fn(),
}))
vi.mock("../leave/leave.service", () => ({
  getTeamStatus: vi.fn(),
  requireEmployeeForUser: vi.fn(),
}))
vi.mock("../event/event.service", () => ({ listEvents: vi.fn() }))

import prisma from "../../config/prisma"
import { listApprovals } from "../attendance/attendance.approval"
import { getMonthlySummary, getWeeklySummary } from "../attendance/attendance.summary"
import type { AccessTokenPayload } from "../auth/auth.types"
import { listEvents } from "../event/event.service"
import { getTeamStatus, requireEmployeeForUser } from "../leave/leave.service"
import { parseDateOnly } from "../../utils/dates"
import { buildManagerDashboard } from "./dashboard.manager"

// Saturday 15 August 2026, midday Dhaka. The office week starts Saturday.
const NOW = new Date("2026-08-15T06:00:00.000Z")
const actor = { sub: "user-mgr", role: "REPORTING_MANAGER", email: "m@d.com", mustChangePassword: false } as AccessTokenPayload

const cardBy = (payload: Awaited<ReturnType<typeof buildManagerDashboard>>, label: string) => {
  const card = payload.stats.find((s) => s.label === label)
  if (!card) throw new Error(`No card labelled "${label}"`)
  return card
}

const emptyWeek = {
  from: "2026-08-15",
  to: "2026-08-21",
  headcount: 0,
  days: [],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)

  vi.mocked(requireEmployeeForUser).mockResolvedValue({ id: "emp-mgr" } as never)
  vi.mocked(prisma.employee.findMany).mockResolvedValue([{ id: "emp-1" }, { id: "emp-2" }] as never)
  vi.mocked(prisma.leaveRequest.count).mockResolvedValue(0)
  vi.mocked(prisma.expenseClaim.count).mockResolvedValue(0)
  vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.expenseClaim.findMany).mockResolvedValue([] as never)
  vi.mocked(listApprovals).mockResolvedValue([])
  vi.mocked(getMonthlySummary).mockResolvedValue([])
  vi.mocked(getWeeklySummary).mockResolvedValue(emptyWeek)
  vi.mocked(getTeamStatus).mockResolvedValue([])
  vi.mocked(listEvents).mockResolvedValue({ items: [], nextCursor: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("pending approvals", () => {
  it("counts all three queues, including attendance", async () => {
    // The mock this replaces counted two of the three; the attendance queue
    // is this role's own and was missing.
    vi.mocked(prisma.leaveRequest.count).mockResolvedValue(3)
    vi.mocked(prisma.expenseClaim.count).mockResolvedValue(1)
    vi.mocked(listApprovals).mockResolvedValue(
      Array.from({ length: 4 }, () => ({
        date: "2026-08-10",
        employee: { fullName: "Nusrat Jahan" },
        exceptions: [],
      })) as never
    )

    const card = cardBy(await buildManagerDashboard(actor), "Pending approvals")
    expect(card.value).toBe("8")
    expect(card.sub).toBe("3 leave · 4 attendance · 1 expense")
  })

  it("scopes every queue to the manager's own reports", async () => {
    await buildManagerDashboard(actor)
    expect(prisma.leaveRequest.count).toHaveBeenCalledWith({
      where: { status: "PENDING", employeeId: { in: ["emp-1", "emp-2"] } },
    })
    // The attendance queue scopes itself against the actor, inside the
    // attendance module where that rule already lives.
    expect(listApprovals).toHaveBeenCalledWith(actor)
  })

  it("drives the approvals badge from the same total", async () => {
    vi.mocked(prisma.leaveRequest.count).mockResolvedValue(3)
    const payload = await buildManagerDashboard(actor)
    expect(payload.badges["/manager/approvals"]).toBe(3)
  })
})

describe("present today", () => {
  it("reads team size as the denominator, not its own card", async () => {
    vi.mocked(getTeamStatus).mockResolvedValue([
      ...Array.from({ length: 14 }, () => ({ status: "ACTIVE" })),
      { status: "ON_LEAVE" },
      { status: "ON_LEAVE" },
    ] as never)

    const payload = await buildManagerDashboard(actor)
    const card = cardBy(payload, "Present today")
    expect(card.value).toBe("14 of 16")
    expect(card.sub).toBe("2 on leave")
    // And there is no separate team-size card.
    expect(payload.stats.map((s) => s.label)).not.toContain("Team size")
  })

  it("excludes a leaver from both sides of the ratio", async () => {
    vi.mocked(getTeamStatus).mockResolvedValue([
      { status: "ACTIVE" },
      { status: "LEFT" },
    ] as never)

    expect(cardBy(await buildManagerDashboard(actor), "Present today").value).toBe("1 of 1")
  })
})

describe("on leave, next 14 days", () => {
  it("counts distinct people, not requests", async () => {
    // Two requests from one person is one person missing, and a manager
    // planning cover needs heads.
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValueOnce([
      { employeeId: "emp-1" },
      { employeeId: "emp-1" },
      { employeeId: "emp-2" },
    ] as never)

    const card = cardBy(await buildManagerDashboard(actor), "On leave, next 14 days")
    expect(card.value).toBe("2")
  })

  it("includes leave that ends today and excludes leave starting on day 15", async () => {
    // Off-by-one on a coverage window is how a manager approves the day that
    // leaves nobody in.
    await buildManagerDashboard(actor)
    const where = vi.mocked(prisma.leaveRequest.findMany).mock.calls[0][0]?.where as {
      startDate: { lte: Date }
      endDate: { gte: Date }
    }
    expect(where.endDate.gte).toEqual(parseDateOnly("2026-08-15"))
    expect(where.startDate.lte).toEqual(parseDateOnly("2026-08-29"))
  })

  it("reads Full team available when nobody is away", async () => {
    const card = cardBy(await buildManagerDashboard(actor), "On leave, next 14 days")
    expect(card.value).toBe("0")
    expect(card.sub).toBe("Full team available")
  })
})

describe("team attendance", () => {
  it("divides present by working days across the roster", async () => {
    vi.mocked(getMonthlySummary).mockResolvedValue([
      { present: 10, workingDays: 11, late: 1 },
      { present: 11, workingDays: 11, late: 0 },
    ] as never)

    const card = cardBy(await buildManagerDashboard(actor), "Team attendance")
    expect(card.value).toBe("95%")
    expect(card.sub).toBe("1 late arrival")
    expect(card.tone).toBe("green")
  })

  it("reads — rather than NaN when the roster has no working days", async () => {
    vi.mocked(getMonthlySummary).mockResolvedValue([
      { present: 0, workingDays: 0, late: 0 },
    ] as never)

    const card = cardBy(await buildManagerDashboard(actor), "Team attendance")
    expect(card.value).toBe("—")
    expect(card.sub).toBe("No working days yet this month")
  })
})

describe("the weekly chart", () => {
  it("builds the grid once for the whole week, not once per day", async () => {
    await buildManagerDashboard(actor)
    expect(getWeeklySummary).toHaveBeenCalledTimes(1)
    expect(getWeeklySummary).toHaveBeenCalledWith(actor, "2026-08-15", "2026-08-21")
  })

  it("labels a holiday and a weekly off rather than dropping them", async () => {
    // Four bars in a working week should be explicable: a manager must be
    // able to tell a holiday from a data gap.
    vi.mocked(getWeeklySummary).mockResolvedValue({
      from: "2026-08-15",
      to: "2026-08-21",
      headcount: 4,
      days: [
        { date: "2026-08-15", kind: "WORKING", present: 4, late: 0, absent: 0, onLeave: 0, notCheckedIn: 0 },
        { date: "2026-08-16", kind: "HOLIDAY", present: 0, late: 0, absent: 0, onLeave: 0, notCheckedIn: 0 },
        { date: "2026-08-21", kind: "WEEKLY_OFF", present: 0, late: 0, absent: 0, onLeave: 0, notCheckedIn: 0 },
      ],
    })

    const bars = (await buildManagerDashboard(actor)).chart?.bars
    expect(bars).toEqual([
      { label: "Sat", display: "4", height: 100 },
      { label: "Sun", display: "Holiday", height: 0 },
      { label: "Fri", display: "Off", height: 0 },
    ])
  })
})

describe("the queue table", () => {
  it("unifies the three queues oldest first, naming each row's queue", async () => {
    // Not newest-first: the ageing row is the one that matters.
    vi.mocked(prisma.leaveRequest.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          createdAt: parseDateOnly("2026-08-12"),
          employee: { fullName: "Ayesha Rahman" },
          leaveType: { name: "Casual" },
        },
      ] as never)
    vi.mocked(prisma.expenseClaim.findMany).mockResolvedValue([
      {
        createdAt: parseDateOnly("2026-08-08"),
        category: "Travel",
        employee: { fullName: "Tanvir Hasan" },
      },
    ] as never)
    vi.mocked(listApprovals).mockResolvedValue([
      { date: "2026-08-10", employee: { fullName: "Nusrat Jahan" }, exceptions: ["LATE"] },
    ] as never)

    const rows = (await buildManagerDashboard(actor)).table?.rows ?? []
    expect(rows.map((r) => r[1].tag)).toEqual(["Expense", "Attendance", "Leave"])
    expect(rows[0][0].text).toBe("Tanvir Hasan")
    expect(rows[0][3]).toEqual({ tag: "7 days", tone: "red" })
  })
})

describe("the team feed", () => {
  it("reads the event log, which excludes a peer's events by construction", async () => {
    // Not filtered here — `visibleToFilter` already excluded anything where
    // this manager is neither subject nor manager.
    vi.mocked(listEvents).mockResolvedValue({
      items: [
        {
          id: "evt-1",
          type: "leave.requested",
          severity: "INFO",
          entity: "LEAVE_REQUEST",
          entityId: "lr-1",
          title: "Casual leave requested",
          meta: "Ayesha Rahman · Aug 20 – Aug 22 · 3 days",
          href: "/leave",
          createdAt: "2026-08-14T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    })

    const payload = await buildManagerDashboard(actor)
    expect(listEvents).toHaveBeenCalledWith(actor, { limit: 5 })
    expect(payload.feed).toEqual([
      {
        initial: "L",
        tone: "neutral",
        title: "Casual leave requested",
        meta: "Ayesha Rahman · Aug 20 – Aug 22 · 3 days",
        time: "2026-08-14T10:00:00.000Z",
      },
    ])
  })
})

describe("a manager with no direct reports", () => {
  it("gets a well-formed payload with zeros, not a throw", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never)

    const payload = await buildManagerDashboard(actor)
    expect(payload.role).toBe("REPORTING_MANAGER")
    expect(payload.stats).toHaveLength(4)
    expect(cardBy(payload, "Pending approvals").value).toBe("0")
    expect(cardBy(payload, "Present today").value).toBe("—")
    expect(payload.table?.rows).toEqual([])
  })

  it("does not query the queues at all for an empty team", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never)
    await buildManagerDashboard(actor)
    expect(prisma.leaveRequest.count).not.toHaveBeenCalled()
  })
})
