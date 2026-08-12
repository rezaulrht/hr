import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    account: { findUnique: vi.fn(), findMany: vi.fn() },
    journalLine: { findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { Prisma } from "../../generated/prisma/client"
import { cashOrBankBook, generalLedger, trialBalance } from "./accounting.ledger.service"
import { utcDate } from "./accounting.utils"

const D = (v: string | number) => new Prisma.Decimal(v)

const bank = { id: "acc-bank", code: "1242", name: "City Bank", type: "ASSET", cashKind: "BANK" }

const range = { from: utcDate(2026, 7, 1), to: utcDate(2026, 7, 31) }

function movement(journalNo: string, day: number, debit: string, credit: string) {
  return {
    debit: D(debit),
    credit: D(credit),
    narration: null,
    journal: {
      id: `j-${journalNo}`,
      journalNo,
      date: utcDate(2026, 7, day),
      narration: `Entry ${journalNo}`,
      reference: null,
      sourceModule: null,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.account.findUnique as any).mockResolvedValue(bank)
  ;(prisma.journalLine.aggregate as any).mockResolvedValue({
    _sum: { debit: D("1000000.00"), credit: D("385155.00") },
  })
  ;(prisma.journalLine.findMany as any).mockResolvedValue([
    movement("BS-JV-00010", 5, "0", "70500.00"),
    movement("BS-JV-00011", 20, "50000.00", "0"),
  ])
})

describe("generalLedger", () => {
  it("opens with the balance from inception up to the day before `from`", async () => {
    const result = await generalLedger({ accountId: "acc-bank", ...range })

    // 1,000,000 debit less 385,155 credit on an asset = 614,845 debit.
    expect(result.openingBalance).toBe("614845.00")
    expect((prisma.journalLine.aggregate as any).mock.calls[0][0].where.journal.date).toEqual({
      lt: range.from,
    })
  })

  it("runs a signed balance forward through the rows, in date order", async () => {
    const result = await generalLedger({ accountId: "acc-bank", ...range })

    expect(result.rows.map((r) => r.runningBalance)).toEqual(["544345.00", "594345.00"])
  })

  it("closes at the opening balance plus the period movement", async () => {
    const result = await generalLedger({ accountId: "acc-bank", ...range })

    expect(result.totalDebit).toBe("50000.00")
    expect(result.totalCredit).toBe("70500.00")
    expect(result.closingBalance).toBe("594345.00")
  })

  it("runs a liability's balance in the credit direction", async () => {
    ;(prisma.account.findUnique as any).mockResolvedValue({
      id: "acc-pay",
      code: "2110",
      name: "Trade and other Payables",
      type: "LIABILITY",
      cashKind: "NONE",
    })
    ;(prisma.journalLine.aggregate as any).mockResolvedValue({
      _sum: { debit: D("0"), credit: D("40635.00") },
    })
    ;(prisma.journalLine.findMany as any).mockResolvedValue([movement("BS-JV-00012", 9, "0", "25000.00")])

    const result = await generalLedger({ accountId: "acc-pay", ...range })

    expect(result.openingBalance).toBe("40635.00")
    expect(result.rows[0].runningBalance).toBe("65635.00")
  })

  it("excludes drafts but includes reversed journals (Decision 16)", async () => {
    await generalLedger({ accountId: "acc-bank", ...range })

    // REVERSED means "posted, then superseded by a posted reversal". Drop it
    // and an approved reversal moves the account by minus the original
    // amount instead of back to zero.
    for (const spy of [prisma.journalLine.findMany, prisma.journalLine.aggregate]) {
      expect((spy as any).mock.calls[0][0].where.journal.status).toEqual({
        in: ["POSTED", "REVERSED"],
      })
    }
  })

  it("keeps an approved reversal and its original netting to zero", async () => {
    ;(prisma.journalLine.aggregate as any).mockResolvedValue({
      _sum: { debit: D("0"), credit: D("0") },
    })
    ;(prisma.journalLine.findMany as any).mockResolvedValue([
      movement("BS-JV-00010", 5, "0", "70500.00"),
      // The reversal, posted three days later.
      movement("BS-JV-00011", 8, "70500.00", "0"),
    ])

    const result = await generalLedger({ accountId: "acc-bank", ...range })

    expect(result.closingBalance).toBe("0.00")
  })

  it("passes the employee dimension through, which is what the Employee Ledger is", async () => {
    await generalLedger({ accountId: "acc-bank", ...range, employeeId: "emp-1" })

    expect((prisma.journalLine.findMany as any).mock.calls[0][0].where.employeeId).toBe("emp-1")
  })

  it("passes the department dimension through", async () => {
    await generalLedger({ accountId: "acc-bank", ...range, departmentId: "dept-1" })

    expect((prisma.journalLine.findMany as any).mock.calls[0][0].where.departmentId).toBe("dept-1")
  })

  it("404s an unknown account", async () => {
    ;(prisma.account.findUnique as any).mockResolvedValue(null)

    await expect(generalLedger({ accountId: "ghost", ...range })).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("returns an empty ledger with a correct opening balance when nothing moved", async () => {
    ;(prisma.journalLine.findMany as any).mockResolvedValue([])

    const result = await generalLedger({ accountId: "acc-bank", ...range })

    expect(result.rows).toEqual([])
    expect(result.closingBalance).toBe("614845.00")
  })
})

describe("cashOrBankBook", () => {
  it("400s when the account is not of the requested kind", async () => {
    ;(prisma.account.findUnique as any).mockResolvedValue({ ...bank, cashKind: "NONE" })

    await expect(cashOrBankBook("BANK", { accountId: "acc-bank", ...range })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("City Bank"),
    })
  })

  it("400s when a CASH book is asked for a BANK account", async () => {
    await expect(cashOrBankBook("CASH", { accountId: "acc-bank", ...range })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it("returns the same shape as the general ledger for a matching account", async () => {
    const result = await cashOrBankBook("BANK", { accountId: "acc-bank", ...range })

    expect(result.openingBalance).toBe("614845.00")
    expect(result.rows).toHaveLength(2)
  })
})

describe("trialBalance", () => {
  beforeEach(() => {
    ;(prisma.account.findMany as any).mockResolvedValue([
      { id: "acc-bank", code: "1242", name: "City Bank", type: "ASSET" },
      { id: "acc-pay", code: "2110", name: "Trade and other Payables", type: "LIABILITY" },
      { id: "acc-cap", code: "3100", name: "Share Capital", type: "EQUITY" },
      { id: "acc-exp", code: "5206", name: "Office Rent", type: "EXPENSE" },
    ])
    ;(prisma.journalLine.groupBy as any)
      // opening
      .mockResolvedValueOnce([
        { accountId: "acc-bank", _sum: { debit: D("1000000.00"), credit: D("0") } },
        { accountId: "acc-cap", _sum: { debit: D("0"), credit: D("1000000.00") } },
      ])
      // period: paid 40,635 from the bank and accrued 40,635 unpaid, both
      // hitting Office Rent — so the movement itself balances.
      .mockResolvedValueOnce([
        { accountId: "acc-bank", _sum: { debit: D("0"), credit: D("40635.00") } },
        { accountId: "acc-pay", _sum: { debit: D("0"), credit: D("40635.00") } },
        { accountId: "acc-exp", _sum: { debit: D("81270.00"), credit: D("0") } },
      ])
  })

  it("balances, and says so", async () => {
    const result = await trialBalance(range)

    expect(result.totals.closingDebit).toBe(result.totals.closingCredit)
    expect(result.isBalanced).toBe(true)
  })

  it("puts each closing balance on its normal side, never both", async () => {
    const result = await trialBalance(range)
    const byCode = Object.fromEntries(result.rows.map((r) => [r.code, r]))

    expect(byCode["1242"]).toMatchObject({ closingDebit: "959365.00", closingCredit: "0.00" })
    expect(byCode["2110"]).toMatchObject({ closingDebit: "0.00", closingCredit: "40635.00" })
    expect(byCode["3100"]).toMatchObject({ closingDebit: "0.00", closingCredit: "1000000.00" })
  })

  it("separates opening balance from period movement", async () => {
    const result = await trialBalance(range)
    const bankRow = result.rows.find((r) => r.code === "1242")!

    expect(bankRow.openingDebit).toBe("1000000.00")
    expect(bankRow.periodCredit).toBe("40635.00")
  })

  it("sorts rows by code, so the report reads in statement order", async () => {
    const result = await trialBalance(range)

    expect(result.rows.map((r) => r.code)).toEqual(["1242", "2110", "3100", "5206"])
  })

  it("omits accounts with no opening balance and no movement", async () => {
    ;(prisma.account.findMany as any).mockResolvedValue([
      { id: "acc-bank", code: "1242", name: "City Bank", type: "ASSET" },
      { id: "acc-unused", code: "5217", name: "Miscellaneous Expenses", type: "EXPENSE" },
      { id: "acc-cap", code: "3100", name: "Share Capital", type: "EQUITY" },
    ])

    const result = await trialBalance(range)

    expect(result.rows.map((r) => r.code)).not.toContain("5217")
  })

  it("reports isBalanced false rather than throwing when the two sides differ", async () => {
    ;(prisma.journalLine.groupBy as any).mockReset()
    ;(prisma.journalLine.groupBy as any)
      .mockResolvedValueOnce([{ accountId: "acc-bank", _sum: { debit: D("100.00"), credit: D("0") } }])
      .mockResolvedValueOnce([])

    const result = await trialBalance(range)

    expect(result.isBalanced).toBe(false)
  })
})
