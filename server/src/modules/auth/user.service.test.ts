import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    employee: { count: vi.fn() },
  },
}))

vi.mock("./auth.utils", () => ({
  generateTemporaryPassword: vi.fn(() => "TempPass123"),
  hashPassword: vi.fn(async () => "hashed"),
}))

vi.mock("./auth.service", () => ({
  revokeAllUserTokens: vi.fn(async () => undefined),
}))

import prisma from "../../config/prisma"
import { createUser, listUsers, setUserStatus } from "./user.service"

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

describe("createUser", () => {
  it("creates the account with a hashed temporary password and returns it once", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "u-9",
      email: "new@demo.com",
      role: "HR_ADMIN",
    } as never)

    const result = await createUser({ email: "new@demo.com", role: "HR_ADMIN" })

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@demo.com",
          role: "HR_ADMIN",
          passwordHash: "hashed",
          // The account is unusable until they set their own password.
          mustChangePassword: true,
        }),
      })
    )
    expect(result.temporaryPassword).toBe("TempPass123")
  })

  it("lowercases and trims the email before the uniqueness check", async () => {
    // Otherwise Bob@x.com and bob@x.com become two accounts, the exact
    // problem createStaffAccount normalises against.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "u-9",
      email: "bob@x.com",
      role: "HR_ADMIN",
    } as never)

    await createUser({ email: "  Bob@X.com  ", role: "HR_ADMIN" })

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "bob@x.com" },
      select: { id: true },
    })
  })

  it("409s on a duplicate email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u-1" } as never)

    await expect(createUser({ email: "hr@demo.com", role: "HR_ADMIN" })).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it("never returns passwordHash", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "u-9",
      email: "new@demo.com",
      role: "HR_ADMIN",
    } as never)

    const result = await createUser({ email: "new@demo.com", role: "HR_ADMIN" })

    expect(result).not.toHaveProperty("passwordHash")
  })
})

describe("setUserStatus", () => {
  const target = {
    id: "u-2",
    email: "hr@demo.com",
    role: "HR_ADMIN",
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date("2026-01-05T00:00:00.000Z"),
    employee: null,
  }

  it("deactivates another user and returns the updated account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(target as never)
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...target,
      isActive: false,
    } as never)

    const result = await setUserStatus("u-1", "u-2", false)

    expect(result.isActive).toBe(false)
  })

  it("refuses self-deactivation — it revokes the caller's own session", async () => {
    // updateUserStatusHandler calls revokeAllUserTokens on the target. Doing
    // that to yourself logs you out mid-request, and every route here is
    // SUPER_ADMIN-gated, so there is no way back in.
    await expect(setUserStatus("u-1", "u-1", false)).rejects.toMatchObject({ statusCode: 409 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it("refuses deactivating the last ACTIVE super admin", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...target,
      id: "u-3",
      role: "SUPER_ADMIN",
    } as never)
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never)

    await expect(setUserStatus("u-1", "u-3", false)).rejects.toMatchObject({ statusCode: 409 })

    // Counts ACTIVE super admins, not all of them — three super admins where
    // two are already deactivated is still one away from lockout.
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: "SUPER_ADMIN", isActive: true },
    })
  })

  it("allows deactivating a super admin when another active one remains", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...target,
      id: "u-3",
      role: "SUPER_ADMIN",
    } as never)
    vi.mocked(prisma.user.count).mockResolvedValue(2 as never)
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...target,
      id: "u-3",
      role: "SUPER_ADMIN",
      isActive: false,
    } as never)

    await expect(setUserStatus("u-1", "u-3", false)).resolves.toBeDefined()
  })

  it("does not run the last-admin check when REACTIVATING", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...target,
      id: "u-3",
      role: "SUPER_ADMIN",
      isActive: false,
    } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...target,
      id: "u-3",
      role: "SUPER_ADMIN",
    } as never)

    await setUserStatus("u-1", "u-3", true)

    expect(prisma.user.count).not.toHaveBeenCalled()
  })

  it("404s for an unknown user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)

    await expect(setUserStatus("u-1", "nope", false)).rejects.toMatchObject({ statusCode: 404 })
  })
})
