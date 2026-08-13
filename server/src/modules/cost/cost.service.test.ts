import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../accounting/accounting.posting", () => ({ postSystemJournal: vi.fn() }))

vi.mock("../../config/prisma", () => {
  const tx = {
    costCategory: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    costCommitment: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    operatingCost: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    postingRule: {
      findMany: vi.fn(async ({ where }: any) => [
        { key: "ELECTRICITY", account: { code: "5209" } },
        { key: "OTHER", account: { code: "5207" } },
        { key: "*", account: { code: "5207" } },
        { key: "PAYABLE", account: { code: "2110" } },
        ...(where?.event === "COST_PAYMENT" ? [{ key: "BANK", account: { code: "1242" } }] : []),
      ]),
    },
    auditLog: { create: vi.fn() },
    // `updateCost` asks whether a journal was posted from this bill before it
    // refuses an edit to the figures it was built from.
    journal: { findFirst: vi.fn(async () => null) },
  }
  return {
    default: {
      costCategory: { findMany: vi.fn(), findUnique: vi.fn() },
      costCommitment: { findMany: vi.fn() },
      operatingCost: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { dec } from "../payroll/payroll.money"
import { createCost, payCost, updateCommitment, updateCost } from "./cost.service"

const tx = (prisma as unknown as { __tx: any }).__tx

const finance = {
  sub: "user-finance",
  role: "FINANCE_OFFICER",
  email: "finance@demo.com",
  mustChangePassword: false,
} as never

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.operatingCost.findUnique.mockResolvedValue({
    id: "cost-1", status: "PENDING", label: "One-off repair", payee: "Handyman",
    amount: dec(500), currency: "BDT", periodMonth: 3, periodYear: 2026, category: { code: "OTHER" },
  })
})

describe("createCost", () => {
  it("rejects USD because operating costs do not store an FX snapshot", async () => {
    tx.costCategory.findUnique.mockResolvedValue({ id: "cat-1", code: "OTHER", name: "Other" })

    await expect(
      createCost(
        {
          categoryId: "cat-1",
          label: "USD software license",
          payee: "Vendor",
          periodMonth: 3,
          periodYear: 2026,
          amount: 100,
          currency: "USD",
        },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(tx.operatingCost.create).not.toHaveBeenCalled()
  })

  it("409s on a second bill for the same commitment and period, naming the existing one", async () => {
    tx.costCategory.findUnique.mockResolvedValue({ id: "cat-1", code: "RENT", name: "Office rent" })
    tx.costCommitment.findUnique.mockResolvedValue({ id: "cm-1", label: "Office rent — Banani" })
    tx.operatingCost.findFirst.mockResolvedValue({
      id: "cost-existing",
      label: "Office rent — Banani",
      periodMonth: 3,
      periodYear: 2026,
    })

    await expect(
      createCost(
        {
          categoryId: "cat-1",
          commitmentId: "cm-1",
          label: "Office rent — Banani",
          payee: "Landlord",
          periodMonth: 3,
          periodYear: 2026,
          amount: 25000,
        },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 409 })

    expect(tx.operatingCost.create).not.toHaveBeenCalled()
  })

  it("allows two bills in the same period when neither is linked to a commitment", async () => {
    tx.costCategory.findUnique.mockResolvedValue({ id: "cat-1", code: "OTHER", name: "Other" })
    tx.operatingCost.create.mockResolvedValue({ id: "cost-1", currency: "BDT", periodMonth: 3, periodYear: 2026 })

    await createCost(
      {
        categoryId: "cat-1",
        label: "One-off repair",
        payee: "Handyman",
        periodMonth: 3,
        periodYear: 2026,
        amount: 500,
      },
      finance
    )

    // Ad-hoc costs have no period to collide on — the clash check never runs.
    expect(tx.operatingCost.findFirst).not.toHaveBeenCalled()
    expect(tx.operatingCost.create).toHaveBeenCalledOnce()
  })

  it("writes an AuditLog row in the same transaction as the bill", async () => {
    tx.costCategory.findUnique.mockResolvedValue({ id: "cat-1", code: "OTHER", name: "Other" })
    tx.operatingCost.create.mockResolvedValue({ id: "cost-1", currency: "BDT", periodMonth: 3, periodYear: 2026 })

    await createCost(
      {
        categoryId: "cat-1",
        label: "One-off repair",
        payee: "Handyman",
        periodMonth: 3,
        periodYear: 2026,
        amount: 500,
      },
      finance
    )

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "COST", action: "CREATE", entityId: "cost-1" }),
      })
    )
  })
})

describe("updateCost", () => {
  const pending = () =>
    tx.operatingCost.findUnique.mockResolvedValue({
      id: "cost-1",
      status: "PENDING",
      categoryId: "cat-1",
      label: "One-off repair",
      payee: "Handyman",
      amount: dec(500),
      currency: "BDT",
    })

  it("rejects an edit to a figure the posted journal was built from, naming it", async () => {
    pending()
    tx.journal.findFirst.mockResolvedValue({ journalNo: "JV-000042" })

    await expect(updateCost("cost-1", { amount: 600 }, finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("JV-000042"),
    })
    expect(tx.operatingCost.update).not.toHaveBeenCalled()
  })

  it("rejects a re-categorisation, which would move the expense to another account", async () => {
    pending()
    tx.journal.findFirst.mockResolvedValue({ journalNo: "JV-000042" })
    tx.costCategory.findUnique.mockResolvedValue({ id: "cat-2", code: "RENT" })

    await expect(updateCost("cost-1", { categoryId: "cat-2" }, finance)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  /**
   * The narration is not a figure. Refusing to fix a misspelt payee would be
   * a rule with nothing behind it — the ledger line's text is cosmetic, and a
   * reversal to correct one would be absurd.
   */
  it("allows a correction to the payee, which only reaches the ledger as narration", async () => {
    pending()
    tx.journal.findFirst.mockResolvedValue({ journalNo: "JV-000042" })
    tx.operatingCost.update.mockResolvedValue({ id: "cost-1", payee: "Handyman Ltd" })

    await expect(updateCost("cost-1", { payee: "Handyman Ltd" }, finance)).resolves.toBeTruthy()
    expect(tx.operatingCost.update).toHaveBeenCalled()
  })

  it("allows an amount correction while no journal has been posted from it", async () => {
    pending()
    tx.journal.findFirst.mockResolvedValue(null)
    tx.operatingCost.update.mockResolvedValue({ id: "cost-1", amount: 600 })

    await expect(updateCost("cost-1", { amount: 600 }, finance)).resolves.toBeTruthy()
  })

  it("does not go looking for a journal when nothing material changed", async () => {
    pending()

    await updateCost("cost-1", { amount: 500 }, finance)

    expect(tx.journal.findFirst).not.toHaveBeenCalled()
  })
})

describe("payCost", () => {
  it("409s when paying a bill that is already PAID", async () => {
    tx.operatingCost.findUnique.mockResolvedValue({ id: "cost-1", status: "PAID" })

    await expect(payCost("cost-1", {}, finance)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.operatingCost.update).not.toHaveBeenCalled()
  })

  it("stamps paidAt, paidBy and paymentRef on payment", async () => {
    tx.operatingCost.findUnique.mockResolvedValue({
      id: "cost-1", status: "PENDING", label: "One-off repair", payee: "Handyman",
      amount: dec(500), currency: "BDT", category: { code: "OTHER" },
    })
    tx.operatingCost.update.mockResolvedValue({ id: "cost-1", status: "PAID" })

    await payCost("cost-1", { paidAt: "2026-08-10", paymentRef: "TXN123" }, finance)

    expect(tx.operatingCost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PAID",
          paidAt: new Date("2026-08-10T00:00:00.000Z"),
          paidBy: "user-finance",
          paymentRef: "TXN123",
        }),
      })
    )
  })

  it("defaults paidAt to now when the caller does not supply one", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"))

    tx.operatingCost.findUnique.mockResolvedValue({
      id: "cost-1", status: "PENDING", label: "One-off repair", payee: "Handyman",
      amount: dec(500), currency: "BDT", category: { code: "OTHER" },
    })
    tx.operatingCost.update.mockResolvedValue({ id: "cost-1", status: "PAID" })

    await payCost("cost-1", {}, finance)

    expect(tx.operatingCost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidAt: new Date("2026-08-15T12:00:00.000Z") }),
      })
    )

    vi.useRealTimers()
  })
})

describe("updateCommitment", () => {
  it("ends a commitment by setting endedOn rather than deleting it", async () => {
    tx.costCommitment.findUnique.mockResolvedValue({
      id: "cm-1",
      label: "Office rent — Banani",
      payee: "Landlord",
      amount: null,
      currency: "BDT",
      dueDay: 5,
      notes: null,
      endedOn: null,
    })
    tx.costCommitment.update.mockResolvedValue({
      id: "cm-1",
      endedOn: new Date("2026-08-01T00:00:00.000Z"),
    })

    await updateCommitment("cm-1", { endedOn: "2026-08-01" }, finance)

    expect(tx.costCommitment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endedOn: new Date("2026-08-01T00:00:00.000Z") }),
      })
    )
  })
})
