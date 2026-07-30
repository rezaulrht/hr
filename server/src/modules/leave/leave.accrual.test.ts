import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../attendance/attendance.grid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../attendance/attendance.grid")>()),
  buildDayGrid: vi.fn(),
  goLiveDate: vi.fn(),
}))

import { buildDayGrid, goLiveDate } from "../attendance/attendance.grid"
import { parseDateOnly } from "../../utils/dates"
import {
  accrualWindow,
  accruedDays,
  addMonths,
  completedServiceMonths,
  computeEarnedAccrual,
  countDaysWorked,
} from "./leave.accrual"

const employee = {
  id: "emp-1",
  joiningDate: parseDateOnly("2020-01-01"),
  employmentStatus: "ACTIVE" as const,
  shiftId: null,
  lastWorkingDay: null,
}

/** Minimal day-grid entries — only `status` and `date` are read here. */
function grid(days: Array<{ date: string; status: string }>) {
  vi.mocked(buildDayGrid).mockResolvedValue(new Map([["emp-1", days as any]]))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(goLiveDate).mockReturnValue(parseDateOnly("2020-01-01"))
})

describe("addMonths", () => {
  it("clamps to the last day of a shorter target month", () => {
    expect(addMonths(parseDateOnly("2026-03-31"), -1).toISOString().slice(0, 10)).toBe("2026-02-28")
  })

  it("crosses a year boundary in UTC", () => {
    expect(addMonths(parseDateOnly("2026-01-15"), -12).toISOString().slice(0, 10)).toBe("2025-01-15")
  })
})

describe("completedServiceMonths", () => {
  it("counts only whole months", () => {
    expect(completedServiceMonths(parseDateOnly("2025-08-15"), parseDateOnly("2026-08-14"))).toBe(11)
    expect(completedServiceMonths(parseDateOnly("2025-08-15"), parseDateOnly("2026-08-15"))).toBe(12)
  })

  it("is zero before the joining date rather than negative", () => {
    expect(completedServiceMonths(parseDateOnly("2027-01-01"), parseDateOnly("2026-01-01"))).toBe(0)
  })
})

describe("accrualWindow", () => {
  it("is the twelve months ending on the given date, inclusive", () => {
    const { from, to } = accrualWindow(parseDateOnly("2026-07-29"))
    expect(from.toISOString().slice(0, 10)).toBe("2025-07-30")
    expect(to.toISOString().slice(0, 10)).toBe("2026-07-29")
  })
})

describe("accruedDays", () => {
  it("gives one day per eighteen worked, rounding down", () => {
    expect(accruedDays(17, null)).toBe(0)
    expect(accruedDays(18, null)).toBe(1)
    expect(accruedDays(251, null)).toBe(13)
  })

  it("never exceeds the sixty-day ceiling", () => {
    expect(accruedDays(5000, 60)).toBe(60)
  })
})

describe("countDaysWorked", () => {
  it("counts PRESENT days only — leave, holidays and absences are not work", () => {
    grid([
      { date: "2026-07-01", status: "PRESENT" },
      { date: "2026-07-02", status: "PRESENT" },
      { date: "2026-07-03", status: "WEEKLY_OFF" },
      { date: "2026-07-04", status: "ON_LEAVE" },
      { date: "2026-07-05", status: "ABSENT" },
      { date: "2026-07-06", status: "HOLIDAY" },
    ])

    return expect(
      countDaysWorked(employee, parseDateOnly("2026-07-01"), parseDateOnly("2026-07-06"))
    ).resolves.toEqual({ daysWorked: 2, untrackedDays: 0 })
  })

  it("reports days attendance predates rather than guessing at them", async () => {
    vi.mocked(goLiveDate).mockReturnValue(parseDateOnly("2026-07-03"))
    grid([
      { date: "2026-07-01", status: "NOT_TRACKED" },
      { date: "2026-07-02", status: "NOT_TRACKED" },
      { date: "2026-07-03", status: "PRESENT" },
    ])

    const result = await countDaysWorked(
      employee,
      parseDateOnly("2026-07-01"),
      parseDateOnly("2026-07-03")
    )
    expect(result).toEqual({ daysWorked: 1, untrackedDays: 2 })
  })

  it("does not count days before the employee joined as untracked", async () => {
    vi.mocked(goLiveDate).mockReturnValue(parseDateOnly("2020-01-01"))
    grid([
      { date: "2026-07-01", status: "NOT_TRACKED" },
      { date: "2026-07-02", status: "PRESENT" },
    ])

    const result = await countDaysWorked(
      { ...employee, joiningDate: parseDateOnly("2026-07-02") },
      parseDateOnly("2026-07-01"),
      parseDateOnly("2026-07-02")
    )
    expect(result.untrackedDays).toBe(0)
  })
})

describe("computeEarnedAccrual", () => {
  const policy = { minServiceMonths: 12, maxAccrual: 60 }

  it("accrues nothing and never touches the grid before a year of service", async () => {
    const result = await computeEarnedAccrual(
      { ...employee, joiningDate: parseDateOnly("2026-06-01") },
      parseDateOnly("2026-07-29"),
      policy
    )

    expect(result).toMatchObject({ days: 0, daysWorked: 0, eligible: false })
    // Still reports the window, so the UI can explain a zero rather than
    // showing a bare 0 next to a type the employee can see.
    expect(result.windowStart).toBe("2025-07-30")
    expect(buildDayGrid).not.toHaveBeenCalled()
  })

  it("turns days worked into earned days once eligible", async () => {
    grid(Array.from({ length: 40 }, (_, i) => ({ date: `2026-01-${i}`, status: "PRESENT" })))

    const result = await computeEarnedAccrual(employee, parseDateOnly("2026-07-29"), policy)

    expect(result).toMatchObject({ days: 2, daysWorked: 40, eligible: true })
  })
})
