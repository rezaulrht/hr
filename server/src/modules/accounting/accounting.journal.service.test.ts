import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    journal: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    journalLine: { deleteMany: vi.fn(), createMany: vi.fn() },
    account: { findMany: vi.fn() },
    accountingPeriod: { findFirst: vi.fn() },
    idCounter: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      journal: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
      user: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { Prisma } from "../../generated/prisma/client"
import { utcDate } from "./accounting.utils"
import {
  assertGeneratedFiguresUnchanged,
  createJournal,
  deleteJournal,
  getJournal,
  nextJournalNo,
  submitJournal,
  toLineData,
  updateJournal,
} from "./accounting.journal.service"

const tx = (prisma as unknown as { __tx: any }).__tx

const finance = { sub: "user-finance", role: "FINANCE_OFFICER", email: "f@d.com", mustChangePassword: false } as never

const balancedLines = [
  { accountId: "acc-exp", debit: "70500.00", credit: "0" },
  { accountId: "acc-bank", debit: "0", credit: "70500.00" },
]

const draft = {
  id: "j-1",
  journalNo: "BS-JV-00001",
  status: "DRAFT",
  type: "MANUAL",
  date: utcDate(2026, 7, 31),
  narration: "Office rent for July",
  reference: null,
  periodId: "p-1",
  createdBy: "user-finance",
}

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.idCounter.upsert.mockResolvedValue({ id: "JV", value: 1 })
  tx.accountingPeriod.findFirst.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "OPEN" })
  tx.account.findMany.mockResolvedValue([
    { id: "acc-exp", code: "5206", name: "Office Rent", isGroup: false, isActive: true },
    { id: "acc-bank", code: "1242", name: "City Bank", isGroup: false, isActive: true },
  ])
  tx.journal.create.mockResolvedValue(draft)
  tx.journal.findUnique.mockResolvedValue({ ...draft, lines: [] })
})

describe("nextJournalNo", () => {
  it("issues a five-digit number matching the asset-tag convention", async () => {
    tx.idCounter.upsert.mockResolvedValue({ id: "JV", value: 123 })

    expect(await nextJournalNo(tx as never)).toBe("BS-JV-00123")
  })

  it("increments the JV counter rather than any other key", async () => {
    await nextJournalNo(tx as never)

    expect(tx.idCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "JV" } })
    )
  })
})

describe("toLineData", () => {
  it("converts string amounts to Decimal without going through a JS number", () => {
    const rows = toLineData([{ accountId: "a", debit: "0.10", credit: "0" }])

    expect(rows[0].debit).toBeInstanceOf(Prisma.Decimal)
    expect((rows[0].debit as Prisma.Decimal).toFixed(2)).toBe("0.10")
  })

  it("assigns sortOrder from array position so the editor's row order survives a round trip", () => {
    const rows = toLineData([
      { accountId: "a", debit: "1", credit: "0" },
      { accountId: "b", debit: "0", credit: "1" },
    ])

    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1])
  })
})

describe("createJournal", () => {
  it("creates a DRAFT with the period resolved from the date, not from the caller", async () => {
    await createJournal(
      { date: utcDate(2026, 7, 31), type: "MANUAL", narration: "Office rent for July", lines: balancedLines },
      finance
    )

    expect(tx.journal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          periodId: "p-1",
          createdBy: "user-finance",
        }),
      })
    )
  })

  it("400s an unbalanced journal, naming both totals", async () => {
    await expect(
      createJournal(
        {
          date: utcDate(2026, 7, 31),
          type: "MANUAL",
          narration: "Rent",
          lines: [
            { accountId: "acc-exp", debit: "70500.00", credit: "0" },
            { accountId: "acc-bank", debit: "0", credit: "70000.00" },
          ],
        },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("70,500.00") })

    expect(tx.journal.create).not.toHaveBeenCalled()
  })

  it("400s when the date falls in a closed period", async () => {
    tx.accountingPeriod.findFirst.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "CLOSED" })

    await expect(
      createJournal(
        { date: utcDate(2026, 7, 31), type: "MANUAL", narration: "Rent", lines: balancedLines },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("400s when a line points at a group account", async () => {
    tx.account.findMany.mockResolvedValue([
      { id: "acc-exp", code: "5200", name: "Administrative & Selling", isGroup: true, isActive: true },
      { id: "acc-bank", code: "1242", name: "City Bank", isGroup: false, isActive: true },
    ])

    await expect(
      createJournal(
        { date: utcDate(2026, 7, 31), type: "MANUAL", narration: "Rent", lines: balancedLines },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("5200") })
  })

  it("409s on a second OPENING journal for the same financial year", async () => {
    tx.journal.findFirst.mockResolvedValue({ id: "j-open", journalNo: "BS-JV-00001" })
    tx.accountingPeriod.findFirst.mockResolvedValue({
      id: "p-1",
      year: 2026,
      month: 7,
      status: "OPEN",
      financialYear: { id: "fy-1", name: "FY 2026-27", startDate: utcDate(2026, 7, 1) },
    })

    await expect(
      createJournal(
        { date: utcDate(2026, 7, 1), type: "OPENING", narration: "Opening balances", lines: balancedLines },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("BS-JV-00001") })
  })

  it("400s an OPENING journal not dated the first day of its financial year", async () => {
    tx.journal.findFirst.mockResolvedValue(null)
    tx.accountingPeriod.findFirst.mockResolvedValue({
      id: "p-1",
      year: 2026,
      month: 7,
      status: "OPEN",
      financialYear: { id: "fy-1", name: "FY 2026-27", startDate: utcDate(2026, 7, 1) },
    })

    await expect(
      createJournal(
        { date: utcDate(2026, 7, 15), type: "OPENING", narration: "Opening balances", lines: balancedLines },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("writes a JOURNAL CREATE audit row", async () => {
    await createJournal(
      { date: utcDate(2026, 7, 31), type: "MANUAL", narration: "Office rent for July", lines: balancedLines },
      finance
    )

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "JOURNAL", action: "CREATE", entityId: "j-1" }),
      })
    )
  })
})

describe("updateJournal", () => {
  it("replaces every line rather than patching them, so sortOrder cannot drift", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, lines: [] })
    tx.journal.update.mockResolvedValue(draft)

    await updateJournal("j-1", { lines: balancedLines }, finance)

    expect(tx.journalLine.deleteMany).toHaveBeenCalledWith({ where: { journalId: "j-1" } })
    expect(tx.journalLine.createMany).toHaveBeenCalled()
  })

  it("allows an edit while PENDING_APPROVAL", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, status: "PENDING_APPROVAL", lines: [] })
    tx.journal.update.mockResolvedValue(draft)

    await expect(updateJournal("j-1", { narration: "Corrected" }, finance)).resolves.toBeDefined()
  })

  it("409s on a POSTED journal — corrections are reversal-only", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, status: "POSTED", lines: [] })

    await expect(updateJournal("j-1", { narration: "Sneaky" }, finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/reverse/i),
    })
  })

  it("409s on a REVERSED journal", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, status: "REVERSED", lines: [] })

    await expect(updateJournal("j-1", { narration: "Sneaky" }, finance)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it("records the edit in the audit trail with a before and an after", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, lines: [] })
    tx.journal.update.mockResolvedValue({ ...draft, narration: "Office rent for July 2026" })

    await updateJournal("j-1", { narration: "Office rent for July 2026" }, finance)

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "JOURNAL",
          action: "UPDATE",
          before: expect.objectContaining({ narration: "Office rent for July" }),
          after: expect.objectContaining({ narration: "Office rent for July 2026" }),
        }),
      })
    )
  })

  it("records the figures themselves, not just how many lines there were", async () => {
    tx.journal.findUnique.mockResolvedValue({
      ...draft,
      lines: [
        { accountId: "acc-exp", debit: new Prisma.Decimal("70500.00"), credit: new Prisma.Decimal(0), narration: null },
        { accountId: "acc-bank", debit: new Prisma.Decimal(0), credit: new Prisma.Decimal("70500.00"), narration: null },
      ],
    })
    tx.journal.update.mockResolvedValue(draft)

    // A typo corrected on a draft: 70,500 becomes 7,050. The line count does
    // not move, so an audit trail keyed on it records nothing at all — and
    // "the edited version is also recorded" is the whole rigor model here.
    await updateJournal(
      "j-1",
      {
        lines: [
          { accountId: "acc-exp", debit: "7050.00", credit: "0" },
          { accountId: "acc-bank", debit: "0", credit: "7050.00" },
        ],
      },
      finance
    )

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          before: expect.objectContaining({
            lines: [
              { accountId: "acc-exp", debit: "70500.00", credit: "0.00" },
              { accountId: "acc-bank", debit: "0.00", credit: "70500.00" },
            ],
          }),
          after: expect.objectContaining({
            lines: [
              { accountId: "acc-exp", debit: "7050.00", credit: "0.00" },
              { accountId: "acc-bank", debit: "0.00", credit: "7050.00" },
            ],
          }),
        }),
      })
    )
  })

  it("re-resolves the period when the date moves", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, lines: [] })
    tx.accountingPeriod.findFirst.mockResolvedValue({ id: "p-2", year: 2026, month: 8, status: "OPEN" })
    tx.journal.update.mockResolvedValue(draft)

    await updateJournal("j-1", { date: utcDate(2026, 8, 5) }, finance)

    expect(tx.journal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ periodId: "p-2" }) })
    )
  })

  it("409s on retyping a reversal draft, which would leave the original reversed by nothing", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, type: "REVERSAL", lines: [] })

    await expect(updateJournal("j-1", { lines: balancedLines }, finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/derived/i),
    })
    expect(tx.journalLine.deleteMany).not.toHaveBeenCalled()
  })

  it("409s on retyping the year-end closing entry", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, type: "CLOSING", lines: [] })

    await expect(updateJournal("j-1", { lines: balancedLines }, finance)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it("still lets a reversal's narration be reworded", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, type: "REVERSAL", lines: [] })
    tx.journal.update.mockResolvedValue({ ...draft, narration: "Reversal — wrong account" })

    await expect(
      updateJournal("j-1", { narration: "Reversal — wrong account" }, finance)
    ).resolves.toBeDefined()
  })
})

describe("assertGeneratedFiguresUnchanged", () => {
  const reversal = { type: "REVERSAL" as const, journalNo: "BS-JV-00042", date: utcDate(2026, 7, 31) }
  const manual = { ...reversal, type: "MANUAL" as const }

  it("lets a manual journal be retyped freely — that is the whole point of a draft", () => {
    expect(() =>
      assertGeneratedFiguresUnchanged(manual, { lines: balancedLines, date: utcDate(2026, 8, 1) })
    ).not.toThrow()
  })

  it("refuses new lines on a reversal", () => {
    expect(() => assertGeneratedFiguresUnchanged(reversal, { lines: balancedLines })).toThrow(
      /derived/i
    )
  })

  it("refuses new lines on the year-end closing entry", () => {
    expect(() =>
      assertGeneratedFiguresUnchanged({ ...reversal, type: "CLOSING" }, { lines: balancedLines })
    ).toThrow(/derived/i)
  })

  it("refuses a moved date, which would move the correction into another period", () => {
    expect(() =>
      assertGeneratedFiguresUnchanged(reversal, { date: utcDate(2026, 8, 31) })
    ).toThrow(/derived/i)
  })

  it("allows the same date back — the editor sends every field on every save", () => {
    expect(() =>
      assertGeneratedFiguresUnchanged(reversal, { date: utcDate(2026, 7, 31) })
    ).not.toThrow()
  })

  it("allows a narration-only edit, since a reason may genuinely need rewording", () => {
    expect(() =>
      assertGeneratedFiguresUnchanged(reversal, { narration: "Reversal — wrong account" })
    ).not.toThrow()
  })
})

describe("deleteJournal", () => {
  it("deletes a DRAFT and still records that it existed", async () => {
    tx.journal.findUnique.mockResolvedValue(draft)

    await deleteJournal("j-1", finance)

    expect(tx.journal.delete).toHaveBeenCalledWith({ where: { id: "j-1" } })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "JOURNAL", action: "DELETE" }),
      })
    )
  })

  it("409s on a PENDING_APPROVAL journal — withdraw it to DRAFT first", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, status: "PENDING_APPROVAL" })

    await expect(deleteJournal("j-1", finance)).rejects.toMatchObject({ statusCode: 409 })
  })

  it("409s on a POSTED journal", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, status: "POSTED" })

    await expect(deleteJournal("j-1", finance)).rejects.toMatchObject({ statusCode: 409 })
  })

  it("returns the original to POSTED when its reversal draft is deleted", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, type: "REVERSAL", reversesId: "j-orig" })
    tx.journal.update.mockResolvedValue({ id: "j-orig", journalNo: "BS-JV-00042" })

    await deleteJournal("j-1", finance)

    expect(tx.journal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "j-orig" },
        data: { status: "POSTED" },
      })
    )
  })

  it("audits that release against the original, not only against the deleted reversal", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, type: "REVERSAL", reversesId: "j-orig" })
    tx.journal.update.mockResolvedValue({ id: "j-orig", journalNo: "BS-JV-00042" })

    await deleteJournal("j-1", finance)

    // A posted journal quietly changing status is the one thing this module
    // promises cannot happen; the row explaining it hangs off the original.
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "JOURNAL",
          entityId: "j-orig",
          action: "UPDATE",
          before: expect.objectContaining({ status: "REVERSED" }),
          after: expect.objectContaining({ status: "POSTED" }),
        }),
      })
    )
  })
})

describe("submitJournal", () => {
  it("moves DRAFT to PENDING_APPROVAL and stamps the submitter", async () => {
    tx.journal.findUnique.mockResolvedValue({
      ...draft,
      lines: [
        { debit: new Prisma.Decimal("70500.00"), credit: new Prisma.Decimal(0) },
        { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal("70500.00") },
      ],
    })
    tx.journal.update.mockResolvedValue({ ...draft, status: "PENDING_APPROVAL" })

    await submitJournal("j-1", finance)

    expect(tx.journal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING_APPROVAL",
          submittedBy: "user-finance",
          rejectionNote: null,
        }),
      })
    )
  })

  it("re-checks the balance at submit, catching a draft saved before a line was edited", async () => {
    tx.journal.findUnique.mockResolvedValue({
      ...draft,
      lines: [
        { debit: new Prisma.Decimal("70500.00"), credit: new Prisma.Decimal(0) },
        { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal("70000.00") },
      ],
    })

    await expect(submitJournal("j-1", finance)).rejects.toMatchObject({ statusCode: 400 })
  })

  it("409s when it is not in DRAFT", async () => {
    tx.journal.findUnique.mockResolvedValue({ ...draft, status: "PENDING_APPROVAL", lines: [] })

    await expect(submitJournal("j-1", finance)).rejects.toMatchObject({ statusCode: 409 })
  })

  it("clears any earlier rejection note on resubmission", async () => {
    tx.journal.findUnique.mockResolvedValue({
      ...draft,
      rejectionNote: "Wrong account",
      lines: [
        { debit: new Prisma.Decimal("1.00"), credit: new Prisma.Decimal(0) },
        { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal("1.00") },
      ],
    })
    tx.journal.update.mockResolvedValue({ ...draft, status: "PENDING_APPROVAL" })

    await submitJournal("j-1", finance)

    expect(tx.journal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionNote: null }) })
    )
  })
})

describe("getJournal", () => {
  const posted = {
    ...draft,
    status: "POSTED",
    createdBy: "user-finance",
    submittedBy: "user-finance",
    approvedBy: "user-admin",
    lines: [],
  }

  it("resolves each actor id to a name", async () => {
    ;(prisma.journal.findUnique as any).mockResolvedValue(posted)
    ;(prisma.user.findMany as any).mockResolvedValue([
      { id: "user-finance", email: "f@d.com", employee: { fullName: "Rumana Haque" } },
      { id: "user-admin", email: "a@d.com", employee: { fullName: "Tanvir Alam" } },
    ])

    const journal = await getJournal("j-1")

    expect(journal.createdByUser).toEqual({
      id: "user-finance",
      email: "f@d.com",
      fullName: "Rumana Haque",
    })
    expect(journal.approvedByUser?.fullName).toBe("Tanvir Alam")
    // Creator and submitter are the same person here; asking for one id twice
    // must not cost a second lookup.
    expect((prisma.user.findMany as any).mock.calls[0][0].where.id.in).toEqual([
      "user-finance",
      "user-admin",
    ])
  })

  it("leaves an unapproved journal's approver null rather than guessing", async () => {
    ;(prisma.journal.findUnique as any).mockResolvedValue({
      ...posted,
      status: "PENDING_APPROVAL",
      approvedBy: null,
    })
    ;(prisma.user.findMany as any).mockResolvedValue([
      { id: "user-finance", email: "f@d.com", employee: { fullName: "Rumana Haque" } },
    ])

    const journal = await getJournal("j-1")

    expect(journal.approvedByUser).toBeNull()
    expect(journal.submittedByUser?.fullName).toBe("Rumana Haque")
  })

  it("falls back to the login when an account has no employee record", async () => {
    ;(prisma.journal.findUnique as any).mockResolvedValue(posted)
    ;(prisma.user.findMany as any).mockResolvedValue([
      { id: "user-finance", email: "setup@d.com", employee: null },
    ])

    const journal = await getJournal("j-1")

    expect(journal.createdByUser?.fullName).toBeNull()
    // A deleted account is not an error: the row is simply absent, and the
    // screen falls back rather than the request failing.
    expect(journal.approvedByUser).toBeNull()
  })
})
