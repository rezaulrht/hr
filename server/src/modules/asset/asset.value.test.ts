import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    asset: { findMany: vi.fn() },
    assetDepreciation: { findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { assetValueReport } from "./asset.value"

const p = prisma as unknown as {
  asset: { findMany: ReturnType<typeof vi.fn> }
  assetDepreciation: { findMany: ReturnType<typeof vi.fn> }
}

const bdtLaptop = {
  id: "a-1",
  assetTag: "BS-AST-00001",
  name: "ThinkPad T14",
  currency: "BDT",
  purchaseCost: "85000.00",
  purchaseCostBdt: "85000.00",
  fxRateToBdt: "1.000000",
  capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
  category: { name: "Laptop" },
}

const usdLaptop = {
  id: "a-2",
  assetTag: "BS-AST-00002",
  name: "MacBook",
  currency: "USD",
  purchaseCost: "1000.00",
  purchaseCostBdt: "122500.00",
  fxRateToBdt: "122.500000",
  capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
  category: { name: "Laptop" },
}

const uncapitalisedChair = {
  id: "a-3",
  assetTag: "BS-AST-00003",
  name: "Office chair",
  currency: "BDT",
  purchaseCost: null,
  purchaseCostBdt: null,
  fxRateToBdt: null,
  capitalisedAt: null,
  category: { name: "Furniture" },
}

beforeEach(() => {
  vi.clearAllMocks()
  p.asset.findMany.mockResolvedValue([bdtLaptop])
  p.assetDepreciation.findMany.mockResolvedValue([
    { assetId: "a-1", amount: "24000.00" },
  ])
})

describe("assetValueReport", () => {
  it("derives book value as cost minus charges, never from a formula", async () => {
    const report = await assetValueReport({})

    expect(report.rows[0]).toMatchObject({
      assetId: "a-1",
      purchaseCost: "85000.00",
      accumulated: "24000.00",
      bookValue: "61000.00",
      status: "VALUED",
    })
  })

  /** The phase-1 rule, restated because it is the one most likely to be
   *  "simplified": zero and "we do not know" are different answers, and
   *  conflating them makes the total wrong. */
  it("reports unknown, not zero, when the purchase cost is missing", async () => {
    p.asset.findMany.mockResolvedValue([{ ...bdtLaptop, purchaseCost: null, purchaseCostBdt: null, fxRateToBdt: null }])

    const report = await assetValueReport({})
    expect(report.rows[0]).toMatchObject({ bookValue: null, status: "UNKNOWN" })
  })

  it("excludes unknown rows from the totals rather than counting them as zero", async () => {
    p.asset.findMany.mockResolvedValue([
      bdtLaptop,
      { ...bdtLaptop, id: "a-9", assetTag: "BS-AST-00009", purchaseCost: null, purchaseCostBdt: null, fxRateToBdt: null },
    ])

    const report = await assetValueReport({})

    const bdt = report.totals.find((t) => t.currency === "BDT")!
    expect(bdt.purchaseCost).toBe("85000.00")
    expect(bdt.bookValue).toBe("61000.00")
  })

  it("totals per currency and never sums BDT with USD", async () => {
    p.asset.findMany.mockResolvedValue([bdtLaptop, usdLaptop])
    p.assetDepreciation.findMany.mockResolvedValue([
      { assetId: "a-1", amount: "24000.00" },
      { assetId: "a-2", amount: "20000.00" },
    ])

    const report = await assetValueReport({})

    expect(report.totals).toHaveLength(2)
    expect(report.totals.map((t) => t.currency).sort()).toEqual(["BDT", "USD"])
  })

  it("reports a USD asset's BDT figure at the rate frozen on it, not today's", async () => {
    p.asset.findMany.mockResolvedValue([usdLaptop])
    p.assetDepreciation.findMany.mockResolvedValue([{ assetId: "a-2", amount: "20000.00" }])

    const report = await assetValueReport({})

    expect(report.rows[0]).toMatchObject({
      currency: "USD",
      purchaseCost: "122500.00", // 1,000 × 122.50, frozen at capitalisation
      bookValue: "102500.00",
    })
  })

  it("marks an uncapitalised asset NOT_CAPITALISED", async () => {
    p.asset.findMany.mockResolvedValue([uncapitalisedChair])

    const report = await assetValueReport({})

    expect(report.rows[0]).toMatchObject({ status: "NOT_CAPITALISED", bookValue: null })
  })
})
