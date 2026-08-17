import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    assetRequest: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    assetCategory: { findUnique: vi.fn() },
    assetAssignment: { findFirst: vi.fn() },
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
import {
  approveRequest,
  cancelRequest,
  fulfilRequest,
  listRequests,
  rejectRequest,
  resolveApprover,
  submitRequest,
} from "./asset.requests"

const tx = (prisma as unknown as { __tx: any }).__tx

const hr = { sub: "user-hr", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as never
const mgr = { sub: "user-mgr", role: "REPORTING_MANAGER", email: "m@demo.com", mustChangePassword: false } as never
const emp = { sub: "user-emp", role: "EMPLOYEE", email: "e@demo.com", mustChangePassword: false } as never

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

describe("rejectRequest", () => {
  it("400s an empty note — a rejection nobody explained is one the requester cannot act on", async () => {
    await expect(rejectRequest("req-1", { note: "" }, hr)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(tx.assetRequest.update).not.toHaveBeenCalled()
  })

  it("400s a whitespace-only note", async () => {
    await expect(rejectRequest("req-1", { note: "   " }, hr)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(tx.assetRequest.update).not.toHaveBeenCalled()
  })
})

describe("cancelRequest", () => {
  it("403s someone who is not the requester", async () => {
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1",
      employeeId: "emp-1",
      status: "PENDING",
    })
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-other" } as never)

    await expect(cancelRequest("req-1", mgr)).rejects.toMatchObject({ statusCode: 403 })
    expect(tx.assetRequest.update).not.toHaveBeenCalled()
  })

  it("409s when the request is not PENDING", async () => {
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1",
      employeeId: "emp-1",
      status: "APPROVED",
    })
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)

    await expect(cancelRequest("req-1", hr)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.assetRequest.update).not.toHaveBeenCalled()
  })
})

describe("listRequests scoping", () => {
  it("an EMPLOYEE sees only their own", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)
    vi.mocked(prisma.assetRequest.findMany).mockResolvedValue([] as never)

    await listRequests(emp)

    expect(prisma.assetRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: "emp-1" } })
    )
  })

  it("a REPORTING_MANAGER sees their own plus their direct reports'", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr" } as never)
    vi.mocked(prisma.assetRequest.findMany).mockResolvedValue([] as never)

    await listRequests(mgr)

    expect(prisma.assetRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ employeeId: "emp-mgr" }, { employee: { reportingManagerId: "emp-mgr" } }],
        },
      })
    )
  })

  it("HR / SUPER_ADMIN see all — no scoping filter and no employee lookup", async () => {
    vi.mocked(prisma.assetRequest.findMany).mockResolvedValue([] as never)

    await listRequests(hr)

    expect(prisma.employee.findUnique).not.toHaveBeenCalled()
    expect(prisma.assetRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
  })
})

describe("submitRequest — REPAIR and RETURN", () => {
  beforeEach(() => {
    tx.employee.findUnique.mockResolvedValue({ id: "emp-1" })
  })

  it("accepts a REPAIR for an asset the requester is holding", async () => {
    tx.assetAssignment.findFirst.mockResolvedValue({
      id: "asg-1",
      assetId: "ast-1",
      employeeId: "emp-1",
      asset: { assetTag: "BS-AST-00012", name: "MacBook Pro 14" },
    })
    tx.assetRequest.create.mockResolvedValue({ id: "req-1", kind: "REPAIR", assetId: "ast-1" })

    await expect(
      submitRequest({ kind: "REPAIR", assetId: "ast-1", reason: "Keyboard is dead" }, emp)
    ).resolves.toMatchObject({ id: "req-1" })

    expect(tx.assetRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "REPAIR", assetId: "ast-1", categoryId: null }),
      })
    )
  })

  it("404s when the requester does not hold the asset", async () => {
    // 404 not 403 (V-35): probing ids must teach nothing about what exists.
    tx.assetAssignment.findFirst.mockResolvedValue(null)

    await expect(
      submitRequest({ kind: "RETURN", assetId: "someone-elses", reason: "Done with it" }, emp)
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("submitRequest — supplies and quantity", () => {
  beforeEach(() => {
    tx.employee.findUnique.mockResolvedValue({ id: "emp-1" })
  })

  it("requires a quantity for a supply category", async () => {
    tx.assetCategory.findUnique.mockResolvedValue({ id: "cat-s", name: "Stationery", tracksIndividually: false })

    await expect(
      submitRequest({ kind: "NEW_ITEM", categoryId: "cat-s", reason: "Out of pens" }, emp)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Stationery is issued by quantity, so a quantity is required.",
    })
  })

  it("rejects a quantity on a tracked category", async () => {
    // Two monitors is two requests: fulfilment writes one fulfilledAssetId
    // and an assignment is one asset to one person.
    tx.assetCategory.findUnique.mockResolvedValue({ id: "cat-m", name: "Monitor", tracksIndividually: true })

    await expect(
      submitRequest({ kind: "NEW_ITEM", categoryId: "cat-m", quantity: 2, reason: "Dual screen" }, emp)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Monitor is issued one at a time — submit one request per item.",
    })
  })
})
