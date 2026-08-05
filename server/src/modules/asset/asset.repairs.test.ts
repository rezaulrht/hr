import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    asset: { findUnique: vi.fn() },
    assetRepair: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    assetAssignment: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      assetRepair: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { receiveFromRepair, sendForRepair } from "./asset.repairs"

const tx = (prisma as unknown as { __tx: any }).__tx
const hr = { sub: "user-hr", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as never
const inService = { id: "ast-1", assetTag: "BS-AST-00042", name: "ThinkPad", lifecycle: "IN_SERVICE" }

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
})

describe("sendForRepair", () => {
  it("succeeds over an OPEN assignment and leaves the holder untouched", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetRepair.findFirst.mockResolvedValue(null)
    tx.assetRepair.create.mockResolvedValue({ id: "rep-1" })

    await sendForRepair("ast-1", { fault: "Screen flicker" }, hr)

    // The employee still has the machine on their record, it goes to the
    // vendor for a week, it comes back to them. Forcing a return-and-reissue
    // would fabricate two custody events that never occurred.
    expect(tx.assetAssignment.findFirst).not.toHaveBeenCalled()
    expect(tx.assetRepair.create).toHaveBeenCalledOnce()
  })

  it("409s on a RETIRED asset", async () => {
    tx.asset.findUnique.mockResolvedValue({ ...inService, lifecycle: "RETIRED" })

    await expect(sendForRepair("ast-1", { fault: "x" }, hr)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it("409s on a LOST asset", async () => {
    tx.asset.findUnique.mockResolvedValue({ ...inService, lifecycle: "LOST" })

    await expect(sendForRepair("ast-1", { fault: "x" }, hr)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it("409s when a repair is already open for the asset", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetRepair.findFirst.mockResolvedValue({ id: "rep-existing" })

    await expect(sendForRepair("ast-1", { fault: "x" }, hr)).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(tx.assetRepair.create).not.toHaveBeenCalled()
  })
})

describe("receiveFromRepair", () => {
  it("closes the repair and records the cost as expense", async () => {
    tx.assetRepair.findUnique.mockResolvedValue({ id: "rep-1", assetId: "ast-1", returnedAt: null })
    tx.assetRepair.update.mockResolvedValue({ id: "rep-1" })

    await receiveFromRepair("rep-1", { cost: 4500, currency: "BDT", outcome: "Screen replaced", conditionAfter: "GOOD" }, hr)

    expect(tx.assetRepair.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rep-1" },
        data: expect.objectContaining({ outcome: "Screen replaced", conditionAfter: "GOOD" }),
      })
    )
  })

  it("409s on a repair that is already closed", async () => {
    tx.assetRepair.findUnique.mockResolvedValue({
      id: "rep-1",
      assetId: "ast-1",
      returnedAt: new Date("2026-08-01T00:00:00.000Z"),
    })

    await expect(receiveFromRepair("rep-1", {}, hr)).rejects.toMatchObject({ statusCode: 409 })
  })
})
