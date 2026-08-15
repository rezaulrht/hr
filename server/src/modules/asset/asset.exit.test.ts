import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    assetAssignment: { findMany: vi.fn() },
    assetRecovery: { findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { exitChecklistFor } from "./asset.exit"

const p = prisma as unknown as {
  assetAssignment: { findMany: ReturnType<typeof vi.fn> }
  assetRecovery: { findMany: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.assetAssignment.findMany.mockResolvedValue([])
  p.assetRecovery.findMany.mockResolvedValue([])
})

describe("exitChecklistFor", () => {
  it("lists open assignments and pending recoveries together", async () => {
    p.assetAssignment.findMany.mockResolvedValue([
      {
        id: "asg-1", assetId: "a-1", assignedAt: new Date("2026-01-05T00:00:00.000Z"),
        conditionOut: "GOOD", acknowledgedAt: null,
        asset: { assetTag: "BS-AST-00001", name: "ThinkPad T14", category: { name: "Laptop" } },
      },
    ])
    p.assetRecovery.findMany.mockResolvedValue([
      {
        id: "rec-1", assetId: "a-2", kind: "NOT_RETURNED", amount: "45000.00",
        currency: "BDT", reason: "Not returned", status: "PENDING",
        asset: { assetTag: "BS-AST-00002", name: "MacBook", category: { name: "Laptop" } },
      },
    ])

    const checklist = await exitChecklistFor("emp-1")

    expect(checklist.openAssignments).toHaveLength(1)
    expect(checklist.pendingRecoveries).toHaveLength(1)
    expect(checklist.hasOutstanding).toBe(true)
  })

  it("excludes consumables — a mouse is issued and never expected back", async () => {
    // The filter lives in the query: `openAssignmentsFor` excludes
    // isConsumable categories, and the mock returns nothing to map.
    p.assetAssignment.findMany.mockResolvedValue([])

    const checklist = await exitChecklistFor("emp-1")

    expect(checklist.openAssignments).toHaveLength(0)
    expect(p.assetAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ asset: { category: { isConsumable: false } } }),
      })
    )
  })

  it("excludes waived and already-recovered recoveries", async () => {
    p.assetRecovery.findMany.mockResolvedValue([])

    const checklist = await exitChecklistFor("emp-1")

    expect(p.assetRecovery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ employeeId: "emp-1", status: "PENDING" }) })
    )
    expect(checklist.pendingRecoveries).toEqual([])
  })
})
