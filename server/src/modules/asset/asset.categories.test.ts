import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    asset: { count: vi.fn() },
    assetCategory: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    assetRequest: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      asset: { count: vi.fn() },
      assetCategory: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
      assetRequest: { count: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { deleteCategory, updateCategory } from "./asset.service"

const tx = (prisma as unknown as { __tx: any }).__tx

const hr = { sub: "user-1", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx))
  tx.asset.count.mockResolvedValue(0)
  tx.assetRequest.count.mockResolvedValue(0)
  tx.assetCategory.findUnique.mockResolvedValue({
    id: "c1",
    code: "LAPTOP",
    name: "Laptop",
  } as any)
})

describe("deleteCategory (asset)", () => {
  it("deletes and audits when nothing references it", async () => {
    await deleteCategory("c1", hr)

    expect(tx.assetCategory.delete).toHaveBeenCalledWith({ where: { id: "c1" } })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "ASSET_CATEGORY", action: "DELETE" }),
      })
    )
  })

  it("refuses with a count when assets are in it", async () => {
    tx.asset.count.mockResolvedValue(12)

    await expect(deleteCategory("c1", hr)).rejects.toMatchObject({
      statusCode: 409,
      message: "This category is still in use by 12 assets. Reassign them first.",
    })
    expect(tx.assetCategory.delete).not.toHaveBeenCalled()
  })

  it("counts open requests too, not just assets", async () => {
    tx.assetRequest.count.mockResolvedValue(1)

    await expect(deleteCategory("c1", hr)).rejects.toMatchObject({
      message: expect.stringContaining("1 request"),
    })
  })

  it("404s an unknown id", async () => {
    tx.assetCategory.findUnique.mockResolvedValue(null)

    await expect(deleteCategory("nope", hr)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("updateCategory — tracksIndividually guard", () => {
  it("refuses to stop tracking a category that already has assets", async () => {
    // The same posture as the requiresSerial guard (V-7): the register must
    // not drift out of the rule it now claims to enforce. Existing rows
    // cannot be un-registered retroactively.
    tx.assetCategory.findUnique.mockResolvedValue({
      id: "cat-1", code: "MONITOR", name: "Monitor", tracksIndividually: true,
    })
    tx.asset.count.mockResolvedValue(4)

    await expect(
      updateCategory("cat-1", { tracksIndividually: false }, hr)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "4 asset(s) are already registered in this category, so it cannot become a supply.",
    })
  })

  it("allows the change when the category holds no assets", async () => {
    tx.assetCategory.findUnique.mockResolvedValue({
      id: "cat-1", code: "STATIONERY", name: "Stationery", tracksIndividually: true,
    })
    tx.asset.count.mockResolvedValue(0)
    tx.assetCategory.update.mockResolvedValue({ id: "cat-1", tracksIndividually: false })

    await expect(
      updateCategory("cat-1", { tracksIndividually: false }, hr)
    ).resolves.toMatchObject({ tracksIndividually: false })
  })
})