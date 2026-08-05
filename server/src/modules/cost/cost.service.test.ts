import { beforeEach, describe, expect, it, vi } from "vitest"

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
    auditLog: { create: vi.fn() },
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
import { createCost, payCost, updateCommitment } from "./cost.service"

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
})

describe("createCost", () => {
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
    tx.operatingCost.create.mockResolvedValue({ id: "cost-1" })

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
    tx.operatingCost.create.mockResolvedValue({ id: "cost-1" })

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

describe("payCost", () => {
  it("409s when paying a bill that is already PAID", async () => {
    tx.operatingCost.findUnique.mockResolvedValue({ id: "cost-1", status: "PAID" })

    await expect(payCost("cost-1", {}, finance)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.operatingCost.update).not.toHaveBeenCalled()
  })

  it("stamps paidAt, paidBy and paymentRef on payment", async () => {
    tx.operatingCost.findUnique.mockResolvedValue({ id: "cost-1", status: "PENDING" })
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

    tx.operatingCost.findUnique.mockResolvedValue({ id: "cost-1", status: "PENDING" })
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
