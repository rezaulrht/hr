import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    assetRequest: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    assetCategory: { findUnique: vi.fn() },
    assetAssignment: { findFirst: vi.fn() },
    assetRepair: { findFirst: vi.fn(), create: vi.fn() },
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
  submitRequest,
} from "./asset.requests"

const tx = (prisma as unknown as { __tx: any }).__tx

const hr = { sub: "user-hr", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as never
const mgr = { sub: "user-mgr", role: "REPORTING_MANAGER", email: "m@demo.com", mustChangePassword: false } as never
const emp = { sub: "user-emp", role: "EMPLOYEE", email: "e@demo.com", mustChangePassword: false } as never
const admin = { sub: "user-admin", role: "SUPER_ADMIN", email: "a@demo.com", mustChangePassword: false } as never
const finance = { sub: "user-fin", role: "FINANCE_OFFICER", email: "f@demo.com", mustChangePassword: false } as never

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.event.create.mockResolvedValue({})
})

describe("approveRequest — Super Admin alone", () => {
  beforeEach(() => {
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1", employeeId: "emp-1", kind: "NEW_ITEM", status: "PENDING",
      category: { name: "Monitor" }, asset: null,
    })
    tx.assetRequest.update.mockResolvedValue({ id: "req-1", status: "APPROVED" })
    prisma.employee.findUnique = vi.fn().mockResolvedValue({ id: "emp-9" })
  })

  it("lets a Super Admin approve", async () => {
    await expect(approveRequest("req-1", {}, admin)).resolves.toMatchObject({ status: "APPROVED" })
  })

  it("refuses an HR_ADMIN — approval commits money and sits with Super Admin (ADR-0002)", async () => {
    await expect(approveRequest("req-1", {}, hr)).rejects.toMatchObject({
      statusCode: 403,
      message: "Only a Super Admin can decide an asset request",
    })
  })

  it("refuses the requester's own manager", async () => {
    await expect(approveRequest("req-1", {}, mgr)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe("listRequests — visibility", () => {
  it("shows a Finance Officer every request", async () => {
    // Finance capitalises whatever gets bought, so a pending purchase is a
    // pending payable. Before this they fell into the employee branch, had no
    // Employee row, and received [].
    vi.mocked(prisma.assetRequest.findMany).mockResolvedValue([] as never)

    await listRequests(finance)

    expect(prisma.assetRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
  })

  it("still scopes a manager to themselves and their reports", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr" } as never)
    vi.mocked(prisma.assetRequest.findMany).mockResolvedValue([] as never)

    await listRequests(mgr)

    expect(prisma.assetRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ employeeId: "emp-mgr" }, { employee: { reportingManagerId: "emp-mgr" } }] },
      })
    )
  })
})

describe("approveRequest — status guard", () => {
  it("409s on a request that is not PENDING", async () => {
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1",
      employeeId: "emp-1",
      status: "REJECTED",
      category: { name: "Monitor" },
    })

    await expect(approveRequest("req-1", {}, admin)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("approveRequest — REPAIR", () => {
  it("creates the repair in the same transaction and links it", async () => {
    // Decision 5: approval means it has gone to the repairer. The alternative
    // leaves a request APPROVED while nothing was sent — exactly the blind
    // spot ORDERED exists to close.
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1", employeeId: "emp-1", kind: "REPAIR", status: "PENDING",
      assetId: "ast-1", reason: "Keyboard is dead",
      category: null, asset: { assetTag: "BS-AST-00012", name: "MacBook Pro 14" },
    })
    tx.assetRepair.findFirst.mockResolvedValue(null)
    tx.assetRepair.create.mockResolvedValue({ id: "rep-1" })
    tx.assetRequest.update.mockResolvedValue({ id: "req-1", status: "APPROVED", repairId: "rep-1" })

    await approveRequest("req-1", {}, admin)

    expect(tx.assetRepair.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assetId: "ast-1", fault: "Keyboard is dead" }),
      })
    )
    expect(tx.assetRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ repairId: "rep-1" }) })
    )
  })

  it("409s when the asset already has an open repair", async () => {
    tx.assetRequest.findUnique.mockResolvedValue({
      id: "req-1", employeeId: "emp-1", kind: "REPAIR", status: "PENDING",
      assetId: "ast-1", reason: "Screen flickers",
      category: null, asset: { assetTag: "BS-AST-00012", name: "MacBook Pro 14" },
    })
    tx.assetRepair.findFirst.mockResolvedValue({ id: "rep-existing" })

    await expect(approveRequest("req-1", {}, admin)).rejects.toMatchObject({
      statusCode: 409,
      message: "This asset already has an open repair",
    })
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
