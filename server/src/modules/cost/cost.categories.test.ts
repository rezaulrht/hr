import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    costCategory: { findUnique: vi.fn(), delete: vi.fn() },
    operatingCost: { count: vi.fn() },
    costCommitment: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { deleteCategory } from "./cost.service"

const ACTOR = {
  sub: "user-1",
  role: "FINANCE_OFFICER",
  email: "fin@demo.com",
  mustChangePassword: false,
} as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma))
  vi.mocked(prisma.operatingCost.count).mockResolvedValue(0)
  vi.mocked(prisma.costCommitment.count).mockResolvedValue(0)
  vi.mocked(prisma.costCategory.findUnique).mockResolvedValue({
    id: "c1",
    code: "RENT",
    name: "Office rent",
  } as any)
})

describe("deleteCategory (cost)", () => {
  it("deletes and audits when nothing references it", async () => {
    await deleteCategory("c1", ACTOR)

    expect(prisma.costCategory.delete).toHaveBeenCalledWith({ where: { id: "c1" } })
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "COST_CATEGORY", action: "DELETE" }),
      })
    )
  })

  it("refuses with a count when costs are booked to it", async () => {
    vi.mocked(prisma.operatingCost.count).mockResolvedValue(9)

    await expect(deleteCategory("c1", ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: "This category is still in use by 9 costs. Reassign them first.",
    })
    expect(prisma.costCategory.delete).not.toHaveBeenCalled()
  })

  it("counts commitments too, not just booked costs", async () => {
    vi.mocked(prisma.costCommitment.count).mockResolvedValue(2)

    await expect(deleteCategory("c1", ACTOR)).rejects.toMatchObject({
      message: expect.stringContaining("2 commitments"),
    })
  })

  it("404s an unknown id", async () => {
    vi.mocked(prisma.costCategory.findUnique).mockResolvedValue(null)

    await expect(deleteCategory("nope", ACTOR)).rejects.toMatchObject({ statusCode: 404 })
  })
})
