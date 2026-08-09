import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    assetCategory: { findUnique: vi.fn(), delete: vi.fn() },
    asset: { count: vi.fn() },
    assetRequest: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { deleteCategory } from "./asset.service"

const ACTOR = { sub: "user-1", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma))
  vi.mocked(prisma.asset.count).mockResolvedValue(0)
  vi.mocked(prisma.assetRequest.count).mockResolvedValue(0)
  vi.mocked(prisma.assetCategory.findUnique).mockResolvedValue({
    id: "c1",
    code: "LAPTOP",
    name: "Laptop",
  } as any)
})

describe("deleteCategory (asset)", () => {
  it("deletes and audits when nothing references it", async () => {
    await deleteCategory("c1", ACTOR)

    expect(prisma.assetCategory.delete).toHaveBeenCalledWith({ where: { id: "c1" } })
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "ASSET_CATEGORY", action: "DELETE" }),
      })
    )
  })

  it("refuses with a count when assets are in it", async () => {
    vi.mocked(prisma.asset.count).mockResolvedValue(12)

    await expect(deleteCategory("c1", ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: "This category is still in use by 12 assets. Reassign them first.",
    })
    expect(prisma.assetCategory.delete).not.toHaveBeenCalled()
  })

  it("counts open requests too, not just assets", async () => {
    vi.mocked(prisma.assetRequest.count).mockResolvedValue(1)

    await expect(deleteCategory("c1", ACTOR)).rejects.toMatchObject({
      message: expect.stringContaining("1 request"),
    })
  })

  it("404s an unknown id", async () => {
    vi.mocked(prisma.assetCategory.findUnique).mockResolvedValue(null)

    await expect(deleteCategory("nope", ACTOR)).rejects.toMatchObject({ statusCode: 404 })
  })
})
