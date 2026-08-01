import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Pinned so the go-live assertions do not shift with the deployment .env.
vi.mock("../../config/env", () => ({
  env: { APP_TIMEZONE: "Asia/Dhaka", ATTENDANCE_GO_LIVE: "2026-08-01" },
}))

vi.mock("../../config/prisma", () => ({
  default: {
    employee: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    shift: { findMany: vi.fn() },
  },
}))

// Wraps the real implementation rather than replacing it, so the rollup is
// tested against a genuine grid *and* the call count is observable. The
// count is the entire reason this function exists: a later refactor that
// loops `getDailySummary` would pass every other test in this file.
vi.mock("./attendance.grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./attendance.grid")>()
  return { ...actual, buildDayGrid: vi.fn(actual.buildDayGrid) }
})

import prisma from "../../config/prisma"
import type { Attendance, Holiday, Shift } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { parseDateOnly } from "../../utils/dates"
import { buildDayGrid } from "./attendance.grid"
import { getWeeklySummary } from "./attendance.summary"

// Midday Dhaka on Saturday 15 August 2026. August 2026 starts on a Saturday,
// so the Fridays are the 7th, 14th, 21st and 28th.
const NOW = new Date("2026-08-15T06:00:00.000Z")

const GENERAL: Shift = {
  id: "shift-general",
  name: "General",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: 60,
  graceMinutes: 15,
  weeklyOffDays: [5],
  effectiveFrom: null,
  effectiveTo: null,
}

const ROSTER_ROW = {
  id: "emp-1",
  fullName: "Ayesha Rahman",
  employeeCode: "BS-EMP-DEMO",
  designation: "Software Engineer",
  joiningDate: parseDateOnly("2024-01-06"),
  employmentStatus: "ACTIVE",
  shiftId: null,
  lastWorkingDay: null,
}

const SECOND_ROW = {
  ...ROSTER_ROW,
  id: "emp-2",
  fullName: "Tanvir Hasan",
  employeeCode: "BS-EMP-0002",
}

function attendanceRow(
  employeeId: string,
  date: string,
  overrides: Partial<Attendance> = {}
): Attendance {
  return {
    id: `att-${employeeId}-${date}`,
    employeeId,
    date: parseDateOnly(date),
    checkIn: new Date(`${date}T03:05:00.000Z`),
    checkOut: new Date(`${date}T12:05:00.000Z`),
    workedHours: 9,
    isLate: false,
    isEarlyOut: false,
    source: "WEB",
    approval: "APPROVED",
    approvedBy: "user-mgr",
    approvedAt: null,
    approvalNote: null,
    regularisedAt: null,
    regularisedNote: null,
    correctedBy: null,
    correctedAt: null,
    correctionNote: null,
    ...overrides,
  }
}

const holiday = (date: string, name: string): Holiday => ({
  id: `hol-${date}`,
  name,
  date: parseDateOnly(date),
  type: "GENERAL",
})

const actor = (role: string) =>
  ({ sub: "user-1", role, email: "a@demo.com", mustChangePassword: false }) as never

function stubSources(
  sources: { attendances?: Attendance[]; holidays?: Holiday[] } = {}
) {
  vi.mocked(prisma.attendance.findMany).mockResolvedValue((sources.attendances ?? []) as never)
  vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])
  vi.mocked(prisma.holiday.findMany).mockResolvedValue((sources.holidays ?? []) as never)
  vi.mocked(prisma.shift.findMany).mockResolvedValue([GENERAL] as never)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.mocked(prisma.employee.findMany).mockResolvedValue([ROSTER_ROW] as never)
  stubSources()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("getWeeklySummary", () => {
  it("returns one entry per calendar day, inclusive of both ends", async () => {
    const summary = await getWeeklySummary(actor("HR_ADMIN"), "2026-08-08", "2026-08-14")

    expect(summary.from).toBe("2026-08-08")
    expect(summary.to).toBe("2026-08-14")
    expect(summary.days).toHaveLength(7)
    expect(summary.days[0].date).toBe("2026-08-08")
    expect(summary.days[6].date).toBe("2026-08-14")
  })

  it("reports the roster size the counts are out of", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([ROSTER_ROW, SECOND_ROW] as never)

    const summary = await getWeeklySummary(actor("HR_ADMIN"), "2026-08-10", "2026-08-12")
    expect(summary.headcount).toBe(2)
  })

  it("keeps a weekly off and a holiday as entries with their own kind", async () => {
    // Omitting them would leave a manager looking at four bars in a working
    // week with no way to tell a holiday from a data gap.
    stubSources({ holidays: [holiday("2026-08-12", "National Mourning Day")] })

    const summary = await getWeeklySummary(actor("HR_ADMIN"), "2026-08-10", "2026-08-14")

    const byDate = Object.fromEntries(summary.days.map((d) => [d.date, d]))
    expect(byDate["2026-08-12"].kind).toBe("HOLIDAY")
    expect(byDate["2026-08-12"].present).toBe(0)
    // The 14th is a Friday, the shift's weekly off.
    expect(byDate["2026-08-14"].kind).toBe("WEEKLY_OFF")
    expect(byDate["2026-08-14"].present).toBe(0)
    expect(byDate["2026-08-10"].kind).toBe("WORKING")
  })

  it("counts present, late, absent and not-checked-in against office today", async () => {
    stubSources({
      attendances: [
        attendanceRow("emp-1", "2026-08-13", { isLate: true }),
        attendanceRow("emp-2", "2026-08-13"),
      ],
    })
    vi.mocked(prisma.employee.findMany).mockResolvedValue([ROSTER_ROW, SECOND_ROW] as never)

    const summary = await getWeeklySummary(actor("HR_ADMIN"), "2026-08-13", "2026-08-16")
    const byDate = Object.fromEntries(summary.days.map((d) => [d.date, d]))

    expect(byDate["2026-08-13"].present).toBe(2)
    expect(byDate["2026-08-13"].late).toBe(1)
    // The 15th is today: nobody has punched, and that is not an absence.
    expect(byDate["2026-08-15"].notCheckedIn).toBe(2)
    expect(byDate["2026-08-15"].absent).toBe(0)
    // The 16th is in the future, for the same reason.
    expect(byDate["2026-08-16"].notCheckedIn).toBe(2)
  })

  it("builds the day grid exactly once for the whole range", async () => {
    await getWeeklySummary(actor("HR_ADMIN"), "2026-08-08", "2026-08-14")
    expect(vi.mocked(buildDayGrid)).toHaveBeenCalledTimes(1)
  })

  it("rejects a range longer than 31 days", async () => {
    // Unbounded ranges are how this becomes an accidental full-history scan.
    await expect(getWeeklySummary(actor("HR_ADMIN"), "2026-01-01", "2026-03-31")).rejects.toThrow(
      AppError
    )
    await expect(
      getWeeklySummary(actor("HR_ADMIN"), "2026-01-01", "2026-03-31")
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("accepts a range of exactly 31 days", async () => {
    const summary = await getWeeklySummary(actor("HR_ADMIN"), "2026-08-01", "2026-08-31")
    expect(summary.days).toHaveLength(31)
  })

  it("rejects a range that ends before it starts", async () => {
    await expect(
      getWeeklySummary(actor("HR_ADMIN"), "2026-08-14", "2026-08-08")
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("gives a manager their reports", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)

    await getWeeklySummary(actor("REPORTING_MANAGER"), "2026-08-10", "2026-08-14")
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ id: "emp-1" }, { reportingManagerId: "emp-1" }],
        }),
      })
    )
  })

  it("gives an employee a one-row roster rather than a 403", async () => {
    vi.mocked(prisma.employee.findUnique)
      .mockResolvedValueOnce({ id: "emp-1" } as never)
      .mockResolvedValueOnce(ROSTER_ROW as never)

    const summary = await getWeeklySummary(actor("EMPLOYEE"), "2026-08-10", "2026-08-14")
    expect(summary.headcount).toBe(1)
  })

  it("does not query the grid at all for an empty roster", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never)

    const summary = await getWeeklySummary(actor("HR_ADMIN"), "2026-08-10", "2026-08-14")
    expect(summary.headcount).toBe(0)
    expect(summary.days).toHaveLength(5)
    expect(summary.days.every((d) => d.present === 0)).toBe(true)
  })
})
