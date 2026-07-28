import { describe, expect, it } from "vitest"

import {
  addDays,
  calendarSpan,
  countLeaveDays,
  formatDateOnly,
  parseDateOnly,
} from "./leave.dates"

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
