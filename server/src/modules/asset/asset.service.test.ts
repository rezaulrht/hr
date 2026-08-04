import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    asset: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    assetCategory: { findUnique: vi.fn(), update: vi.fn() },
    assetAssignment: { count: vi.fn() },
    idCounter: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    event: { create: vi.fn() },
    employee: { findUnique: vi.fn() },
  }
  return {
    default: {
      asset: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
      assetCategory: { findMany: vi.fn(), findUnique: vi.fn() },
      employee: { findUnique: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { createAsset, markAssetLost, nextAssetTag, retireAsset } from "./asset.service"

const tx = (prisma as unknown as { __tx: any }).__tx

const hr = { sub: "user-hr", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as never

const laptopCategory = {
  id: "cat-1",
  code: "LAPTOP",
  name: "Laptop",
  requiresSerial: true,
  isConsumable: false,
  usefulLifeMonths: 36,
}

const chairCategory = { ...laptopCategory, id: "cat-2", code: "FURNITURE", requiresSerial: false }

beforeEach(() => {
  vi.clearAllMocks()
  tx.idCounter.upsert.mockResolvedValue({ id: "AST", value: 42 })
  tx.auditLog.create.mockResolvedValue({})
  tx.event.create.mockResolvedValue({})
})

describe("nextAssetTag", () => {
  it("pads to five digits, matching every other code in the system", async () => {
    await expect(nextAssetTag(tx)).resolves.toBe("BS-AST-00042")
  })
})

describe("createAsset", () => {
  it("refuses a serial-less asset in a category that requires one", async () => {
    tx.assetCategory.findUnique.mockResolvedValue(laptopCategory)

    await expect(
      createAsset({ categoryId: "cat-1", name: "ThinkPad" }, hr)
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(tx.asset.create).not.toHaveBeenCalled()
  })

  it("allows a serial-less asset in a category that does not require one", async () => {
    tx.assetCategory.findUnique.mockResolvedValue(chairCategory)
    tx.asset.create.mockResolvedValue({ id: "ast-1", assetTag: "BS-AST-00042", name: "Desk" })

    await createAsset({ categoryId: "cat-2", name: "Desk" }, hr)

    expect(tx.asset.create).toHaveBeenCalledOnce()
  })

  it("writes an audit row in the same transaction", async () => {
    tx.assetCategory.findUnique.mockResolvedValue(chairCategory)
    tx.asset.create.mockResolvedValue({ id: "ast-1", assetTag: "BS-AST-00042", name: "Desk" })

    await createAsset({ categoryId: "cat-2", name: "Desk" }, hr)

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "ASSET", action: "CREATE", entityId: "ast-1" }),
      })
    )
  })
})

describe("retireAsset", () => {
  it("409s while somebody is still holding it", async () => {
    tx.asset.findUnique.mockResolvedValue({ id: "ast-1", lifecycle: "IN_SERVICE", assetTag: "BS-AST-00042", name: "ThinkPad" })
    tx.assetAssignment.count.mockResolvedValue(1)

    await expect(retireAsset("ast-1", { note: "End of life" }, hr)).rejects.toMatchObject({
      statusCode: 409,
    })

    expect(tx.asset.update).not.toHaveBeenCalled()
  })

  it("retires a free asset and stamps who and when", async () => {
    tx.asset.findUnique.mockResolvedValue({ id: "ast-1", lifecycle: "IN_SERVICE", assetTag: "BS-AST-00042", name: "ThinkPad" })
    tx.assetAssignment.count.mockResolvedValue(0)
    tx.asset.update.mockResolvedValue({ id: "ast-1", lifecycle: "RETIRED" })

    await retireAsset("ast-1", { note: "End of life" }, hr)

    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycle: "RETIRED",
          retiredBy: "user-hr",
          retirementNote: "End of life",
        }),
      })
    )
  })

  it("409s on an already retired asset", async () => {
    tx.asset.findUnique.mockResolvedValue({ id: "ast-1", lifecycle: "RETIRED", assetTag: "T", name: "N" })

    await expect(retireAsset("ast-1", { note: "again" }, hr)).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe("markAssetLost", () => {
  it("does NOT require the asset to be free — a lost laptop is lost from someone's desk", async () => {
    tx.asset.findUnique.mockResolvedValue({ id: "ast-1", lifecycle: "IN_SERVICE", assetTag: "T", name: "N" })
    tx.asset.update.mockResolvedValue({ id: "ast-1", lifecycle: "LOST" })

    await markAssetLost("ast-1", { note: "Not returned after exit" }, hr)

    expect(tx.asset.update).toHaveBeenCalledOnce()
    expect(tx.assetAssignment.count).not.toHaveBeenCalled()
  })
})
