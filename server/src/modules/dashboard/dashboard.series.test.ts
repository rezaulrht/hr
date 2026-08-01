import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/env", () => ({
  env: { APP_TIMEZONE: "Asia/Dhaka", ATTENDANCE_GO_LIVE: "2026-01-01" },
}))

vi.mock("../../config/prisma", () => ({
  default: {
    employee: { findMany: vi.fn() },
    payrollRun: { findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { Prisma } from "../../generated/prisma/client"
import { parseDateOnly } from "../../utils/dates"
import { headcountSeries, lastMonths, payrollSeries } from "./dashboard.series"

// Midday Dhaka on 15 August 2026.
const NOW = new Date("2026-08-15T06:00:00.000Z")

const dec = (n: string) => new Prisma.Decimal(n)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("lastMonths", () => {
  it("returns the six months ending with the current one, oldest first", () => {
    const months = lastMonths(6)
    expect(months.map((m) => `${m.year}-${m.month}`)).toEqual([
      "2026-3",
      "2026-4",
      "2026-5",
      "2026-6",
      "2026-7",
      "2026-8",
    ])
  })

  it("crosses the year boundary backwards", () => {
    const months = lastMonths(3, parseDateOnly("2026-02-10"))
    expect(months.map((m) => `${m.year}-${m.month}`)).toEqual(["2025-12", "2026-1", "2026-2"])
  })

  it("ends each month at its own last instant", () => {
    const [feb] = lastMonths(1, parseDateOnly("2026-02-10"))
    expect(feb.end.toISOString()).toBe("2026-02-28T23:59:59.999Z")
  })
})

describe("headcountSeries", () => {
  it("counts who had joined and had not left, at each month end", () => {
    // Derived rather than stored. `employmentStatus` is current-state and
    // would report a leaver as absent from every month in the series,
    // including the ones they actually worked.
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      { joiningDate: parseDateOnly("2020-01-01"), lastWorkingDay: null },
      { joiningDate: parseDateOnly("2020-01-01"), lastWorkingDay: null },
      // Joined in June, so absent from the March–May points.
      { joiningDate: parseDateOnly("2026-06-10"), lastWorkingDay: null },
      // Left in April, so present in March and April only.
      { joiningDate: parseDateOnly("2020-01-01"), lastWorkingDay: parseDateOnly("2026-04-30") },
    ] as never)

    return headcountSeries(6).then((series) => {
      // Raw counts: 3, 3, 2, 3, 3, 3 → max 3 → scaled to 100/100/67/100…
      expect(series).toEqual([100, 100, 67, 100, 100, 100])
    })
  })

  it("returns an empty series when there are no employees at all", async () => {
    // Callers omit `trend` rather than sending an array of zeros.
    vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never)
    await expect(headcountSeries(6)).resolves.toEqual([])
  })

  it("counts someone whose last working day is the month end itself", async () => {
    // The last working day is worked.
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      { joiningDate: parseDateOnly("2020-01-01"), lastWorkingDay: parseDateOnly("2026-08-31") },
    ] as never)
    await expect(headcountSeries(1)).resolves.toEqual([100])
  })
})

describe("payrollSeries", () => {
  function stubRuns(runs: Array<{ month: number; year: number; totals: string[] }>) {
    vi.mocked(prisma.payrollRun.findMany).mockResolvedValue(
      runs.map((r) => ({
        month: r.month,
        year: r.year,
        payslips: r.totals.map((t) => ({ netPayableBdt: dec(t) })),
      })) as never
    )
  }

  it("sums net payable per month and labels the bars", async () => {
    stubRuns([
      { month: 7, year: 2026, totals: ["500000", "400000"] },
      { month: 8, year: 2026, totals: ["1000000"] },
    ])

    const bars = await payrollSeries(6)
    expect(bars).toHaveLength(6)
    expect(bars.map((b) => b.label)).toEqual(["Mar", "Apr", "May", "Jun", "Jul", "Aug"])
    expect(bars[4].display).toBe("৳9L")
    expect(bars[5].display).toBe("৳10L")
    expect(bars[5].height).toBe(100)
  })

  it("keeps a month with no run as a labelled zero bar, not a hole", async () => {
    // A gap in the axis is information — nobody was paid that month — and
    // closing it silently draws a continuous line through the fact.
    stubRuns([{ month: 8, year: 2026, totals: ["1000000"] }])

    const bars = await payrollSeries(6)
    expect(bars).toHaveLength(6)
    expect(bars[0]).toEqual({ label: "Mar", display: "", height: 0 })
  })

  it("gives an empty display rather than ৳0 for a month nobody was paid in", async () => {
    // "৳0" is a claim that payroll ran and came to nothing.
    stubRuns([])
    const bars = await payrollSeries(3)
    expect(bars.every((b) => b.display === "")).toBe(true)
    expect(bars.every((b) => b.height === 0)).toBe(true)
  })

  it("only counts runs that reached the bank", async () => {
    stubRuns([])
    await payrollSeries(6)
    expect(vi.mocked(prisma.payrollRun.findMany).mock.calls[0][0]?.where).toMatchObject({
      status: { in: ["APPROVED", "DISBURSED"] },
    })
  })

  it("asks only for the months in the window", async () => {
    stubRuns([])
    await payrollSeries(3)
    const where = vi.mocked(prisma.payrollRun.findMany).mock.calls[0][0]?.where as {
      OR: Array<{ month: number; year: number }>
    }
    expect(where.OR).toEqual([
      { month: 6, year: 2026 },
      { month: 7, year: 2026 },
      { month: 8, year: 2026 },
    ])
  })
})
