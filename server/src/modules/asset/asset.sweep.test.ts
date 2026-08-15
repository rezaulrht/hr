import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    assetRecovery: { findMany: vi.fn(), updateMany: vi.fn() },
    employee: { findUnique: vi.fn() },
    event: { create: vi.fn() },
  }
  return {
    default: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import { Prisma } from "../../generated/prisma/client"
import prisma from "../../config/prisma"
import { sweepRecoveriesCollected } from "./asset.sweep"

const tx = (prisma as unknown as { __tx: any }).__tx
const D = (v: string) => new Prisma.Decimal(v)

const recovery = (over: Record<string, unknown> = {}) => ({
  id: "rec-1",
  employeeId: "emp-1",
  assetId: "a-1",
  amount: D("45000.00"),
  currency: "BDT",
  asset: { assetTag: "BS-AST-00001", name: "ThinkPad T14" },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  tx.assetRecovery.findMany.mockResolvedValue([recovery()])
  tx.assetRecovery.updateMany.mockResolvedValue({ count: 1 })
  tx.employee.findUnique.mockResolvedValue({ reportingManagerId: null })
  tx.event.create.mockResolvedValue({})
})

describe("sweepRecoveriesCollected", () => {
  it("flips only the recoveries the caller's where clause selected", async () => {
    tx.assetRecovery.findMany.mockResolvedValue([recovery(), recovery({ id: "rec-2", employeeId: "emp-1" })])

    await sweepRecoveriesCollected(tx, { employeeId: "emp-1", status: "PENDING" }, "user-fin")

    expect(tx.assetRecovery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ employeeId: "emp-1", status: "PENDING" }),
        data: expect.objectContaining({ status: "RECOVERED" }),
      })
    )
  })

  it("reads before it updates", async () => {
    await sweepRecoveriesCollected(tx, { status: "PENDING" }, "user-fin")

    const read = tx.assetRecovery.findMany.mock.invocationCallOrder[0]
    const write = tx.assetRecovery.updateMany.mock.invocationCallOrder[0]
    expect(read).toBeLessThan(write)
  })

  it("does nothing when nothing matches", async () => {
    tx.assetRecovery.findMany.mockResolvedValue([])

    await sweepRecoveriesCollected(tx, { status: "PENDING" }, "user-fin")

    expect(tx.assetRecovery.updateMany).not.toHaveBeenCalled()
  })

  it("emits one event per recovery, not one per run", async () => {
    tx.assetRecovery.findMany.mockResolvedValue([
      recovery({ id: "rec-1", employeeId: "emp-1" }),
      recovery({ id: "rec-2", employeeId: "emp-2" }),
    ])

    await sweepRecoveriesCollected(tx, { status: "PENDING" }, "user-fin")

    expect(tx.event.create).toHaveBeenCalledTimes(2)
  })
})
