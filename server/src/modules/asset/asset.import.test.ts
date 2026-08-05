import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    asset: { create: vi.fn(), findMany: vi.fn() },
    assetAssignment: { create: vi.fn() },
    assetCategory: { findMany: vi.fn() },
    department: { findMany: vi.fn(), create: vi.fn() },
    employee: { findMany: vi.fn() },
    idCounter: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    event: { create: vi.fn() },
  }
  return {
    default: {
      assetCategory: { findMany: vi.fn() },
      asset: { findMany: vi.fn() },
      employee: { findMany: vi.fn() },
      department: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { commitAssetImport, previewAssetImport } from "./asset.import"

const tx = (prisma as unknown as { __tx: any }).__tx
const hr = { sub: "user-hr", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as never

const csv = (body: string) => Buffer.from(body, "utf8")
const HEADER = "categorycode,name,serialnumber,assignedtoemployeecode,assignedat\n"

beforeEach(() => {
  vi.clearAllMocks()
  const categories = [
    { id: "cat-1", code: "LAPTOP", name: "Laptop", requiresSerial: true, isConsumable: false },
    { id: "cat-2", code: "FURNITURE", name: "Furniture", requiresSerial: false, isConsumable: false },
  ]
  vi.mocked(prisma.assetCategory.findMany).mockResolvedValue(categories as never)
  tx.assetCategory.findMany.mockResolvedValue(categories)
  vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never)
  tx.asset.findMany.mockResolvedValue([])
  const employees = [{ id: "emp-1", employeeCode: "BS-EMP-00001", employmentStatus: "ACTIVE" }]
  vi.mocked(prisma.employee.findMany).mockResolvedValue(employees as never)
  tx.employee.findMany.mockResolvedValue(employees)
  vi.mocked(prisma.department.findMany).mockResolvedValue([] as never)
  tx.department.findMany.mockResolvedValue([])
  tx.idCounter.upsert.mockResolvedValue({ id: "AST", value: 1 })
  tx.idCounter.findUnique.mockResolvedValue({ id: "AST", value: 1 })
  tx.auditLog.create.mockResolvedValue({})
  tx.event.create.mockResolvedValue({})
})

describe("previewAssetImport", () => {
  it("flags an unknown category code", async () => {
    const result = await previewAssetImport(csv(`${HEADER}NOPE,Thing,,,\n`), "r.csv")

    expect(result.issues).toContainEqual(
      expect.objectContaining({ rowNumber: 2, column: "categoryCode" })
    )
  })

  it("flags a missing serial for a requiresSerial category", async () => {
    const result = await previewAssetImport(csv(`${HEADER}LAPTOP,ThinkPad,,,\n`), "r.csv")

    expect(result.issues).toContainEqual(
      expect.objectContaining({ rowNumber: 2, column: "serialNumber" })
    )
  })

  it("accepts a missing serial for a category that does not require one", async () => {
    const result = await previewAssetImport(csv(`${HEADER}FURNITURE,Desk,,,\n`), "r.csv")

    expect(result.issues).toEqual([])
  })

  it("flags an unresolvable employee code", async () => {
    const result = await previewAssetImport(
      csv(`${HEADER}FURNITURE,Desk,,BS-EMP-99999,2026-07-01\n`),
      "r.csv"
    )

    expect(result.issues).toContainEqual(
      expect.objectContaining({ column: "assignedToEmployeeCode" })
    )
  })

  it("flags an assignedAt in the future", async () => {
    const result = await previewAssetImport(
      csv(`${HEADER}FURNITURE,Desk,,BS-EMP-00001,2099-01-01\n`),
      "r.csv"
    )

    expect(result.issues).toContainEqual(expect.objectContaining({ column: "assignedAt" }))
  })

  it("names BOTH rows when two share a serial", async () => {
    const result = await previewAssetImport(
      csv(`${HEADER}LAPTOP,A,SN-1,,\nLAPTOP,B,SN-1,,\n`),
      "r.csv"
    )

    // The self-contradiction case that database-only validation misses.
    expect(result.issues.filter((i) => i.column === "serialNumber")).toHaveLength(2)
  })

  it("counts the assignments it is about to create", async () => {
    const result = await previewAssetImport(
      csv(`${HEADER}FURNITURE,Desk,,BS-EMP-00001,2026-07-01\nFURNITURE,Chair,,,\n`),
      "r.csv"
    )

    expect(result.summary).toMatchObject({ assets: 2, assignments: 1 })
  })

  it("writes nothing", async () => {
    await previewAssetImport(csv(`${HEADER}FURNITURE,Desk,,,\n`), "r.csv")

    expect(tx.asset.create).not.toHaveBeenCalled()
  })
})

describe("commitAssetImport", () => {
  it("writes nothing at all when one row is bad", async () => {
    await expect(
      commitAssetImport(csv(`${HEADER}FURNITURE,Desk,,,\nLAPTOP,ThinkPad,,,\n`), "r.csv", hr)
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(tx.asset.create).not.toHaveBeenCalled()
    expect(tx.assetAssignment.create).not.toHaveBeenCalled()
  })

  it("creates an open assignment with acknowledgedAt null and an IMPORT audit row", async () => {
    tx.asset.create.mockResolvedValue({ id: "ast-1", assetTag: "BS-AST-00001" })
    tx.assetAssignment.create.mockResolvedValue({ id: "asg-1" })

    await commitAssetImport(
      csv(`${HEADER}FURNITURE,Desk,,BS-EMP-00001,2026-07-01\n`),
      "r.csv",
      hr
    )

    expect(tx.assetAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: "emp-1",
          assignedBy: "user-hr",
          // A migrated custody record is visibly migrated rather than
          // passing as a witnessed handover.
          acknowledgedAt: null,
        }),
      })
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "IMPORT" }) })
    )
  })

  it("emits exactly ONE event for the whole file", async () => {
    tx.asset.create.mockResolvedValue({ id: "ast-1", assetTag: "BS-AST-00001" })

    await commitAssetImport(csv(`${HEADER}FURNITURE,A,,,\nFURNITURE,B,,,\nFURNITURE,C,,,\n`), "r.csv", hr)

    expect(tx.event.create).toHaveBeenCalledTimes(1)
  })

  it("bumps IdCounter past the highest imported tag", async () => {
    tx.asset.create.mockResolvedValue({ id: "ast-1", assetTag: "BS-AST-00500" })
    const withTag = "assettag,categorycode,name\nBS-AST-00500,FURNITURE,Desk\n"

    await commitAssetImport(csv(withTag), "r.csv", hr)

    // Without this, the next asset created collides with an imported row.
    expect(tx.idCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "AST" },
        update: expect.objectContaining({ value: 500 }),
      })
    )
  })
})
