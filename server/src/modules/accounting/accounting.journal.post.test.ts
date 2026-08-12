import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    journal: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    journalLine: { createMany: vi.fn() },
    accountingPeriod: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    financialYear: { update: vi.fn() },
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
import { approveJournal, rejectJournal, reverseJournal } from "./accounting.journal.post"
import { utcDate } from "./accounting.utils"

const tx = (prisma as unknown as { __tx: any }).__tx

const finance = { sub: "user-finance", role: "FINANCE_OFFICER", email: "f@d.com", mustChangePassword: false } as never
const admin = { sub: "user-admin", role: "SUPER_ADMIN", email: "a@d.com", mustChangePassword: false } as never
const otherAdmin = { sub: "user-admin-2", role: "SUPER_ADMIN", email: "a2@d.com", mustChangePassword: false } as never

const D = (v: string | number) => new Prisma.Decimal(v)

const lines = [
  { accountId: "acc-exp", debit: D("70500.00"), credit: D(0), narration: null, departmentId: null, employeeId: null, sourceCurrency: null, sourceAmount: null, fxRateToBdt: null, sortOrder: 0 },
  { accountId: "acc-bank", debit: D(0), credit: D("70500.00"), narration: null, departmentId: null, employeeId: null, sourceCurrency: null, sourceAmount: null, fxRateToBdt: null, sortOrder: 1 },
]

const pending = {
  id: "j-1",
  journalNo: "BS-JV-00001",
  status: "PENDING_APPROVAL",
  type: "MANUAL",
  date: utcDate(2026, 7, 31),
  narration: "Office rent for July",
  periodId: "p-1",
  createdBy: "user-finance",
  reversesId: null,
  lines,
}

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.idCounter.upsert.mockResolvedValue({ id: "JV", value: 2 })
  tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "OPEN" })
  tx.accountingPeriod.findFirst.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "OPEN" })
  tx.journal.findUnique.mockResolvedValue(pending)
  tx.journal.update.mockResolvedValue({ ...pending, status: "POSTED" })
  tx.journal.create.mockResolvedValue({ id: "j-2", journalNo: "BS-JV-00002" })
})

describe("approveJournal", () => {
  it("posts in the same transaction, stamping approvedBy and postedAt together", async () => {
    await approveJournal("j-1", admin)

    expect(tx.journal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "POSTED",
          approvedBy: "user-admin",
          approvedAt: expect.any(Date),
          postedAt: expect.any(Date),
        }),
      })
    )
  })

  it("403s when the approver is the creator — creator must not be approver", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...pending, createdBy: "user-admin" })

    await expect(approveJournal("j-1", admin)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/created/i),
    })

    expect(tx.journal.update).not.toHaveBeenCalled()
  })

  it("lets a different Super Admin approve a Super Admin's journal", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...pending, createdBy: "user-admin" })

    await expect(approveJournal("j-1", otherAdmin)).resolves.toBeDefined()
  })

  it("409s when the journal is not PENDING_APPROVAL", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...pending, status: "DRAFT" })

    await expect(approveJournal("j-1", admin)).rejects.toMatchObject({ statusCode: 409 })
  })

  it("400s when the period closed between submission and approval", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "CLOSED" })

    await expect(approveJournal("j-1", admin)).rejects.toMatchObject({ statusCode: 400 })
  })

  it("400s if the journal became unbalanced after submission", async () => {
    tx.journal.findUnique.mockResolvedValue({
      ...pending,
      lines: [
        { ...lines[0] },
        { ...lines[1], credit: D("70000.00") },
      ],
    })

    await expect(approveJournal("j-1", admin)).rejects.toMatchObject({ statusCode: 400 })
  })

  it("writes both an APPROVE and a POST audit row", async () => {
    await approveJournal("j-1", admin)

    const actions = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action)
    expect(actions).toContain("APPROVE")
    expect(actions).toContain("POST")
  })

  it("locks the financial year when the posted journal is a CLOSING one", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...pending, type: "CLOSING" })
    tx.journal.update.mockResolvedValue({ ...pending, type: "CLOSING", status: "POSTED", periodId: "p-1" })
    tx.accountingPeriod.findUnique.mockResolvedValue({
      id: "p-1",
      year: 2026,
      month: 6,
      status: "OPEN",
      financialYearId: "fy-1",
    })

    await approveJournal("j-1", admin)

    expect(tx.accountingPeriod.updateMany).toHaveBeenCalledWith({
      where: { financialYearId: "fy-1" },
      data: { status: "LOCKED" },
    })
  })
})

describe("rejectJournal", () => {
  it("returns the journal to DRAFT with the note attached", async () => {
    tx.journal.update.mockResolvedValue({ ...pending, status: "DRAFT" })

    await rejectJournal("j-1", { note: "Rent belongs in 5206, not 5207" }, admin)

    expect(tx.journal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          rejectionNote: "Rent belongs in 5206, not 5207",
          submittedBy: null,
          submittedAt: null,
        }),
      })
    )
  })

  it("409s when it is not PENDING_APPROVAL", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...pending, status: "POSTED" })

    await expect(rejectJournal("j-1", { note: "no" }, admin)).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe("reverseJournal", () => {
  const posted = { ...pending, status: "POSTED", postedAt: new Date() }

  beforeEach(() => {
    tx.journal.findUnique.mockResolvedValue(posted)
  })

  it("creates a REVERSAL draft with every debit and credit swapped", async () => {
    await reverseJournal("j-1", { reason: "Posted to the wrong account" }, finance)

    const created = tx.journal.create.mock.calls[0][0].data
    const createdLines = created.lines.createMany.data
    expect(createdLines[0].debit.toFixed(2)).toBe("0.00")
    expect(createdLines[0].credit.toFixed(2)).toBe("70500.00")
    expect(createdLines[1].debit.toFixed(2)).toBe("70500.00")
    expect(createdLines[1].credit.toFixed(2)).toBe("0.00")
  })

  it("leaves the reversal's source fields null so it cannot collide with the original", async () => {
    tx.journal.findUnique.mockResolvedValue({
      ...posted,
      sourceModule: "PAYROLL",
      sourceRefId: "run-1",
      sourceEvent: "SALARY_ACCRUAL",
    })

    await reverseJournal("j-1", { reason: "Wrong month" }, finance)

    const created = tx.journal.create.mock.calls[0][0].data
    expect(created.sourceModule ?? null).toBeNull()
    expect(created.sourceRefId ?? null).toBeNull()
    expect(created.sourceEvent ?? null).toBeNull()
    expect(created.reversesId).toBe("j-1")
  })

  it("dates the reversal in the original's period while that period is still open", async () => {
    await reverseJournal("j-1", { reason: "Wrong account" }, finance)

    const created = tx.journal.create.mock.calls[0][0].data
    expect(created.date).toEqual(utcDate(2026, 7, 31))
    expect(created.periodId).toBe("p-1")
  })

  it("moves the reversal to the earliest open period once the original's has closed", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "CLOSED" })
    tx.accountingPeriod.findFirst.mockResolvedValue({
      id: "p-2",
      year: 2026,
      month: 9,
      status: "OPEN",
      startDate: utcDate(2026, 9, 1),
      endDate: utcDate(2026, 9, 30),
    })

    await reverseJournal("j-1", { reason: "Found in September" }, finance)

    const created = tx.journal.create.mock.calls[0][0].data
    expect(created.periodId).toBe("p-2")
    expect(created.date).toEqual(utcDate(2026, 9, 1))
  })

  it("marks the original REVERSED", async () => {
    await reverseJournal("j-1", { reason: "Wrong account" }, finance)

    expect(tx.journal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "j-1" },
        data: expect.objectContaining({ status: "REVERSED" }),
      })
    )
  })

  it("409s on a journal that is not POSTED", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...pending, status: "DRAFT" })

    await expect(reverseJournal("j-1", { reason: "x" }, finance)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it("409s on a second reversal of the same journal", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...posted, reversedBy: { journalNo: "BS-JV-00002" } })

    await expect(reverseJournal("j-1", { reason: "again" }, finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("BS-JV-00002"),
    })
  })

  it("produces a reversal that is itself balanced", async () => {
    await reverseJournal("j-1", { reason: "Wrong account" }, finance)

    const createdLines = tx.journal.create.mock.calls[0][0].data.lines.createMany.data
    const debit = createdLines.reduce((s: any, l: any) => s.plus(l.debit), new Prisma.Decimal(0))
    const credit = createdLines.reduce((s: any, l: any) => s.plus(l.credit), new Prisma.Decimal(0))
    expect(debit.toFixed(2)).toBe(credit.toFixed(2))
  })
})
