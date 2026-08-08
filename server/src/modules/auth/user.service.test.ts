import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    employee: { count: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { listUsers } from "./user.service"

beforeEach(() => {
  vi.clearAllMocks()
})

const row = {
  id: "u-1",
  email: "hr@demo.com",
  role: "HR_ADMIN",
  isActive: true,
  mustChangePassword: false,
  createdAt: new Date("2026-01-05T00:00:00.000Z"),
  employee: null,
}

describe("listUsers", () => {
  it("returns accounts newest first", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([row] as never)

    const result = await listUsers()

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.email).toBe("hr@demo.com")
  })

  it("never selects passwordHash", async () => {
    // The rule this protects: a response shape built by spreading the row
    // would ship the hash. It must be an explicit select.
    vi.mocked(prisma.user.findMany).mockResolvedValue([row] as never)

    await listUsers()

    const args = vi.mocked(prisma.user.findMany).mock.calls[0]![0] as {
      select: Record<string, unknown>
    }
    expect(args.select).toBeDefined()
    expect(args.select.passwordHash).toBeUndefined()
  })

  it("serialises createdAt to an ISO string and carries the employee link", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        ...row,
        employee: { id: "emp-1", employeeCode: "BS-EMP-00001", fullName: "Rita Sen" },
      },
    ] as never)

    const result = await listUsers()

    expect(result[0]!.createdAt).toBe("2026-01-05T00:00:00.000Z")
    expect(result[0]!.employee).toEqual({
      id: "emp-1",
      employeeCode: "BS-EMP-00001",
      fullName: "Rita Sen",
    })
  })
})
