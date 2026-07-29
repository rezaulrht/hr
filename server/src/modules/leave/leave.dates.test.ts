import { describe, expect, it } from "vitest"

import {
  addDays,
  calendarSpan,
  countLeaveDays,
  formatDateOnly,
  isNonWorkingDay,
  parseDateOnly,
  type LeaveCalendar,
} from "./leave.dates"

/** 2026-08-05 is the seeded July Uprising Day, a Wednesday. */
const withHolidays = (holidays: string[], overrides: string[] = []): LeaveCalendar => ({
  holidayDates: new Set(holidays),
  workingOverrides: new Set(overrides),
})

describe("parseDateOnly", () => {
  it("parses YYYY-MM-DD to UTC midnight", () => {
    const d = parseDateOnly("2026-08-14")
    expect(d.toISOString()).toBe("2026-08-14T00:00:00.000Z")
  })

  it("rejects a malformed string", () => {
    expect(() => parseDateOnly("14/08/2026")).toThrow()
    expect(() => parseDateOnly("2026-13-01")).toThrow()
    expect(() => parseDateOnly("")).toThrow()
  })
})

describe("formatDateOnly", () => {
  it("round-trips with parseDateOnly", () => {
    expect(formatDateOnly(parseDateOnly("2026-08-14"))).toBe("2026-08-14")
  })
})

describe("countLeaveDays", () => {
  // 2026-08-14 is a Friday. Verified: 2026-08-10 is a Monday.
  it("counts a single non-Friday day as 1", () => {
    expect(countLeaveDays(parseDateOnly("2026-08-10"), parseDateOnly("2026-08-10"))).toBe(1)
  })

  it("counts a single Friday as 0", () => {
    expect(countLeaveDays(parseDateOnly("2026-08-14"), parseDateOnly("2026-08-14"))).toBe(0)
  })

  it("skips the Friday inside a Thursday-to-Saturday range", () => {
    // Thu 13th, Fri 14th, Sat 15th -> 2 charged days
    expect(countLeaveDays(parseDateOnly("2026-08-13"), parseDateOnly("2026-08-15"))).toBe(2)
  })

  it("counts a full Mon-Sun week as 6", () => {
    expect(countLeaveDays(parseDateOnly("2026-08-10"), parseDateOnly("2026-08-16"))).toBe(6)
  })

  it("returns 0 for a range that is entirely Fridays", () => {
    expect(countLeaveDays(parseDateOnly("2026-08-14"), parseDateOnly("2026-08-14"))).toBe(0)
  })

  it("skips a gazetted holiday for a type that does not count them (§115/§116)", () => {
    // Mon 3rd – Thu 6th Aug 2026 = 4 days, less Wed 5th (July Uprising Day).
    expect(
      countLeaveDays(parseDateOnly("2026-08-03"), parseDateOnly("2026-08-06"), {
        calendar: withHolidays(["2026-08-05"]),
      })
    ).toBe(3)
  })

  it("charges every calendar day for a holiday-counting type (§117)", () => {
    // The same range, as earned leave: the holiday is part of the leave.
    expect(
      countLeaveDays(parseDateOnly("2026-08-03"), parseDateOnly("2026-08-06"), {
        countsHolidays: true,
        calendar: withHolidays(["2026-08-05"]),
      })
    ).toBe(4)
  })

  it("charges the Friday too for a holiday-counting type", () => {
    // Thu 13th – Sat 15th: 3 as earned leave, 2 as casual or sick.
    const start = parseDateOnly("2026-08-13")
    const end = parseDateOnly("2026-08-15")
    expect(countLeaveDays(start, end, { countsHolidays: true })).toBe(3)
    expect(countLeaveDays(start, end)).toBe(2)
  })

  it("charges a Friday that a WORKING_DAY order restored", () => {
    // 2026-05-23 is a Saturday the cabinet declared a working day. Using a
    // real Friday here instead: an override cancels the weekly off.
    expect(
      countLeaveDays(parseDateOnly("2026-08-14"), parseDateOnly("2026-08-14"), {
        calendar: withHolidays([], ["2026-08-14"]),
      })
    ).toBe(1)
  })

  it("returns 0 when a range is entirely weekly offs and holidays", () => {
    // Fri 14th + a holiday declared on Sat 15th.
    expect(
      countLeaveDays(parseDateOnly("2026-08-14"), parseDateOnly("2026-08-15"), {
        calendar: withHolidays(["2026-08-15"]),
      })
    ).toBe(0)
  })
})

describe("isNonWorkingDay", () => {
  it("treats a gazetted holiday as non-working even on a normal weekday", () => {
    expect(isNonWorkingDay(parseDateOnly("2026-08-05"), withHolidays(["2026-08-05"]))).toBe(true)
  })

  it("keeps a holiday off even when a WORKING_DAY order shares the date", () => {
    // The override only cancels the weekly off. A gazetted holiday on the
    // same date still takes the day.
    expect(
      isNonWorkingDay(parseDateOnly("2026-08-05"), withHolidays(["2026-08-05"], ["2026-08-05"]))
    ).toBe(true)
  })
})

describe("calendarSpan", () => {
  it("is inclusive of both endpoints and ignores Fridays", () => {
    expect(calendarSpan(parseDateOnly("2026-08-13"), parseDateOnly("2026-08-15"))).toBe(3)
    expect(calendarSpan(parseDateOnly("2026-08-10"), parseDateOnly("2026-08-10"))).toBe(1)
  })
})

describe("addDays", () => {
  it("adds and subtracts days in UTC", () => {
    expect(formatDateOnly(addDays(parseDateOnly("2026-08-14"), 3))).toBe("2026-08-17")
    expect(formatDateOnly(addDays(parseDateOnly("2026-08-01"), -1))).toBe("2026-07-31")
  })
})
