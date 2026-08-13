import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../accounting/accounting.posting", () => ({ postSystemJournal: vi.fn() }))

import { Prisma } from "../../generated/prisma/client"
import { postSystemJournal } from "../accounting/accounting.posting"
import { assertBalanced } from "../accounting/accounting.utils"
import type { ResolvedRules } from "../posting/posting.types"
import {
  buildCostAccrualLines,
  buildCostPaymentLines,
  postCostAccrual,
  postCostPayment,
  type CostForPosting,
} from "./cost.posting"

const D = (v: string) => new Prisma.Decimal(v)

const rules: ResolvedRules = {
  event: "COST_ACCRUAL",
  byKey: new Map([["RENT", "5206"], ["*", "5207"], ["PAYABLE", "2110"], ["BANK", "1242"]]),
}

function cost(over: Partial<CostForPosting> = {}): CostForPosting {
  return {
    id: "cost-1", categoryCode: "RENT", label: "July rent", payee: "Landlord",
    amount: D("25000.00"), periodMonth: 7, periodYear: 2026, currency: "BDT",
    ...over,
  }
}

const txFor = (row: Partial<CostForPosting> = {}) =>
  ({
    operatingCost: {
      findUnique: vi.fn().mockResolvedValue({
        ...cost(row),
        category: { code: (row.categoryCode ?? cost().categoryCode) },
      }),
    },
    postingRule: { findMany: vi.fn().mockResolvedValue([
      { key: "RENT", account: { code: "5206" } },
      { key: "PAYABLE", account: { code: "2110" } },
      { key: "BANK", account: { code: "1242" } },
    ]) },
  }) as never

const balanced = (lines: ReturnType<typeof buildCostAccrualLines>) =>
  assertBalanced(lines.map((l) => ({ debit: D(l.debit ?? "0"), credit: D(l.credit ?? "0") })))

beforeEach(() => vi.clearAllMocks())

describe("buildCostAccrualLines", () => {
  it("debits the mapped expense and credits trade payables", () => {
    const lines = buildCostAccrualLines(cost(), rules)

    expect(lines).toMatchObject([
      { accountCode: "5206", debit: "25000.00" },
      { accountCode: "2110", credit: "25000.00" },
    ])
    expect(() => balanced(lines)).not.toThrow()
  })

  it("falls back to office expense for an unmapped category", () => {
    expect(buildCostAccrualLines(cost({ categoryCode: "CLEANING" }), rules)[0].accountCode).toBe("5207")
  })

  it("names the bill and the payee on both lines, which is what the ledger shows", () => {
    for (const line of buildCostAccrualLines(cost(), rules)) {
      expect(line.narration).toBe("July rent — Landlord")
    }
  })
})

describe("buildCostPaymentLines", () => {
  it("clears the payable against the bank", () => {
    const lines = buildCostPaymentLines(cost(), rules)

    expect(lines).toMatchObject([
      { accountCode: "2110", debit: "25000.00" },
      { accountCode: "1242", credit: "25000.00" },
    ])
    expect(() => balanced(lines)).not.toThrow()
  })
})

describe("postCostAccrual", () => {
  /**
   * Decision 10. July's electricity bill arrives on 5 August; dating the
   * accrual into July is purer accounting and would be refused by a closed
   * period essentially every month, because utility bills always arrive after
   * their month.
   *
   * `periodMonth`/`periodYear` stay what they were built for — saying which
   * month a bill relates to — and the ledger date is when it was recorded.
   */
  it("dates the accrual to the day it was recorded, not to the period it relates to", async () => {
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

    // The fixture is a July bill. Its accrual must land today, not on 1 July.
    await postCostAccrual(txFor({ periodMonth: 7, periodYear: 2026 }), "cost-1", "user-1")

    expect(postSystemJournal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ date: today })
    )
    expect((postSystemJournal as never as { mock: { calls: Array<[unknown, { date: Date }]> } }).mock.calls[0][1].date)
      .not.toEqual(new Date("2026-07-01T00:00:00.000Z"))
  })

  it("refuses a bill in a currency the ledger cannot take", async () => {
    await expect(postCostAccrual(txFor({ currency: "USD" }), "cost-1", "user-1")).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("USD"),
    })
    expect(postSystemJournal).not.toHaveBeenCalled()
  })
})

describe("postCostPayment", () => {
  it("dates the payment to when it was paid", async () => {
    await postCostPayment(txFor(), "cost-1", "user-1", new Date("2026-08-20T14:00:00.000Z"))

    expect(postSystemJournal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ date: new Date("2026-08-20T00:00:00.000Z") })
    )
  })

  /**
   * The guard was on the accrual alone, which left the worse case open: a
   * USD bill that already existed could still be paid, booking USD 500 as
   * BDT 500 with no conversion anywhere.
   */
  it("refuses to pay a bill in a currency the ledger cannot take", async () => {
    await expect(
      postCostPayment(txFor({ currency: "USD" }), "cost-1", "user-1", new Date())
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(postSystemJournal).not.toHaveBeenCalled()
  })
})
