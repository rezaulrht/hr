import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Pin the tracking floor rather than inheriting whatever the deployment
// .env happens to say. A unit test of the go-live rule must not change
// meaning when somebody rolls the real rollout date forward.
vi.mock("../../config/env", () => ({
  env: { APP_TIMEZONE: "Asia/Dhaka", ATTENDANCE_GO_LIVE: "2026-08-01" },
}))

vi.mock("../../config/prisma", () => ({
  default: {
    attendance: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    shift: { findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import type { Attendance, Holiday, Shift } from "../../generated/prisma/client"
import { parseDateOnly } from "../../utils/dates"
import {
  buildDayGrid,
  eachDate,
  resolveGrid,
  resolveShift,
  shiftInfo,
} from "./attendance.grid"
import type { AttendanceDay, GridEmployee } from "./attendance.types"

// August 2026: the 1st and 15th are Saturdays, so the 7th and 14th are the
// Fridays. Go-live is 2026-08-01 (from .env), and "now" is midday Dhaka on
// the 15th — a working day that has not finished yet.
const NOW = new Date("2026-08-15T06:00:00.000Z")
const FROM = parseDateOnly("2026-08-01")
const TO = parseDateOnly("2026-08-15")

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

function employee(overrides: Partial<GridEmployee> = {}): GridEmployee {
  return {
    id: "emp-1",
    joiningDate: parseDateOnly("2024-01-06"),
    employmentStatus: "ACTIVE",
    shiftId: null,
    ...overrides,
  }
}

function attendanceRow(date: string, overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: `att-${date}`,
    employeeId: "emp-1",
    date: parseDateOnly(date),
    checkIn: new Date(`${date}T03:05:00.000Z`),
    checkOut: new Date(`${date}T12:10:00.000Z`),
    workedHours: 9.08,
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

function holiday(date: string, name: string, type: Holiday["type"] = "GENERAL"): Holiday {
  return { id: `hol-${date}-${name}`, name, date: parseDateOnly(date), type }
}

function grid(
  sources: Partial<Parameters<typeof resolveGrid>[3]> = {},
  emp: GridEmployee = employee()
): Map<string, AttendanceDay[]> {
  return resolveGrid([emp], FROM, TO, {
    attendances: [],
    leaves: [],
    holidays: [],
    shifts: [GENERAL],
    ...sources,
  })
}

function dayOn(days: AttendanceDay[], date: string): AttendanceDay {
  const found = days.find((d) => d.date === date)
  if (!found) throw new Error(`no grid entry for ${date}`)
  return found
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("eachDate", () => {
  it("is inclusive at both ends", () => {
    expect(eachDate(parseDateOnly("2026-08-01"), parseDateOnly("2026-08-03"))).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ])
  })

  it("returns a single date when start equals end", () => {
    expect(eachDate(FROM, FROM)).toEqual(["2026-08-01"])
  })
})

describe("shiftInfo", () => {
  it("reports the elapsed span, break included", () => {
    // 09:00-18:00 is 9 hours with the 1h lunch inside it. Nothing subtracts
    // breakMinutes, so the expectation and the measurement are both elapsed.
    expect(shiftInfo(GENERAL).expectedHours).toBe(9)
  })
})

describe("status precedence", () => {
  it("marks a past working day with no record ABSENT", () => {
    const days = grid().get("emp-1")!
    expect(dayOn(days, "2026-08-03").status).toBe("ABSENT")
    expect(dayOn(days, "2026-08-03").isWorkingDay).toBe(true)
  })

  it("marks today with no record NOT_CHECKED_IN, not ABSENT", () => {
    // Otherwise the daily board reports the whole company absent at 10am.
    expect(dayOn(grid().get("emp-1")!, "2026-08-15").status).toBe("NOT_CHECKED_IN")
  })

  it("marks the weekly off day WEEKLY_OFF", () => {
    const day = dayOn(grid().get("emp-1")!, "2026-08-07")
    expect(day.status).toBe("WEEKLY_OFF")
    expect(day.isWorkingDay).toBe(false)
    expect(day.expectedHours).toBe(0)
  })

  it("marks a holiday HOLIDAY and names it", () => {
    const days = grid({ holidays: [holiday("2026-08-05", "July Uprising Day")] }).get("emp-1")!
    expect(dayOn(days, "2026-08-05")).toMatchObject({
      status: "HOLIDAY",
      detail: "July Uprising Day",
      isWorkingDay: false,
    })
  })

  it("joins two holidays that share a date", () => {
    // 2026-05-01 is both May Day and Buddha Purnima — the pair that forced
    // Holiday to be unique on (date, name) rather than on date.
    const days = grid({
      holidays: [holiday("2026-08-05", "May Day"), holiday("2026-08-05", "Buddha Purnima")],
    }).get("emp-1")!
    expect(dayOn(days, "2026-08-05").detail).toBe("May Day · Buddha Purnima")
  })

  it("marks an approved leave day ON_LEAVE and names the type", () => {
    const days = grid({
      leaves: [
        {
          employeeId: "emp-1",
          startDate: parseDateOnly("2026-08-03"),
          endDate: parseDateOnly("2026-08-04"),
          leaveType: { name: "Sick" },
        },
      ],
    }).get("emp-1")!
    expect(dayOn(days, "2026-08-03")).toMatchObject({ status: "ON_LEAVE", detail: "Sick" })
    expect(dayOn(days, "2026-08-04").status).toBe("ON_LEAVE")
  })

  it("marks a day with a record PRESENT", () => {
    const days = grid({ attendances: [attendanceRow("2026-08-03")] }).get("emp-1")!
    expect(dayOn(days, "2026-08-03")).toMatchObject({ status: "PRESENT", workedHours: 9.08 })
  })
})

describe("precedence inversions", () => {
  it("lets a check-in beat a holiday", () => {
    // Physical facts beat records. Blocking a holiday check-in would leave
    // someone who genuinely came in unable to record real work — and this
    // is the record the compensatory-holiday rule will later need.
    const days = grid({
      attendances: [attendanceRow("2026-08-05")],
      holidays: [holiday("2026-08-05", "July Uprising Day")],
    }).get("emp-1")!
    const day = dayOn(days, "2026-08-05")
    expect(day.status).toBe("PRESENT")
    // Worked, but still not a day the roster scheduled.
    expect(day.isWorkingDay).toBe(false)
    expect(day.isOffDay).toBe(true)
  })

  it("lets a check-in beat the weekly off", () => {
    const days = grid({ attendances: [attendanceRow("2026-08-07")] }).get("emp-1")!
    expect(dayOn(days, "2026-08-07")).toMatchObject({
      status: "PRESENT",
      isWorkingDay: false,
      isOffDay: true,
    })
  })

  it("lets approved leave outrank the weekly off", () => {
    const days = grid({
      leaves: [
        {
          employeeId: "emp-1",
          startDate: parseDateOnly("2026-08-06"),
          endDate: parseDateOnly("2026-08-08"),
          leaveType: { name: "Annual" },
        },
      ],
    }).get("emp-1")!
    expect(dayOn(days, "2026-08-07").status).toBe("ON_LEAVE")
    // …but the Friday still is not a working day, so it cannot be counted
    // as leave consumed against the roster.
    expect(dayOn(days, "2026-08-07").isWorkingDay).toBe(false)
  })

  it("treats a REJECTED record as no attendance at all", () => {
    const days = grid({
      attendances: [attendanceRow("2026-08-03", { approval: "REJECTED" })],
    }).get("emp-1")!
    expect(dayOn(days, "2026-08-03").status).toBe("ABSENT")
  })

  it("still counts a PENDING record as present", () => {
    // The person was there. Whether a manager has looked at it yet is a
    // separate question, tracked as pendingApproval.
    const days = grid({
      attendances: [attendanceRow("2026-08-03", { approval: "PENDING" })],
    }).get("emp-1")!
    expect(dayOn(days, "2026-08-03").status).toBe("PRESENT")
  })
})

describe("WORKING_DAY holiday override", () => {
  it("turns a weekly off into a working day", () => {
    // The cabinet cancelled the weekly holiday on 2026-05-23 when it
    // extended Eid-ul-Azha. A calendar that could only take days away
    // could not express that.
    const days = grid({
      holidays: [holiday("2026-08-07", "Weekly holiday cancelled", "WORKING_DAY")],
    }).get("emp-1")!
    const day = dayOn(days, "2026-08-07")
    expect(day.status).toBe("ABSENT")
    expect(day.isWorkingDay).toBe(true)
    expect(day.expectedHours).toBe(9)
  })
})

describe("tracking window", () => {
  it("marks everything before go-live NOT_TRACKED", () => {
    // The failure this prevents: staff who joined years ago would otherwise
    // show ABSENT for every working day before the system existed.
    const days = resolveGrid([employee()], parseDateOnly("2026-07-20"), TO, {
      attendances: [],
      leaves: [],
      holidays: [],
      shifts: [GENERAL],
    }).get("emp-1")!

    const july = days.filter((d) => d.date < "2026-08-01")
    expect(july.length).toBe(12)
    expect(july.every((d) => d.status === "NOT_TRACKED")).toBe(true)
    expect(july.every((d) => !d.isWorkingDay && d.expectedHours === 0)).toBe(true)
    expect(days.filter((d) => d.status === "ABSENT").length).toBeGreaterThan(0)
  })

  it("marks everything before the joining date NOT_TRACKED", () => {
    const days = grid({}, employee({ joiningDate: parseDateOnly("2026-08-10") })).get("emp-1")!
    expect(dayOn(days, "2026-08-03").status).toBe("NOT_TRACKED")
    expect(dayOn(days, "2026-08-10").status).toBe("ABSENT")
  })

  it("stops tracking someone who has left, from today forward", () => {
    // Employee carries no exit date in the schema, only employmentStatus,
    // so this is the best available guard against accruing absences
    // forever for somebody who has gone.
    const days = grid({}, employee({ employmentStatus: "RESIGNED" })).get("emp-1")!
    expect(dayOn(days, "2026-08-03").status).toBe("ABSENT")
    expect(dayOn(days, "2026-08-15").status).toBe("NOT_TRACKED")
  })
})

describe("resolveShift", () => {
  const ramadan: Shift = {
    ...GENERAL,
    id: "shift-ramadan",
    name: "Ramadan",
    startTime: "09:00",
    endTime: "15:30",
    effectiveFrom: parseDateOnly("2027-02-08"),
    effectiveTo: parseDateOnly("2027-03-09"),
  }

  it("returns the dated shift inside its window", () => {
    expect(resolveShift(employee(), parseDateOnly("2027-02-20"), [GENERAL, ramadan]).name).toBe(
      "Ramadan"
    )
  })

  it("returns the standing shift outside the window", () => {
    expect(resolveShift(employee(), parseDateOnly("2027-04-01"), [GENERAL, ramadan]).name).toBe(
      "General"
    )
  })

  it("is inclusive at both window boundaries", () => {
    expect(resolveShift(employee(), parseDateOnly("2027-02-08"), [GENERAL, ramadan]).name).toBe(
      "Ramadan"
    )
    expect(resolveShift(employee(), parseDateOnly("2027-03-09"), [GENERAL, ramadan]).name).toBe(
      "Ramadan"
    )
  })

  it("prefers the narrowest window when two overlap", () => {
    const eidWeek: Shift = {
      ...ramadan,
      id: "shift-eid",
      name: "Eid week",
      effectiveFrom: parseDateOnly("2027-03-01"),
      effectiveTo: parseDateOnly("2027-03-07"),
    }
    expect(
      resolveShift(employee(), parseDateOnly("2027-03-03"), [GENERAL, ramadan, eidWeek]).name
    ).toBe("Eid week")
  })

  it("prefers an assigned shift over the General fallback", () => {
    const nightish: Shift = { ...GENERAL, id: "shift-early", name: "Early", startTime: "07:00" }
    expect(
      resolveShift(employee({ shiftId: "shift-early" }), FROM, [GENERAL, nightish]).name
    ).toBe("Early")
  })

  it("throws a legible error when the seed has not been run", () => {
    expect(() => resolveShift(employee(), FROM, [])).toThrow(/run the seed/)
  })

  it("applies a dated shift's hours to the grid's expectation", () => {
    const shortDay: Shift = {
      ...GENERAL,
      id: "shift-short",
      name: "Short",
      endTime: "15:00",
      effectiveFrom: parseDateOnly("2026-08-03"),
      effectiveTo: parseDateOnly("2026-08-04"),
    }
    const days = grid({ shifts: [GENERAL, shortDay] }).get("emp-1")!
    expect(dayOn(days, "2026-08-03").expectedHours).toBe(6)
    expect(dayOn(days, "2026-08-06").expectedHours).toBe(9)
  })
})

describe("buildDayGrid query budget", () => {
  it("issues a fixed number of queries regardless of headcount", async () => {
    // The naive per-employee implementation is over a thousand round trips
    // for 500 people on one monthly summary — a cost that would get blamed
    // on the derived design when it is really just the loop. This assertion
    // is the only thing that catches the regression.
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])
    vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
    vi.mocked(prisma.shift.findMany).mockResolvedValue([GENERAL])

    const fifty = Array.from({ length: 50 }, (_, i) => employee({ id: `emp-${i}` }))
    const result = await buildDayGrid(fifty, FROM, TO)

    expect(result.size).toBe(50)
    expect(prisma.attendance.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.holiday.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.shift.findMany).toHaveBeenCalledTimes(1)
  })

  it("queries nothing at all for an empty roster", async () => {
    expect((await buildDayGrid([], FROM, TO)).size).toBe(0)
    expect(prisma.attendance.findMany).not.toHaveBeenCalled()
  })
})
