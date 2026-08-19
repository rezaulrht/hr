import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    asset: { findUnique: vi.fn() },
    assetAssignment: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    assetRequest: { findMany: vi.fn(), updateMany: vi.fn() },
    assetRecovery: { create: vi.fn() },
    assetRepair: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    event: { create: vi.fn() },
    employee: { findUnique: vi.fn() },
  }
  return {
    default: {
      assetAssignment: { findMany: vi.fn(), findUnique: vi.fn() },
      employee: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { acknowledgeAssignment, assignAsset, openAssignmentsFor, returnAsset } from "./asset.assignments"

const tx = (prisma as unknown as { __tx: any }).__tx

const hr = { sub: "user-hr", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as never
const staff = { sub: "user-1", role: "EMPLOYEE", email: "e@demo.com", mustChangePassword: false } as never

const inService = { id: "ast-1", assetTag: "BS-AST-00042", name: "ThinkPad", lifecycle: "IN_SERVICE" }

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.event.create.mockResolvedValue({})
  tx.assetRecovery.create.mockResolvedValue({ id: "rec-1" })
  tx.employee.findUnique.mockResolvedValue({ id: "emp-1", reportingManagerId: "emp-mgr" })
  tx.assetRequest.findMany.mockResolvedValue([])
})

describe("assignAsset", () => {
  it("409s when the asset already has an open assignment", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue({
      id: "asg-1",
      employee: { fullName: "Ayesha Rahman" },
    })

    await expect(
      assignAsset("ast-1", { employeeId: "emp-2", conditionOut: "GOOD" }, hr)
    ).rejects.toMatchObject({ statusCode: 409 })

    // A clean 409 naming the holder beats a raw constraint violation from the
    // partial unique index, which is the real backstop.
    expect(tx.assetAssignment.create).not.toHaveBeenCalled()
  })

  it("409s on a RETIRED asset", async () => {
    tx.asset.findUnique.mockResolvedValue({ ...inService, lifecycle: "RETIRED" })

    await expect(
      assignAsset("ast-1", { employeeId: "emp-1", conditionOut: "GOOD" }, hr)
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("409s on a LOST asset", async () => {
    tx.asset.findUnique.mockResolvedValue({ ...inService, lifecycle: "LOST" })

    await expect(
      assignAsset("ast-1", { employeeId: "emp-1", conditionOut: "GOOD" }, hr)
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("opens a row with acknowledgedAt null and no return fields", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue(null)
    tx.assetAssignment.create.mockResolvedValue({ id: "asg-1", employeeId: "emp-1" })

    await assignAsset("ast-1", { employeeId: "emp-1", conditionOut: "NEW" }, hr)

    expect(tx.assetAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetId: "ast-1",
          employeeId: "emp-1",
          assignedBy: "user-hr",
          conditionOut: "NEW",
          acknowledgedAt: null,
        }),
      })
    )
  })
})

describe("returnAsset", () => {
  it("409s when nobody is holding it", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue(null)

    await expect(
      returnAsset("ast-1", { conditionIn: "GOOD" }, hr)
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("closes the SAME row rather than creating a new one", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue({ id: "asg-1", employeeId: "emp-1" })
    tx.assetAssignment.update.mockResolvedValue({ id: "asg-1" })

    await returnAsset("ast-1", { conditionIn: "FAIR", returnNote: "scuffed lid" }, hr)

    expect(tx.assetAssignment.create).not.toHaveBeenCalled()
    expect(tx.assetAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asg-1" },
        data: expect.objectContaining({
          returnedTo: "user-hr",
          conditionIn: "FAIR",
          returnNote: "scuffed lid",
        }),
      })
    )
  })

  it("does not touch assignedAt or conditionOut when closing", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue({ id: "asg-1", employeeId: "emp-1" })
    tx.assetAssignment.update.mockResolvedValue({ id: "asg-1" })

    await returnAsset("ast-1", { conditionIn: "GOOD" }, hr)

    const data = tx.assetAssignment.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty("assignedAt")
    expect(data).not.toHaveProperty("conditionOut")
  })

  it("does NOT create anything when the item comes back damaged with no recovery offered", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue({ id: "asg-1", employeeId: "emp-1" })
    tx.assetAssignment.update.mockResolvedValue({ id: "asg-1" })

    await returnAsset("ast-1", { conditionIn: "DAMAGED" }, hr)

    // Pricing damage is a judgement a person makes. Without a recovery block
    // the return closes silently — the offer is optional (Decision 4).
    expect(tx.asset.findUnique).toHaveBeenCalled()
    expect(tx.assetAssignment.update).toHaveBeenCalledOnce()
    expect(tx.assetRecovery.create).not.toHaveBeenCalled()
  })

  it("creates a recovery on a damaged return when one is offered", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue({ id: "asg-1", employeeId: "emp-1" })
    tx.assetAssignment.update.mockResolvedValue({ id: "asg-1" })

    await returnAsset(
      "ast-1",
      { conditionIn: "DAMAGED", recovery: { amount: "15000", reason: "Cracked screen" } },
      hr
    )

    expect(tx.assetRecovery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetId: "ast-1",
          employeeId: "emp-1",
          assignmentId: "asg-1",
          kind: "DAMAGED",
          status: "PENDING",
        }),
      })
    )
  })

  it("defaults the kind to DAMAGED on a damaged return", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue({ id: "asg-1", employeeId: "emp-1" })
    tx.assetAssignment.update.mockResolvedValue({ id: "asg-1" })

    await returnAsset(
      "ast-1",
      { conditionIn: "DAMAGED", recovery: { amount: "15000", reason: "Cracked screen" } },
      hr
    )

    const data = (tx.assetRecovery.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data
    expect(data.kind).toBe("DAMAGED")
  })

  it("ignores a recovery block on a non-damaged return", async () => {
    tx.asset.findUnique.mockResolvedValue(inService)
    tx.assetAssignment.findFirst.mockResolvedValue({ id: "asg-1", employeeId: "emp-1" })
    tx.assetAssignment.update.mockResolvedValue({ id: "asg-1" })

    await returnAsset(
      "ast-1",
      { conditionIn: "GOOD", recovery: { amount: "15000", reason: "Should not happen" } },
      hr
    )

    expect(tx.assetRecovery.create).not.toHaveBeenCalled()
  })

  it("closes an approved RETURN request for the same asset", async () => {
    // Decision 6: conditionIn is mandatory and only HR can judge it, so a
    // RETURN request cannot auto-complete on approval — it completes when
    // somebody actually catches the thing.
    tx.asset.findUnique.mockResolvedValue({ id: "ast-1", assetTag: "BS-AST-00012", name: "MacBook Pro 14" })
    tx.assetAssignment.findFirst.mockResolvedValue({ id: "asg-1", assetId: "ast-1", employeeId: "emp-1" })
    tx.assetAssignment.update.mockResolvedValue({ id: "asg-1", returnedAt: new Date() })
    tx.assetRequest.findMany.mockResolvedValue([{ id: "req-1" }])
    tx.assetRequest.updateMany.mockResolvedValue({ count: 1 })

    await returnAsset("ast-1", { conditionIn: "GOOD" }, hr)

    // The request is fulfilled by the act of receiving, not by approving it.
    // updateMany because most returns have no request behind them — HR takes
    // things back directly all the time.
    expect(tx.assetRequest.updateMany).toHaveBeenCalledWith({
      where: { assetId: "ast-1", kind: "RETURN", status: "APPROVED" },
      data: expect.objectContaining({ status: "FULFILLED" }),
    })
    // Global Constraint: the mutation writes its ASSET_REQUEST audit row inside
    // the same transaction, mirroring receiveFromRepair's FULFIL rows.
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "ASSET_REQUEST",
          entityId: "req-1",
          action: "FULFIL",
          changedBy: "user-hr",
          after: { status: "FULFILLED" },
        }),
      })
    )
  })
})

describe("acknowledgeAssignment", () => {
  it("403s on somebody else's assignment", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)
    tx.assetAssignment.findUnique.mockResolvedValue({
      id: "asg-9",
      employeeId: "emp-OTHER",
      acknowledgedAt: null,
      asset: { id: "ast-1", assetTag: "T" },
    })

    await expect(acknowledgeAssignment("asg-9", staff)).rejects.toMatchObject({ statusCode: 403 })
    expect(tx.assetAssignment.update).not.toHaveBeenCalled()
  })

  it("is idempotent — a second press is not an error", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)
    const already = new Date("2026-08-01T00:00:00.000Z")
    tx.assetAssignment.findUnique.mockResolvedValue({
      id: "asg-1",
      employeeId: "emp-1",
      acknowledgedAt: already,
      asset: { id: "ast-1", assetTag: "T" },
    })

    const result = await acknowledgeAssignment("asg-1", staff)

    expect(result.acknowledgedAt).toEqual(already)
    expect(tx.assetAssignment.update).not.toHaveBeenCalled()
  })

  it("stamps acknowledgedAt on the first press", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)
    tx.assetAssignment.findUnique.mockResolvedValue({
      id: "asg-1",
      employeeId: "emp-1",
      acknowledgedAt: null,
      asset: { id: "ast-1", assetTag: "T" },
    })
    tx.assetAssignment.update.mockResolvedValue({ id: "asg-1", acknowledgedAt: new Date() })

    await acknowledgeAssignment("asg-1", staff)

    expect(tx.assetAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asg-1" },
        data: expect.objectContaining({ acknowledgedAt: expect.any(Date) }),
      })
    )
  })
})

describe("openAssignmentsFor", () => {
  it("excludes consumable categories from the exit checklist", async () => {
    vi.mocked(prisma.assetAssignment.findMany).mockResolvedValue([] as never)

    await openAssignmentsFor("emp-1")

    expect(prisma.assetAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          asset: { category: { isConsumable: false } },
        }),
      })
    )
  })
})
