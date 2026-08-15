import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    asset: { findUnique: vi.fn(), update: vi.fn() },
    postingRule: { findMany: vi.fn() },
    journal: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      exchangeRate: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

vi.mock("../accounting/accounting.posting", () => ({ postSystemJournal: vi.fn() }))
vi.mock("../payroll/payroll.fx", () => ({ resolveRateOrThrow: vi.fn() }))

import { Prisma } from "../../generated/prisma/client"
import { postSystemJournal } from "../accounting/accounting.posting"
import { resolveRateOrThrow } from "../payroll/payroll.fx"
import type { ResolvedRules } from "../posting/posting.types"
import {
  buildAcquisitionLines,
  buildDisposalLines,
  buildPaymentLines,
  capitaliseAsset,
  disposeAsset,
  payForAsset,
  type AssetForPosting,
  type DisposalInput,
} from "./asset.capitalise"

const D = (v: string) => new Prisma.Decimal(v)

const rules: ResolvedRules = {
  event: "ASSET_ACQUISITION",
  byKey: new Map([
    ["LAPTOP", "1114"], ["FURNITURE", "1111"],
    ["MOUSE", "5203"], ["PAYABLE", "2110"], ["BANK", "1242"],
  ]),
}

function asset(over: Partial<AssetForPosting> = {}): AssetForPosting {
  return {
    id: "a-1",
    assetTag: "BS-AST-00001",
    name: "ThinkPad T14",
    categoryCode: "LAPTOP",
    isConsumable: false,
    purchaseCostBdt: D("85000.00"),
    currency: "BDT",
    fxRateToBdt: D("1.000000"),
    purchaseCost: D("85000.00"),
    departmentId: null,
    ...over,
  }
}

const finance = { sub: "user-fin", role: "FINANCE_OFFICER", email: "f@demo.com", mustChangePassword: false } as never

const ruleRows = (event: string) =>
  Array.from(rules.byKey.entries()).map(([key, accountCode]) => ({ key, account: { code: accountCode } }))

const txFor = (assetRow: Record<string, unknown> | null, event = "ASSET_ACQUISITION") => {
  const tx = (prisma as unknown as { __tx: any }).__tx
  tx.asset.findUnique.mockResolvedValue(assetRow)
  tx.postingRule.findMany.mockResolvedValue(ruleRows(event))
  tx.journal.findFirst.mockResolvedValue(null)
  tx.auditLog.create.mockResolvedValue({})
  return tx
}

import prisma from "../../config/prisma"

const tx = (prisma as unknown as { __tx: any }).__tx

beforeEach(() => {
  vi.clearAllMocks()
  ;(postSystemJournal as ReturnType<typeof vi.fn>).mockResolvedValue({ journalNo: "BS-JV-00001", id: "j-1" })
  ;(resolveRateOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(D("122.500000"))
})

describe("buildAcquisitionLines", () => {
  it("debits the class account and credits payables, and balances", () => {
    const lines = buildAcquisitionLines(asset({ categoryCode: "LAPTOP" }), rules)
    expect(lines[0]).toMatchObject({ accountCode: "1114", debit: "85000.00" })
    expect(lines[1]).toMatchObject({ accountCode: "2110", credit: "85000.00" })
  })

  it("carries the FX memo on a USD asset and posts the BDT figure", () => {
    const lines = buildAcquisitionLines(
      asset({ currency: "USD", purchaseCost: D("1000.00"), fxRateToBdt: D("122.500000"), purchaseCostBdt: D("122500.00") }),
      rules
    )
    expect(lines[0].debit).toBe("122500.00")
    expect(lines[0]).toMatchObject({ sourceCurrency: "USD", sourceAmount: "1000.00", fxRateToBdt: "122.500000" })
  })

  it("omits the FX memo on a BDT asset", () => {
    const lines = buildAcquisitionLines(asset(), rules)
    expect(lines[0].sourceCurrency).toBeUndefined()
  })

  /** Spec Decision 2: no bare wildcard, so an unmapped class stops. */
  it("throws naming the category when no rule maps it", () => {
    expect(() => buildAcquisitionLines(asset({ categoryCode: "VEHICLE" }), rules))
      .toThrow(/VEHICLE/)
  })
})

describe("buildPaymentLines", () => {
  it("clears the payable against the bank", () => {
    const lines = buildPaymentLines(asset(), rules)
    expect(lines).toMatchObject([
      { accountCode: "2110", debit: "85000.00" },
      { accountCode: "1242", credit: "85000.00" },
    ])
  })
})

describe("capitaliseAsset", () => {
  it("freezes the rate and the BDT cost on the asset", async () => {
    const t = txFor({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null,
      category: { code: "LAPTOP", isConsumable: false },
    })

    await capitaliseAsset("a-1", finance)

    expect(t.asset.update).toHaveBeenCalledWith({
      where: { id: "a-1" },
      data: expect.objectContaining({
        capitalisedAt: expect.any(Date),
        capitalisedBy: "user-fin",
        fxRateToBdt: D("1.000000"),
        purchaseCostBdt: D("85000.00"),
      }),
    })
  })

  it("dates the journal to capitalisation, not to purchaseDate", async () => {
    // Spec Decision 4: a July purchase entered in August must not be refused
    // by a closed July, every month.
    txFor({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null,
      category: { code: "LAPTOP", isConsumable: false },
    })

    await capitaliseAsset("a-1", finance)

    const input = (postSystemJournal as unknown as { mock: { calls: Array<[unknown, { date: Date }]> } }).mock.calls[0][1]
    expect(input.date).not.toEqual(new Date("2026-07-01T00:00:00.000Z"))
  })

  it("refuses an asset with no purchase cost, naming the tag", async () => {
    txFor({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: null, purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null,
      category: { code: "LAPTOP", isConsumable: false },
    })

    await expect(capitaliseAsset("a-1", finance)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("BS-AST-00001"),
    })
    expect(postSystemJournal).not.toHaveBeenCalled()
  })

  it("refuses a second capitalisation, naming the journal that exists", async () => {
    const t = txFor({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null, capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
      category: { code: "LAPTOP", isConsumable: false },
    })
    t.journal.findFirst.mockResolvedValue({ journalNo: "BS-JV-00009" })

    await expect(capitaliseAsset("a-1", finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("BS-JV-00009"),
    })
    expect(postSystemJournal).not.toHaveBeenCalled()
  })

  it("expenses a consumable instead of capitalising it", async () => {
    // Spec Decision 3: isConsumable resolves to an expense account and the
    // asset gets no PPE debit.
    const t = txFor({
      id: "a-2", assetTag: "BS-AST-00002", name: "Logitech mouse",
      purchaseCost: D("1500.00"), purchaseDate: new Date("2026-07-10T00:00:00.000Z"),
      currency: "BDT", departmentId: null,
      category: { code: "MOUSE", isConsumable: true },
    })

    await capitaliseAsset("a-2", finance)

    const input = (postSystemJournal as unknown as { mock: { calls: Array<[unknown, { lines: Array<{ accountCode: string }> }]> } }).mock.calls[0][1]
    expect(input.lines[0].accountCode).toBe("5203")
    expect(input.lines[0].accountCode).not.toMatch(/^11\d\d$/)
    // Not stamped as capitalised, so depreciation skips it and it never
    // appears in Annexure-A.
    expect(t.asset.update).not.toHaveBeenCalled()
  })

  it("writes a CAPITALISE audit row in the same transaction", async () => {
    const t = txFor({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null,
      category: { code: "LAPTOP", isConsumable: false },
    })

    await capitaliseAsset("a-1", finance)

    expect(t.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: "ASSET",
        entityId: "a-1",
        action: "CAPITALISE",
        changedBy: "user-fin",
      }),
    })
  })
})

describe("payForAsset", () => {
  it("clears the payable to the bank, dated to the payment", async () => {
    txFor({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseCostBdt: D("85000.00"), fxRateToBdt: D("1.000000"),
      purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null, capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
      category: { code: "LAPTOP", isConsumable: false },
    }, "ASSET_PAYMENT")

    await payForAsset("a-1", { paidAt: "2026-08-20" }, finance)

    const input = (postSystemJournal as unknown as { mock: { calls: Array<[unknown, { date: Date; lines: Array<{ accountCode: string }> }]> } }).mock.calls[0][1]
    expect(input.date).toEqual(new Date("2026-08-20T00:00:00.000Z"))
    expect(input.lines.map((l) => l.accountCode)).toEqual(["2110", "1242"])
  })

  it("refuses to pay an asset that was never capitalised", async () => {
    txFor({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null, capitalisedAt: null,
      category: { code: "LAPTOP", isConsumable: false },
    }, "ASSET_PAYMENT")

    await expect(payForAsset("a-1", {}, finance)).rejects.toMatchObject({ statusCode: 409 })
    expect(postSystemJournal).not.toHaveBeenCalled()
  })
})

const disposalRules: ResolvedRules = {
  event: "ASSET_DISPOSAL",
  byKey: new Map([
    ["LAPTOP", "1114"], ["FURNITURE", "1111"],
    ["GAIN", "4290"], ["LOSS", "5217"], ["BANK", "1242"],
  ]),
}

const disposalInput = (over: Partial<DisposalInput> = {}): DisposalInput => ({
  asset: asset({ purchaseCostBdt: D("85000.00") }),
  accumulated: D("51000.00"),
  proceeds: D("10000.00"),
  contraAccountCode: "1124",
  ...over,
})

describe("buildDisposalLines", () => {
  it("books a loss when proceeds fall short of book value", () => {
    const lines = buildDisposalLines(
      { asset: asset({ purchaseCostBdt: D("85000.00") }), accumulated: D("51000.00"), proceeds: D("10000.00"), contraAccountCode: "1124" },
      disposalRules
    )
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: "1124", debit: "51000.00" }),
      expect.objectContaining({ accountCode: "1242", debit: "10000.00" }),
      expect.objectContaining({ accountCode: "5217", debit: "24000.00" }),
      expect.objectContaining({ accountCode: "1114", credit: "85000.00" }),
    ]))
  })

  it("books a gain when proceeds exceed book value", () => {
    const lines = buildDisposalLines(
      { asset: asset({ purchaseCostBdt: D("85000.00") }), accumulated: D("80000.00"), proceeds: D("9000.00"), contraAccountCode: "1124" },
      disposalRules
    )
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: "4290", credit: "4000.00" }),
    ]))
  })

  it("omits the proceeds line when nothing was received", () => {
    const lines = buildDisposalLines(
      { asset: asset(), accumulated: D("0.00"), proceeds: D("0.00"), contraAccountCode: "1124" },
      disposalRules
    )
    expect(lines.some((l) => l.accountCode === "1242")).toBe(false)
  })

  it("balances by construction — the gain or loss is whatever is left", () => {
    const shapes = [
      disposalInput({ accumulated: D("51000.00"), proceeds: D("10000.00") }),
      disposalInput({ accumulated: D("80000.00"), proceeds: D("9000.00") }),
      disposalInput({ accumulated: D("0.00"), proceeds: D("0.00") }),
      disposalInput({ asset: asset({ purchaseCostBdt: D("1200.00") }), accumulated: D("500.00"), proceeds: D("100.00") }),
    ]
    for (const input of shapes) {
      const lines = buildDisposalLines(input, disposalRules)
      const debits = lines.reduce((t, l) => t.plus(l.debit ?? "0"), D("0.00"))
      const credits = lines.reduce((t, l) => t.plus(l.credit ?? "0"), D("0.00"))
      expect(debits.toFixed(2)).toBe(credits.toFixed(2))
    }
  })
})

describe("disposeAsset", () => {
  const disposalTx = () => {
    const t = txFor({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseCostBdt: D("85000.00"), fxRateToBdt: D("1.000000"),
      purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null, capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
      lifecycle: "IN_SERVICE", retiredAt: null,
      category: { code: "LAPTOP", isConsumable: false },
    }, "ASSET_DISPOSAL")
    t.postingRule.findMany.mockResolvedValue([
      ...ruleRows("ASSET_ACQUISITION"),
      { key: "GAIN", account: { code: "4290" } },
      { key: "LOSS", account: { code: "5217" } },
    ])
    t.assetDepreciation = { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: D("51000.00") } }) }
    t.assetAssignment = { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null) }
    t.account = {
      findUnique: vi.fn(({ where }: { where: { code?: string; id?: string } }) =>
        Promise.resolve(
          where.code === "1114"
            ? { contraAccountId: "contra-1124", code: "1114" }
            : { id: "contra-1124", code: "1124" }
        )
      ),
    }
    t.asset.update.mockResolvedValue({})
    return t
  }

  it("refuses an asset with an open assignment, naming the holder", async () => {
    // Hard block, unlike the settlement checklist: disposing of a laptop
    // somebody is still holding is a data error, not a debt.
    const t = disposalTx()
    t.assetAssignment.findFirst.mockResolvedValue({
      id: "asg-1",
      employee: { fullName: "Rahim Uddin", employeeCode: "BS-EMP-00001" },
    })

    await expect(disposeAsset("a-1", {}, finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Rahim Uddin"),
    })
    expect(postSystemJournal).not.toHaveBeenCalled()
  })

  it("refuses an asset that was never capitalised", async () => {
    const t = disposalTx()
    t.asset.findUnique.mockResolvedValue({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseCostBdt: null, fxRateToBdt: null,
      purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null, capitalisedAt: null,
      lifecycle: "IN_SERVICE", retiredAt: null,
      category: { code: "LAPTOP", isConsumable: false },
    })

    await expect(disposeAsset("a-1", {}, finance)).rejects.toMatchObject({ statusCode: 409 })
    expect(postSystemJournal).not.toHaveBeenCalled()
  })

  it("refuses a second disposal", async () => {
    const t = disposalTx()
    t.asset.findUnique.mockResolvedValue({
      id: "a-1", assetTag: "BS-AST-00001", name: "ThinkPad T14",
      purchaseCost: D("85000.00"), purchaseCostBdt: D("85000.00"), fxRateToBdt: D("1.000000"),
      purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
      currency: "BDT", departmentId: null, capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
      lifecycle: "RETIRED", retiredAt: new Date("2027-01-15T00:00:00.000Z"),
      category: { code: "LAPTOP", isConsumable: false },
    })

    await expect(disposeAsset("a-1", {}, finance)).rejects.toMatchObject({ statusCode: 409 })
    expect(postSystemJournal).not.toHaveBeenCalled()
  })

  it("sets lifecycle RETIRED, retiredAt and retiredBy", async () => {
    const t = disposalTx()

    await disposeAsset("a-1", { note: "Sold on auction" }, finance)

    expect(t.asset.update).toHaveBeenCalledWith({
      where: { id: "a-1" },
      data: expect.objectContaining({
        lifecycle: "RETIRED",
        retiredAt: expect.any(Date),
        retiredBy: "user-fin",
        retirementNote: "Sold on auction",
      }),
    })
  })
})
