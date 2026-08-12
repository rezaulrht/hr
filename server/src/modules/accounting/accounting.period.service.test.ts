import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    financialYear: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    accountingPeriod: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    journal: { count: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      financialYear: { findMany: vi.fn() },
      accountingPeriod: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { utcDate } from "./accounting.utils"
import {
  closePeriod,
  createFinancialYear,
  deleteFinancialYear,
  reopenPeriod,
  resolveOpenPeriod,
} from "./accounting.period.service"

const tx = (prisma as unknown as { __tx: any }).__tx

const finance = { sub: "user-finance", role: "FINANCE_OFFICER", email: "f@d.com", mustChangePassword: false } as never
const admin = { sub: "user-admin", role: "SUPER_ADMIN", email: "a@d.com", mustChangePassword: false } as never

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.financialYear.findFirst.mockResolvedValue(null)
  tx.journal.count.mockResolvedValue(0)
  tx.journal.findMany.mockResolvedValue([])
})

describe("createFinancialYear", () => {
  it("names a July start FY 2026-27 and ends it on 30 June", async () => {
    tx.financialYear.create.mockResolvedValue({ id: "fy-1", name: "FY 2026-27" })
    tx.financialYear.findUnique.mockResolvedValue({ id: "fy-1", periods: [] })

    await createFinancialYear({ startDate: utcDate(2026, 7, 1) }, finance)

    expect(tx.financialYear.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "FY 2026-27",
          startDate: utcDate(2026, 7, 1),
          endDate: utcDate(2027, 6, 30),
        }),
      })
    )
  })

  it("generates exactly twelve OPEN periods spanning July to June", async () => {
    tx.financialYear.create.mockResolvedValue({ id: "fy-1", name: "FY 2026-27" })
    tx.financialYear.findUnique.mockResolvedValue({ id: "fy-1", periods: [] })

    await createFinancialYear({ startDate: utcDate(2026, 7, 1) }, finance)

    const rows = tx.accountingPeriod.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(12)
    expect(rows[0]).toMatchObject({ year: 2026, month: 7, status: "OPEN" })
    expect(rows[11]).toMatchObject({ year: 2027, month: 6, status: "OPEN" })
  })

  it("409s when a year already covers that start date", async () => {
    tx.financialYear.findFirst.mockResolvedValue({ id: "fy-old", name: "FY 2026-27" })

    await expect(
      createFinancialYear({ startDate: utcDate(2026, 7, 1) }, finance)
    ).rejects.toMatchObject({ statusCode: 409 })

    expect(tx.financialYear.create).not.toHaveBeenCalled()
  })

  it("400s when the start date is not the first of a month", async () => {
    await expect(
      createFinancialYear({ startDate: utcDate(2026, 7, 15) }, finance)
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe("deleteFinancialYear", () => {
  it("deletes a year with no journals in it", async () => {
    tx.financialYear.findUnique.mockResolvedValue({ id: "fy-1", name: "FY 2026-27", status: "OPEN" })

    await deleteFinancialYear("fy-1", admin)

    expect(tx.financialYear.delete).toHaveBeenCalledWith({ where: { id: "fy-1" } })
  })

  it("409s once any journal exists in one of its periods", async () => {
    tx.financialYear.findUnique.mockResolvedValue({ id: "fy-1", name: "FY 2026-27", status: "OPEN" })
    tx.journal.count.mockResolvedValue(4)

    await expect(deleteFinancialYear("fy-1", admin)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.financialYear.delete).not.toHaveBeenCalled()
  })
})

describe("closePeriod", () => {
  it("closes an open period with nothing outstanding", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "OPEN" })
    tx.accountingPeriod.update.mockResolvedValue({ id: "p-1", status: "CLOSED" })

    await closePeriod("p-1", admin)

    expect(tx.accountingPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CLOSED", closedBy: "user-admin" }),
      })
    )
  })

  it("409s naming the journals still in DRAFT or PENDING_APPROVAL", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "OPEN" })
    tx.journal.findMany.mockResolvedValue([
      { journalNo: "BS-JV-00007", status: "DRAFT" },
      { journalNo: "BS-JV-00009", status: "PENDING_APPROVAL" },
    ])

    await expect(closePeriod("p-1", admin)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("BS-JV-00007"),
    })

    expect(tx.accountingPeriod.update).not.toHaveBeenCalled()
  })

  it("409s on a LOCKED period", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "LOCKED" })

    await expect(closePeriod("p-1", admin)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("reopenPeriod", () => {
  it("reopens a closed period, recording who and why", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "CLOSED" })
    tx.accountingPeriod.update.mockResolvedValue({ id: "p-1", status: "OPEN" })

    await reopenPeriod("p-1", { reason: "Late vendor invoice" }, admin)

    expect(tx.accountingPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "OPEN",
          reopenedBy: "user-admin",
          reopenReason: "Late vendor invoice",
        }),
      })
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "ACCOUNTING_PERIOD", action: "REOPEN" }),
      })
    )
  })

  it("409s on a LOCKED period — a locked year is permanent", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "LOCKED" })

    await expect(
      reopenPeriod("p-1", { reason: "Oops" }, admin)
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("409s on a period that is already OPEN", async () => {
    tx.accountingPeriod.findUnique.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "OPEN" })

    await expect(
      reopenPeriod("p-1", { reason: "Oops" }, admin)
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("resolveOpenPeriod", () => {
  it("returns the period covering the date", async () => {
    tx.accountingPeriod.findFirst.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "OPEN" })

    const period = await resolveOpenPeriod(tx as never, utcDate(2026, 7, 31))

    expect(period.id).toBe("p-1")
  })

  it("400s with the date when no financial year covers it", async () => {
    tx.accountingPeriod.findFirst.mockResolvedValue(null)

    await expect(resolveOpenPeriod(tx as never, utcDate(2030, 1, 1))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("2030-01-01"),
    })
  })

  it("400s naming the month when the period is CLOSED", async () => {
    tx.accountingPeriod.findFirst.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "CLOSED" })

    await expect(resolveOpenPeriod(tx as never, utcDate(2026, 7, 31))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/July 2026.*closed/i),
    })
  })

  it("400s when the period is LOCKED", async () => {
    tx.accountingPeriod.findFirst.mockResolvedValue({ id: "p-1", year: 2026, month: 7, status: "LOCKED" })

    await expect(resolveOpenPeriod(tx as never, utcDate(2026, 7, 31))).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})
