import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    assetRequest: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    assetCategory: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    event: { create: vi.fn() },
    employee: { findUnique: vi.fn() },
  }
  return {
    default: {
      assetRequest: { findMany: vi.fn(), findUnique: vi.fn() },
      employee: { findUnique: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

vi.mock("./asset.assignments", () => ({ assignAsset: vi.fn() }))

import prisma from "../../config/prisma"
import { assignAsset } from "./asset.assignments"
import { approveRequest, fulfilRequest, resolveApprover } from "./asset.requests"

const tx = (prisma as unknown as { __tx: any }).__tx

const hr = { sub: "user-hr", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as never
const mgr = { sub: "user-mgr", role: "REPORTING_MANAGER", email: "m@demo.com", mustChangePassword: false } as never

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.event.create.mockResolvedValue({})
})

describe("resolveApprover", () => {
  it("returns the employee's reporting manager", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1", reportingManagerId: "emp-mgr" } as never)

    await expect(resolveApprover("emp-1")).resolves.toBe("emp-mgr")
  })

  it("returns null when there is no manager, so the request falls to HR", async () => {
    // A Reporting Manager is an Employee like any other, so a manager's own
    // request goes to whoever is above them — and to HR when nobody is. No
    // role check; it falls out of the org chart.
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr", reportingManagerId: null } as never)

    await expect(resolveApprover("emp-mgr")).resolves.toBeNull()
  })

  it("returns the manager's own manager for a manager's request", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr", reportingManagerId: "emp-head" } as never)

    await expect(resolveApprover("emp-mgr")).resolves.toBe("emp-head")
  })
})

describe("approveRequest", () => {
  it("403s when the approver is the requester", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr", reportingManagerId: null } as never)
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1",
      employeeId: "emp-mgr",
      status: "PENDING",
      category: { name: "Monitor" },
    })

    await expect(approveRequest("req-1", {}, mgr)).rejects.toMatchObject({ statusCode: 403 })
    expect(tx.assetRequest.update).not.toHaveBeenCalled()
  })

  it("lets HR override a manager's queue so a request cannot be parked forever", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null as never)
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1",
      employeeId: "emp-1",
      status: "PENDING",
      category: { name: "Monitor" },
    })
    tx.assetRequest.update.mockResolvedValue({ id: "req-1", status: "APPROVED" })

    await approveRequest("req-1", {}, hr)

    expect(tx.assetRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", decidedBy: "user-hr" }) })
    )
  })

  it("409s on a request that is not PENDING", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null as never)
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1",
      employeeId: "emp-1",
      status: "REJECTED",
      category: { name: "Monitor" },
    })

    await expect(approveRequest("req-1", {}, hr)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("fulfilRequest", () => {
  it("creates exactly one assignment and moves the request to FULFILLED", async () => {
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1",
      employeeId: "emp-1",
      status: "APPROVED",
      category: { name: "Monitor" },
    })
    tx.assetRequest.update.mockResolvedValue({ id: "req-1", status: "FULFILLED" })

    await fulfilRequest("req-1", { assetId: "ast-1" }, hr)

    expect(assignAsset).toHaveBeenCalledOnce()
    expect(assignAsset).toHaveBeenCalledWith(
      "ast-1",
      expect.objectContaining({ employeeId: "emp-1", requestId: "req-1" }),
      hr,
      expect.anything()
    )
    expect(tx.assetRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FULFILLED", fulfilledAssetId: "ast-1" }),
      })
    )
  })

  it("409s on a request that was never approved", async () => {
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1",
      employeeId: "emp-1",
      status: "PENDING",
      category: { name: "Monitor" },
    })

    await expect(fulfilRequest("req-1", { assetId: "ast-1" }, hr)).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(assignAsset).not.toHaveBeenCalled()
  })
})
