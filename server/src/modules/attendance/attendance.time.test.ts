import { afterEach, describe, expect, it, vi } from "vitest"

import * as time from "./attendance.time"

/**
 * Loads the module fresh with the server running in a given timezone.
 *
 * The point of the exercise: `Intl.DateTimeFormat` is constructed at module
 * load, so if it ever stopped passing an explicit `timeZone`, it would
 * silently inherit whatever the host is set to — and these tests are the
 * only thing that would notice.
 */
async function loadUnderTz(tz: string): Promise<typeof time> {
  process.env.TZ = tz
  vi.resetModules()
  return import("./attendance.time")
}

const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ
  vi.resetModules()
})

describe("office date and time, under any server timezone", () => {
  // 09:15 on Sunday 2 August 2026 in Dhaka (UTC+6).
  const MORNING_CHECK_IN = new Date("2026-08-02T03:15:00.000Z")
  // 00:30 on Monday 3 August 2026 in Dhaka — someone working past midnight.
  const AFTER_MIDNIGHT = new Date("2026-08-02T18:30:00.000Z")

  // US-East is the one that matters: it is the default region on Vercel,
  // Fly and Render, and there a 09:15 Dhaka arrival reads as 23:15 the
  // previous day. Every ordinary morning check-in would file under the
  // wrong date — not an edge case, the entire dataset.
  const SERVER_TIMEZONES = ["UTC", "Asia/Dhaka", "America/New_York"]

  describe.each(SERVER_TIMEZONES)("with TZ=%s", (tz) => {
    it("files a morning check-in under the office's calendar date", async () => {
      const { officeDateOf } = await loadUnderTz(tz)
      expect(officeDateOf(MORNING_CHECK_IN).toISOString()).toBe("2026-08-02T00:00:00.000Z")
    })

    it("reads the office wall-clock time, not the server's", async () => {
      const { officeTimeOf } = await loadUnderTz(tz)
      expect(officeTimeOf(MORNING_CHECK_IN)).toBe("09:15")
    })

    it("rolls a past-midnight instant into the next office day", async () => {
      const { officeDateOf, officeTimeOf } = await loadUnderTz(tz)
      expect(officeDateOf(AFTER_MIDNIGHT).toISOString()).toBe("2026-08-03T00:00:00.000Z")
      expect(officeTimeOf(AFTER_MIDNIGHT)).toBe("00:30")
    })
  })

  it("renders office midnight as 00:00, never 24:00", async () => {
    // Without hourCycle "h23", some Node versions render this as "24:00",
    // which sorts after every other time and would make a midnight arrival
    // look like the latest of the day.
    const { officeTimeOf } = await loadUnderTz("UTC")
    expect(officeTimeOf(new Date("2026-08-01T18:00:00.000Z"))).toBe("00:00")
  })

  it("returns the same date in every timezone for the same instant", async () => {
    const results = await Promise.all(
      SERVER_TIMEZONES.map(async (tz) => {
        const { officeDateOf } = await loadUnderTz(tz)
        return officeDateOf(MORNING_CHECK_IN).toISOString()
      })
    )
    expect(new Set(results).size).toBe(1)
  })
})

describe("officeToday", () => {
  it("is the office date of now", () => {
    expect(time.officeToday().toISOString()).toBe(time.officeDateOf(new Date()).toISOString())
  })

  it("is a UTC-midnight date", () => {
    expect(time.officeToday().toISOString()).toMatch(/T00:00:00\.000Z$/)
  })
})

describe("addMinutesToTime", () => {
  it("adds the grace window to a shift start", () => {
    expect(time.addMinutesToTime("09:00", 15)).toBe("09:15")
  })

  it("carries into the next hour", () => {
    expect(time.addMinutesToTime("09:50", 15)).toBe("10:05")
  })

  it("clamps at 23:59 instead of wrapping past midnight", () => {
    // Wrapping would produce "00:10", which compares as earlier than every
    // arrival and would silently mark the whole day on time.
    expect(time.addMinutesToTime("23:55", 15)).toBe("23:59")
  })
})

describe("subtractMinutesFromTime", () => {
  it("backs the grace window off a shift end", () => {
    expect(time.subtractMinutesFromTime("18:00", 15)).toBe("17:45")
  })

  it("borrows from the previous hour", () => {
    expect(time.subtractMinutesFromTime("18:05", 15)).toBe("17:50")
  })

  it("clamps at 00:00", () => {
    expect(time.subtractMinutesFromTime("00:05", 15)).toBe("00:00")
  })
})

describe("time strings sort chronologically", () => {
  it("compares as strings because HH:mm is zero-padded", () => {
    // This is what makes the lateness check a plain `>` comparison.
    expect("09:15" > "09:00").toBe(true)
    expect("09:16" > "09:15").toBe(true)
    expect("09:15" > "09:15").toBe(false)
    expect("10:00" > "09:59").toBe(true)
  })
})

describe("toMinutes", () => {
  it("converts a wall-clock time to minutes since midnight", () => {
    expect(time.toMinutes("00:00")).toBe(0)
    expect(time.toMinutes("09:15")).toBe(555)
    expect(time.toMinutes("23:59")).toBe(1439)
  })

  it.each(["9:00", "24:00", "09:60", "0900", "", "nine"])("rejects %o", (bad) => {
    expect(() => time.toMinutes(bad)).toThrow(/HH:mm/)
  })
})

describe("elapsedHours", () => {
  it("measures a full shift span including the break", () => {
    expect(
      time.elapsedHours(new Date("2026-08-02T03:00:00Z"), new Date("2026-08-02T12:00:00Z"))
    ).toBe(9)
  })

  it("rounds to two decimals", () => {
    expect(
      time.elapsedHours(new Date("2026-08-02T03:00:00Z"), new Date("2026-08-02T11:10:00Z"))
    ).toBe(8.17)
  })

  it("is negative when the arguments are reversed, so callers must guard", () => {
    expect(
      time.elapsedHours(new Date("2026-08-02T12:00:00Z"), new Date("2026-08-02T03:00:00Z"))
    ).toBe(-9)
  })
})

describe("module constants", () => {
  it("holds the thresholds the service depends on", () => {
    expect(time.MAX_OPEN_SHIFT_HOURS).toBe(18)
    expect(time.MAX_REGULARISE_DAYS).toBe(14)
    expect(time.AGING_WARN_DAYS).toBe(3)
  })
})
