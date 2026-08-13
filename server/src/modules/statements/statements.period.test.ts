import { describe, expect, it } from "vitest"

import { utcDate } from "../accounting/accounting.utils"
import { assertValidRange, describeRange, shiftBackOneYear } from "./statements.period"

const range = (from: Date, to: Date) => ({ from, to })

describe("shiftBackOneYear", () => {
  it("shifts a calendar month back a year", () => {
    const prior = shiftBackOneYear(range(utcDate(2026, 7, 1), utcDate(2026, 7, 31)))

    expect(prior.from.toISOString()).toBe("2025-07-01T00:00:00.000Z")
    expect(prior.to.toISOString()).toBe("2025-07-31T00:00:00.000Z")
  })

  it("shifts a full financial year back a year", () => {
    const prior = shiftBackOneYear(range(utcDate(2026, 7, 1), utcDate(2027, 6, 30)))

    expect(prior.from.toISOString()).toBe("2025-07-01T00:00:00.000Z")
    expect(prior.to.toISOString()).toBe("2026-06-30T00:00:00.000Z")
  })

  it("clamps 29 February to 28 February in a common year", () => {
    const prior = shiftBackOneYear(range(utcDate(2028, 2, 1), utcDate(2028, 2, 29)))

    expect(prior.to.toISOString()).toBe("2027-02-28T00:00:00.000Z")
  })

  it("leaves 29 February alone when the prior year is also a leap year", () => {
    const prior = shiftBackOneYear(range(utcDate(2028, 2, 29), utcDate(2028, 2, 29)))

    // 2027 is not a leap year, so this still clamps — the guard is on the
    // target year, not the source.
    expect(prior.to.toISOString()).toBe("2027-02-28T00:00:00.000Z")
  })

  it("clamps 31 March to 31 March, not to 30", () => {
    const prior = shiftBackOneYear(range(utcDate(2026, 3, 31), utcDate(2026, 3, 31)))

    expect(prior.to.toISOString()).toBe("2025-03-31T00:00:00.000Z")
  })

  it("handles a custom range that crosses a financial-year boundary", () => {
    const prior = shiftBackOneYear(range(utcDate(2026, 5, 15), utcDate(2026, 8, 20)))

    expect(prior.from.toISOString()).toBe("2025-05-15T00:00:00.000Z")
    expect(prior.to.toISOString()).toBe("2025-08-20T00:00:00.000Z")
  })

  it("handles a single-day range", () => {
    const prior = shiftBackOneYear(range(utcDate(2026, 7, 31), utcDate(2026, 7, 31)))

    expect(prior.from.toISOString()).toBe("2025-07-31T00:00:00.000Z")
    expect(prior.from.getTime()).toBe(prior.to.getTime())
  })

  it("does not mutate the range it was given", () => {
    const original = range(utcDate(2026, 7, 1), utcDate(2026, 7, 31))
    shiftBackOneYear(original)

    expect(original.from.toISOString()).toBe("2026-07-01T00:00:00.000Z")
  })
})

describe("assertValidRange", () => {
  it("accepts a normal range", () => {
    expect(() => assertValidRange(range(utcDate(2026, 7, 1), utcDate(2026, 7, 31)))).not.toThrow()
  })

  it("accepts a single-day range", () => {
    expect(() => assertValidRange(range(utcDate(2026, 7, 1), utcDate(2026, 7, 1)))).not.toThrow()
  })

  it("400s when the end date precedes the start", () => {
    expect(() => assertValidRange(range(utcDate(2026, 7, 31), utcDate(2026, 7, 1)))).toThrow(
      /before/i
    )
  })

  it("400s on a range longer than five years", () => {
    expect(() =>
      assertValidRange(range(utcDate(2020, 1, 1), utcDate(2026, 1, 1)))
    ).toThrow(/five years/i)
  })
})

describe("describeRange", () => {
  it("names a whole calendar month", () => {
    expect(describeRange(range(utcDate(2026, 7, 1), utcDate(2026, 7, 31)))).toBe("July 2026")
  })

  it("names a whole calendar year as a month span", () => {
    expect(describeRange(range(utcDate(2026, 7, 1), utcDate(2027, 6, 30)))).toBe(
      "Jul 2026 – Jun 2027"
    )
  })

  it("falls back to full dates for a partial range", () => {
    expect(describeRange(range(utcDate(2026, 3, 3), utcDate(2026, 4, 17)))).toBe(
      "3 Mar 2026 – 17 Apr 2026"
    )
  })
})
