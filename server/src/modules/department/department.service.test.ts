import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    department: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    employee: { count: vi.fn() },
    announcement: { count: vi.fn() },
    asset: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { createDepartment, deleteDepartment, updateDepartment } from "./department.service"

const ACTOR = { sub: "user-1", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as any

// The service runs its work inside $transaction; the mock hands the callback
// the same prisma double so counts and writes are assertable.
function runTransaction() {
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma))
}

beforeEach(() => {
  vi.clearAllMocks()
  runTransaction()
  vi.mocked(prisma.employee.count).mockResolvedValue(0)
  vi.mocked(prisma.announcement.count).mockResolvedValue(0)
  vi.mocked(prisma.asset.count).mockResolvedValue(0)
})

describe("createDepartment", () => {
  it("creates the row and writes an audit entry", async () => {
    vi.mocked(prisma.department.create).mockResolvedValue({ id: "d1", name: "Design" } as any)

    const result = await createDepartment({ name: "Design" }, ACTOR)

    expect(result).toEqual({ id: "d1", name: "Design" })
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "DEPARTMENT", entityId: "d1", action: "CREATE" }),
      })
    )
  })

  it("turns a duplicate name into a 409", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue({ code: "P2002" })

    await expect(createDepartment({ name: "Engineering" }, ACTOR)).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe("updateDepartment", () => {
  it("renames and audits the before and after", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ id: "d1", name: "Design" } as any)
    vi.mocked(prisma.department.update).mockResolvedValue({ id: "d1", name: "Product Design" } as any)

    await updateDepartment("d1", { name: "Product Design" }, ACTOR)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "DEPARTMENT",
          action: "UPDATE",
          before: { name: "Design" },
          after: { name: "Product Design" },
        }),
      })
    )
  })

  it("404s an unknown id", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(null)

    await expect(updateDepartment("nope", { name: "X" }, ACTOR)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe("deleteDepartment", () => {
  it("deletes when nothing references it", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ id: "d1", name: "Design" } as any)

    await deleteDepartment("d1", ACTOR)

    expect(prisma.department.delete).toHaveBeenCalledWith({ where: { id: "d1" } })
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DELETE" }) })
    )
  })

  it("refuses with a count when employees are in it", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ id: "d1", name: "Design" } as any)
    vi.mocked(prisma.employee.count).mockResolvedValue(4)

    await expect(deleteDepartment("d1", ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("4 employees"),
    })
    expect(prisma.department.delete).not.toHaveBeenCalled()
  })

  // Announcement.departmentId is nullable, so Prisma's default is SetNull:
  // without this guard the delete SUCCEEDS and silently turns a
  // department-scoped announcement into a company-wide one. No error, no
  // trace. This is the single most important test in the task.
  it("refuses when only department-scoped announcements reference it", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ id: "d1", name: "Design" } as any)
    vi.mocked(prisma.announcement.count).mockResolvedValue(2)

    await expect(deleteDepartment("d1", ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("2 announcements"),
    })
    expect(prisma.department.delete).not.toHaveBeenCalled()
  })

  // Asset.departmentId is nullable too — same silent SetNull.
  it("refuses when only assets reference it", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ id: "d1", name: "Design" } as any)
    vi.mocked(prisma.asset.count).mockResolvedValue(1)

    await expect(deleteDepartment("d1", ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("1 asset"),
    })
  })

  it("names every relation at once", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ id: "d1", name: "Design" } as any)
    vi.mocked(prisma.employee.count).mockResolvedValue(4)
    vi.mocked(prisma.announcement.count).mockResolvedValue(2)
    vi.mocked(prisma.asset.count).mockResolvedValue(1)

    await expect(deleteDepartment("d1", ACTOR)).rejects.toMatchObject({
      message:
        "This department is still in use by 4 employees, 2 announcements and 1 asset. Reassign them first.",
    })
  })

  it("404s an unknown id", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(null)

    await expect(deleteDepartment("nope", ACTOR)).rejects.toBeInstanceOf(AppError)
  })
})
