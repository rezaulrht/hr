import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    accountingPeriod: { findFirst: vi.fn() },
    asset: { findMany: vi.fn() },
    postingRule: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { depreciationPreflight } from "./depreciation.preflight"

const p = prisma as unknown as {
  accountingPeriod: { findFirst: ReturnType<typeof vi.fn> }
  asset: { findMany: ReturnType<typeof vi.fn> }
  postingRule: { findMany: ReturnType<typeof vi.fn> }
  account: { findMany: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  p.accountingPeriod.findFirst.mockResolvedValue({ status: "OPEN" })
  p.asset.findMany.mockResolvedValue([])
  p.postingRule.findMany.mockResolvedValue([
    { key: "LAPTOP", account: { code: "1114" } },
    { key: "FURNITURE", account: { code: "1111" } },
    { key: "VEHICLE", account: { code: "1115" } },
  ])
  p.account.findMany.mockResolvedValue([
    { code: "1114", depreciationRate: null, contraAccountId: null },
    { code: "1111", depreciationRate: null, contraAccountId: null },
    { code: "1115", depreciationRate: null, contraAccountId: null },
  ])
})

describe("depreciationPreflight", () => {
  it("blocks on a closed target period", async () => {
    p.accountingPeriod.findFirst.mockResolvedValue({ status: "CLOSED" })

    const result = await depreciationPreflight({ year: 2026, month: 7 })

    expect(result.ok).toBe(false)
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0].message).toMatch(/closed/i)
  })

  it("blocks on a PPE class with no rate, naming the account", async () => {
    p.asset.findMany.mockResolvedValue([
      {
        id: "a-1", assetTag: "BS-AST-00001", purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
        purchaseCostBdt: null, capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
        category: { code: "VEHICLE", isConsumable: false },
      },
    ])
    p.accountingPeriod.findFirst.mockResolvedValue({ status: "OPEN", financialYear: { startDate: new Date("2026-07-01T00:00:00.000Z") } })

    const result = await depreciationPreflight({ year: 2026, month: 7 })

    expect(result.ok).toBe(false)
    expect(result.blockers.some((b) => b.message.includes("1115"))).toBe(true)
  })

  it("blocks on a category that maps to no account", async () => {
    p.asset.findMany.mockResolvedValue([
      {
        id: "a-2", assetTag: "BS-AST-00002", purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
        purchaseCostBdt: null, capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
        category: { code: "ACCESSORY", isConsumable: false },
      },
    ])

    const result = await depreciationPreflight({ year: 2026, month: 7 })

    expect(result.ok).toBe(false)
    expect(result.blockers.some((b) => b.message.includes("ACCESSORY"))).toBe(true)
  })

  it("warns about an asset with a purchase date and no cost", async () => {
    // It cannot be depreciated, and would be silently absent from the charge
    // otherwise.
    p.asset.findMany.mockResolvedValue([
      {
        id: "a-3", assetTag: "BS-AST-00003", purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
        purchaseCostBdt: null, capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
        category: { code: "LAPTOP", isConsumable: false },
      },
    ])
    p.account.findMany.mockResolvedValue([
      { code: "1114", depreciationRate: 20, contraAccountId: "contra-1124" },
    ])

    const result = await depreciationPreflight({ year: 2026, month: 7 })

    expect(result.warnings.some((w) => w.message.includes("BS-AST-00003"))).toBe(true)
    expect(result.ok).toBe(true)
  })

  it("warns about an asset uncapitalised for more than 60 days", async () => {
    const sixtyDaysAgo = new Date(Date.UTC(2026, 4, 1)) // 1 May
    p.asset.findMany.mockResolvedValue([
      {
        id: "a-4", assetTag: "BS-AST-00004", purchaseDate: new Date("2026-01-15T00:00:00.000Z"),
        purchaseCostBdt: null, capitalisedAt: null,
        category: { code: "LAPTOP", isConsumable: false },
      },
    ])
    vi.spyOn(globalThis.Date, "now").mockReturnValue(sixtyDaysAgo.getTime())

    const result = await depreciationPreflight({ year: 2026, month: 7 })

    expect(result.warnings.some((w) => w.message.includes("BS-AST-00004"))).toBe(true)
  })

  it("warns about a catch-up covering more than three months, naming the asset", async () => {
    // Decision 6 makes these charges arbitrarily large. The number should
    // never be a surprise.
    p.accountingPeriod.findFirst.mockResolvedValue({ status: "OPEN", financialYear: { startDate: new Date("2026-07-01T00:00:00.000Z") } })
    p.asset.findMany.mockResolvedValue([
      {
        id: "a-5", assetTag: "BS-AST-00005", purchaseDate: new Date("2026-01-10T00:00:00.000Z"),
        purchaseCostBdt: null, capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
        category: { code: "LAPTOP", isConsumable: false },
      },
    ])

    const result = await depreciationPreflight({ year: 2026, month: 7 })

    expect(result.warnings.some((w) => w.message.includes("BS-AST-00005"))).toBe(true)
  })

  it("is ok when nothing is wrong", async () => {
    const result = await depreciationPreflight({ year: 2026, month: 7 })

    expect(result.blockers).toEqual([])
    expect(result.ok).toBe(true)
  })
})
