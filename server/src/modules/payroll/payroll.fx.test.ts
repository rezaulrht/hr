import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    exchangeRate: { findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { parseDateOnly } from "../../utils/dates"
import { pickRate, type RateRow } from "./payroll.fx"
import { resolveRateOrThrow } from "./payroll.fx"
import { dec } from "./payroll.money"

const rate = (value: string, effectiveFrom: string, createdAt = "2026-01-01"): RateRow => ({
  rate: dec(value),
  effectiveFrom: parseDateOnly(effectiveFrom),
  createdAt: new Date(`${createdAt}T00:00:00.000Z`),
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("pickRate", () => {
  it("picks the latest row effective on or before the date", () => {
    const rows = [rate("120.0", "2026-01-01"), rate("122.5", "2026-06-01")]
    expect(pickRate(rows, parseDateOnly("2026-07-31"))?.rate.toFixed(1)).toBe("122.5")
  })

  it("ignores rows effective after the date", () => {
    // "The rate in force then" is a question about history, and answering it
    // with today's row would repay a July payslip at an August rate.
    const rows = [rate("120.0", "2026-01-01"), rate("130.0", "2026-08-01")]
    expect(pickRate(rows, parseDateOnly("2026-07-31"))?.rate.toFixed(1)).toBe("120.0")
  })

  it("includes a row effective exactly on the date", () => {
    const rows = [rate("122.5", "2026-07-31")]
    expect(pickRate(rows, parseDateOnly("2026-07-31"))?.rate.toFixed(1)).toBe("122.5")
  })

  it("returns null when every row is later", () => {
    const rows = [rate("122.5", "2026-08-01")]
    expect(pickRate(rows, parseDateOnly("2026-07-31"))).toBeNull()
  })

  it("returns null for no rows at all", () => {
    expect(pickRate([], parseDateOnly("2026-07-31"))).toBeNull()
  })

  it("breaks a tie on effectiveFrom by the newer createdAt, deterministically", () => {
    // A rule whose answer depends on row order is one that produces a
    // different payslip on a retry.
    const older = rate("120.0", "2026-06-01", "2026-05-01")
    const newer = rate("122.5", "2026-06-01", "2026-05-02")
    expect(pickRate([older, newer], parseDateOnly("2026-07-31"))?.rate.toFixed(1)).toBe("122.5")
    expect(pickRate([newer, older], parseDateOnly("2026-07-31"))?.rate.toFixed(1)).toBe("122.5")
  })
})

describe("resolveRateOrThrow", () => {
  it("returns exactly 1 for BDT without touching the database", async () => {
    // Requiring a BDT→BDT row would make an all-BDT payroll depend on a row
    // nobody has a reason to create.
    const result = await resolveRateOrThrow("BDT", parseDateOnly("2026-07-31"))
    expect(result.equals(dec(1))).toBe(true)
    expect(prisma.exchangeRate.findMany).not.toHaveBeenCalled()
  })

  it("returns the resolved rate for USD", async () => {
    vi.mocked(prisma.exchangeRate.findMany).mockResolvedValue([
      rate("122.5", "2026-01-01"),
    ] as never)
    const result = await resolveRateOrThrow("USD", parseDateOnly("2026-07-31"))
    expect(result.toFixed(1)).toBe("122.5")
  })

  it("queries the canonical direction only — base USD, quote BDT", async () => {
    vi.mocked(prisma.exchangeRate.findMany).mockResolvedValue([
      rate("122.5", "2026-01-01"),
    ] as never)
    await resolveRateOrThrow("USD", parseDateOnly("2026-07-31"))
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ base: "USD", quote: "BDT" }),
      })
    )
  })

  it("throws a 409 rather than defaulting to 1.0 when no row covers the date", async () => {
    // A silent 1.0 pays a USD-salaried employee ~122x too little on a payslip
    // that looks entirely ordinary.
    vi.mocked(prisma.exchangeRate.findMany).mockResolvedValue([])
    await expect(resolveRateOrThrow("USD", parseDateOnly("2026-07-31"))).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it("throws an AppError naming the currency and the date", async () => {
    vi.mocked(prisma.exchangeRate.findMany).mockResolvedValue([])
    const failure = resolveRateOrThrow("USD", parseDateOnly("2026-07-31"))
    await expect(failure).rejects.toBeInstanceOf(AppError)
    await expect(failure).rejects.toThrow(/USD→BDT/)
    await expect(failure).rejects.toThrow(/2026-07-31/)
  })
})
