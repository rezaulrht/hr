import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/env", () => ({
  env: { APP_TIMEZONE: "Asia/Dhaka", ATTENDANCE_GO_LIVE: "2026-01-01" },
}))

vi.mock("../../config/prisma", () => ({
  default: {
    leaveRequest: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    employee: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    department: { findMany: vi.fn() },
  },
}))

vi.mock("../attendance/attendance.summary", () => ({ getDailySummary: vi.fn() }))

import prisma from "../../config/prisma"
import { getDailySummary } from "../attendance/attendance.summary"
import type { AccessTokenPayload } from "../auth/auth.types"
import { parseDateOnly } from "../../utils/dates"
import { rollingAttrition } from "./dashboard.attrition"
import { buildHrDashboard } from "./dashboard.hr"

const NOW = new Date("2026-08-15T06:00:00.000Z")
const actor = { sub: "user-1", role: "HR_ADMIN", email: "a@d.com", mustChangePassword: false } as AccessTokenPayload

const cardBy = (payload: Awaited<ReturnType<typeof buildHrDashboard>>, label: string) => {
  const card = payload.stats.find((s) => s.label === label)
  if (!card) throw new Error(`No card labelled "${label}"`)
  return card
}

const emptySummary = {
  date: "2026-08-15",
  totals: {
    present: 0,
    late: 0,
    absent: 0,
    onLeave: 0,
    holiday: 0,
    weeklyOff: 0,
    notCheckedIn: 0,
    pendingApproval: 0,
  },
  rows: [],
  conflicts: [],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)

  vi.mocked(prisma.leaveRequest.count).mockResolvedValue(0)
  vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.employee.count).mockResolvedValue(0)
  vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.employee.groupBy).mockResolvedValue([] as never)
  vi.mocked(prisma.department.findMany).mockResolvedValue([] as never)
  vi.mocked(getDailySummary).mockResolvedValue(emptySummary as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("leave requests", () => {
  it("names the age of the oldest pending request", async () => {
    vi.mocked(prisma.leaveRequest.count).mockResolvedValue(8)
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue({
      createdAt: parseDateOnly("2026-08-11"),
    } as never)

    const card = cardBy(await buildHrDashboard(actor), "Leave requests")
    expect(card.value).toBe("8")
    expect(card.sub).toBe("Oldest waiting 4 days")
    expect(card.tone).toBe("red")
  })

  it("drives the badge from the same number as the card", async () => {
    vi.mocked(prisma.leaveRequest.count).mockResolvedValue(8)
    const payload = await buildHrDashboard(actor)
    expect(payload.badges["/hr/leave"]).toBe(8)
    expect(cardBy(payload, "Leave requests").value).toBe("8")
  })
})

describe("headcount", () => {
  it("splits active from on-leave", async () => {
    vi.mocked(prisma.employee.count).mockResolvedValueOnce(46).mockResolvedValueOnce(2)

    const card = cardBy(await buildHrDashboard(actor), "Headcount")
    expect(card.value).toBe("48")
    expect(card.sub).toBe("46 active · 2 on leave")
  })
})

describe("on leave today", () => {
  it("imports the daily summary rather than re-deriving the day grid", async () => {
    vi.mocked(getDailySummary).mockResolvedValue({
      ...emptySummary,
      totals: { ...emptySummary.totals, onLeave: 3, present: 12, absent: 1 },
    } as never)

    const card = cardBy(await buildHrDashboard(actor), "On leave today")
    expect(getDailySummary).toHaveBeenCalledWith(actor)
    expect(card.value).toBe("3")
    expect(card.sub).toBe("of 16 rostered")
  })

  it("says so rather than dividing by nothing on an empty roster", async () => {
    const card = cardBy(await buildHrDashboard(actor), "On leave today")
    expect(card.sub).toBe("Nobody rostered today")
  })
})

describe("attrition, rolling 12 months", () => {
  const staff = (over: Record<string, unknown>) => ({
    joiningDate: parseDateOnly("2020-01-01"),
    lastWorkingDay: null,
    employmentStatus: "ACTIVE",
    ...over,
  })

  it("divides leavers by the average of opening and closing headcount", async () => {
    // Average, not closing: a company that halved would otherwise report over
    // 100%, and one that doubled would flatter itself.
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      staff({}),
      staff({}),
      staff({}),
      staff({ employmentStatus: "RESIGNED", lastWorkingDay: parseDateOnly("2026-03-31") }),
    ] as never)

    const result = await rollingAttrition(12)
    expect(result.leavers).toBe(1)
    // Opening (2025-08-15): all four employed → 4. Closing: three → 3.
    expect(result.averageHeadcount).toBe(3.5)
    expect(result.rate).toBeCloseTo(28.57, 2)
  })

  it("reads — rather than NaN when there is no headcount to measure against", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never)

    const card = cardBy(await buildHrDashboard(actor), "Attrition")
    expect(card.value).toBe("—")
    expect(card.sub).toBe("No headcount to measure against")
  })

  it("excludes a leaver with no last working day", async () => {
    // `employmentStatus` can be set without an exit date, and counting those
    // against a *window* attributes them to whichever window is open.
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      staff({}),
      staff({ employmentStatus: "RESIGNED", lastWorkingDay: null }),
    ] as never)

    const result = await rollingAttrition(12)
    expect(result.leavers).toBe(0)
  })

  it("excludes a leaver whose exit falls outside the window", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      staff({}),
      staff({ employmentStatus: "TERMINATED", lastWorkingDay: parseDateOnly("2024-06-01") }),
    ] as never)

    expect((await rollingAttrition(12)).leavers).toBe(0)
  })

  it("names the window in words, so nobody reads it as quarterly", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([staff({}), staff({})] as never)

    const card = cardBy(await buildHrDashboard(actor), "Attrition")
    expect(card.sub).toContain("last 12 months")
    expect(card.tag).toBe("Rolling 12 months")
  })

  it("does not annualise — the window already is a year", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      staff({}),
      staff({ employmentStatus: "RESIGNED", lastWorkingDay: parseDateOnly("2026-08-01") }),
    ] as never)

    const result = await rollingAttrition(12)
    // 1 leaver, opening 2, closing 1 → avg 1.5 → 66.7%, not ×4 or ×12.
    expect(result.rate).toBeCloseTo(66.67, 2)
  })
})

describe("chart and table", () => {
  it("resolves department names in one lookup, not one per group", async () => {
    vi.mocked(prisma.employee.groupBy).mockResolvedValue([
      { departmentId: "d1", _count: { _all: 20 } },
      { departmentId: "d2", _count: { _all: 8 } },
    ] as never)
    vi.mocked(prisma.department.findMany).mockResolvedValue([
      { id: "d1", name: "Engineering" },
      { id: "d2", name: "Finance" },
    ] as never)

    const payload = await buildHrDashboard(actor)
    expect(prisma.department.findMany).toHaveBeenCalledTimes(1)
    expect(payload.chart?.bars).toEqual([
      { label: "Engineering", display: "20", height: 100 },
      { label: "Finance", display: "8", height: 40 },
    ])
  })

  it("labels employees with no department rather than dropping them", async () => {
    vi.mocked(prisma.employee.groupBy).mockResolvedValue([
      { departmentId: null, _count: { _all: 3 } },
    ] as never)

    const payload = await buildHrDashboard(actor)
    expect(payload.chart?.bars[0].label).toBe("Unassigned")
  })

  it("lists pending requests oldest first", async () => {
    await buildHrDashboard(actor)
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
      })
    )
  })

  it("tags each row with how long it has waited", async () => {
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([
      {
        startDate: parseDateOnly("2026-08-20"),
        endDate: parseDateOnly("2026-08-22"),
        createdAt: parseDateOnly("2026-08-09"),
        employee: { fullName: "Ayesha Rahman", employeeCode: "BS-EMP-DEMO" },
        leaveType: { name: "Casual" },
      },
    ] as never)

    const payload = await buildHrDashboard(actor)
    expect(payload.table?.rows[0][0]).toMatchObject({ text: "Ayesha Rahman" })
    // The same date voice the rest of the product speaks. This read
    // "2026-08-20 → 2026-08-22" while the feed one panel over said
    // "Aug 17, 10:57 AM".
    expect(payload.table?.rows[0][2].text).toBe("Aug 20, 2026 → Aug 22, 2026")
    expect(payload.table?.rows[0][3]).toEqual({ tag: "6 days", tone: "red" })
  })
})

describe("card isolation", () => {
  it("survives one sub-query failing", async () => {
    vi.mocked(getDailySummary).mockRejectedValue(new Error("grid blew up"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const payload = await buildHrDashboard(actor)
    expect(payload.stats).toHaveLength(4)
    expect(cardBy(payload, "On leave today").failed).toBe(true)
    expect(cardBy(payload, "Headcount").failed).toBeUndefined()
  })
})
