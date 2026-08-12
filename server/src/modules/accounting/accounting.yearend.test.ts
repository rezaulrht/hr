import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    financialYear: { findUnique: vi.fn(), update: vi.fn() },
    accountingPeriod: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    account: { findFirst: vi.fn(), findMany: vi.fn() },
    journal: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    journalLine: { groupBy: vi.fn() },
    idCounter: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { Prisma } from "../../generated/prisma/client"
import { draftYearEndJournal, lockYearAfterClosing } from "./accounting.yearend"
import { utcDate } from "./accounting.utils"

const tx = (prisma as unknown as { __tx: any }).__tx
const D = (v: string | number) => new Prisma.Decimal(v)

const finance = { sub: "user-finance", role: "FINANCE_OFFICER", email: "f@d.com", mustChangePassword: false } as never
const admin = { sub: "user-admin", role: "SUPER_ADMIN", email: "a@d.com", mustChangePassword: false } as never

const fy = {
  id: "fy-1",
  name: "FY 2024-25",
  status: "OPEN",
  startDate: utcDate(2024, 7, 1),
  endDate: utcDate(2025, 6, 30),
}

/** Jul-24 … May-25 closed, Jun-25 still open — the required shape. */
const periodsReadyForYearEnd = [
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `p-${i}`,
    year: i < 6 ? 2024 : 2025,
    month: i < 6 ? 7 + i : i - 5,
    status: "CLOSED",
  })),
  { id: "p-jun", year: 2025, month: 6, status: "OPEN" },
]

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.idCounter.upsert.mockResolvedValue({ id: "JV", value: 99 })
  tx.financialYear.findUnique.mockResolvedValue(fy)
  tx.accountingPeriod.findMany.mockResolvedValue(periodsReadyForYearEnd)
  tx.journal.findFirst.mockResolvedValue(null)
  tx.journal.create.mockResolvedValue({ id: "j-close", journalNo: "BS-JV-00099" })
  tx.journal.findUnique.mockResolvedValue({ id: "j-close", journalNo: "BS-JV-00099" })
  tx.account.findFirst.mockResolvedValue({ id: "acc-re", code: "3300", name: "Retained Earnings" })
  // The FY2024-25 accounts: no revenue, 254,530 admin expense, 2,405 financial.
  tx.account.findMany.mockResolvedValue([
    { id: "acc-admin", code: "5201", name: "Salary and Allowances", type: "EXPENSE" },
    { id: "acc-fin", code: "5310", name: "Bank Interest & Charges", type: "EXPENSE" },
  ])
  tx.journalLine.groupBy.mockResolvedValue([
    { accountId: "acc-admin", _sum: { debit: D("254530.00"), credit: D(0) } },
    { accountId: "acc-fin", _sum: { debit: D("2405.00"), credit: D(0) } },
  ])
})

describe("draftYearEndJournal", () => {
  it("drafts a CLOSING journal dated the last day of the financial year", async () => {
    await draftYearEndJournal("fy-1", finance)

    expect(tx.journal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "CLOSING",
          status: "DRAFT",
          date: utcDate(2025, 6, 30),
          periodId: "p-jun",
        }),
      })
    )
  })

  it("zeroes each expense account with a credit and takes the loss to Retained Earnings", async () => {
    await draftYearEndJournal("fy-1", finance)

    const lines = tx.journal.create.mock.calls[0][0].data.lines.createMany.data
    const byAccount = Object.fromEntries(lines.map((l: any) => [l.accountId, l]))

    expect(byAccount["acc-admin"].credit.toFixed(2)).toBe("254530.00")
    expect(byAccount["acc-fin"].credit.toFixed(2)).toBe("2405.00")
    // A loss debits Retained Earnings. 254,530 + 2,405 = 256,935 — the
    // figure in the FY2024-25 Statement of Changes in Equity.
    expect(byAccount["acc-re"].debit.toFixed(2)).toBe("256935.00")
  })

  it("credits Retained Earnings in a profitable year", async () => {
    tx.account.findMany.mockResolvedValue([
      { id: "acc-rev", code: "4110", name: "Service Revenue", type: "INCOME" },
      { id: "acc-admin", code: "5201", name: "Salary and Allowances", type: "EXPENSE" },
    ])
    tx.journalLine.groupBy.mockResolvedValue([
      { accountId: "acc-rev", _sum: { debit: D(0), credit: D("1000000.00") } },
      { accountId: "acc-admin", _sum: { debit: D("400000.00"), credit: D(0) } },
    ])

    await draftYearEndJournal("fy-1", finance)

    const lines = tx.journal.create.mock.calls[0][0].data.lines.createMany.data
    const byAccount = Object.fromEntries(lines.map((l: any) => [l.accountId, l]))

    expect(byAccount["acc-rev"].debit.toFixed(2)).toBe("1000000.00")
    expect(byAccount["acc-admin"].credit.toFixed(2)).toBe("400000.00")
    expect(byAccount["acc-re"].credit.toFixed(2)).toBe("600000.00")
  })

  it("produces a balanced journal", async () => {
    await draftYearEndJournal("fy-1", finance)

    const lines = tx.journal.create.mock.calls[0][0].data.lines.createMany.data
    const debit = lines.reduce((s: any, l: any) => s.plus(l.debit), D(0))
    const credit = lines.reduce((s: any, l: any) => s.plus(l.credit), D(0))
    expect(debit.toFixed(2)).toBe(credit.toFixed(2))
  })

  it("skips accounts whose net movement is zero", async () => {
    tx.journalLine.groupBy.mockResolvedValue([
      { accountId: "acc-admin", _sum: { debit: D("100.00"), credit: D("100.00") } },
      { accountId: "acc-fin", _sum: { debit: D("2405.00"), credit: D(0) } },
    ])

    await draftYearEndJournal("fy-1", finance)

    const lines = tx.journal.create.mock.calls[0][0].data.lines.createMany.data
    expect(lines.map((l: any) => l.accountId)).not.toContain("acc-admin")
  })

  it("409s when a month other than June is still open", async () => {
    tx.accountingPeriod.findMany.mockResolvedValue([
      ...periodsReadyForYearEnd.slice(0, 10).map((p) => ({ ...p })),
      { id: "p-may", year: 2025, month: 5, status: "OPEN" },
      { id: "p-jun", year: 2025, month: 6, status: "OPEN" },
    ])

    await expect(draftYearEndJournal("fy-1", finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("May 2025"),
    })
  })

  it("409s when the final month has already been closed — it must stay open to receive the entry", async () => {
    tx.accountingPeriod.findMany.mockResolvedValue(
      periodsReadyForYearEnd.map((p) => ({ ...p, status: "CLOSED" }))
    )

    await expect(draftYearEndJournal("fy-1", finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/June 2025.*open/i),
    })
  })

  it("409s on a second year-end draft for the same year", async () => {
    tx.journal.findFirst.mockResolvedValue({ id: "j-old", journalNo: "BS-JV-00050" })

    await expect(draftYearEndJournal("fy-1", finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("BS-JV-00050"),
    })
  })

  it("409s on an already-closed financial year", async () => {
    tx.financialYear.findUnique.mockResolvedValue({ ...fy, status: "CLOSED" })

    await expect(draftYearEndJournal("fy-1", finance)).rejects.toMatchObject({ statusCode: 409 })
  })

  it("400s when no account carries the RETAINED_EARNINGS role", async () => {
    tx.account.findFirst.mockResolvedValue(null)

    await expect(draftYearEndJournal("fy-1", finance)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("RETAINED_EARNINGS"),
    })
  })

  it("400s when there is nothing to close", async () => {
    tx.journalLine.groupBy.mockResolvedValue([])

    await expect(draftYearEndJournal("fy-1", finance)).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe("lockYearAfterClosing", () => {
  it("locks every period and closes the year", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-jun", financialYearId: "fy-1" })

    await lockYearAfterClosing(tx as never, { id: "j-close", type: "CLOSING", periodId: "p-jun" }, admin)

    expect(tx.accountingPeriod.updateMany).toHaveBeenCalledWith({
      where: { financialYearId: "fy-1" },
      data: { status: "LOCKED" },
    })
    expect(tx.financialYear.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "fy-1" },
        data: expect.objectContaining({ status: "CLOSED", closedBy: "user-admin" }),
      })
    )
  })

  it("does nothing for an ordinary journal", async () => {
    await lockYearAfterClosing(tx as never, { id: "j-1", type: "MANUAL", periodId: "p-1" }, admin)

    expect(tx.accountingPeriod.updateMany).not.toHaveBeenCalled()
    expect(tx.financialYear.update).not.toHaveBeenCalled()
  })
})
