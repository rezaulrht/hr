import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
    employee: { findUnique: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { hashPassword } from "./auth.utils"
import { loginAdmin, loginStaff, logout, refresh } from "./auth.service"

const mockedPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  employee: { findUnique: ReturnType<typeof vi.fn> }
  refreshToken: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("loginAdmin", () => {
  it("returns tokens and a public user for a correct SUPER_ADMIN login", async () => {
    const passwordHash = await hashPassword("correct-password")
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "admin@demo.com",
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
      mustChangePassword: false,
    })
    mockedPrisma.refreshToken.create.mockResolvedValue({})

    const result = await loginAdmin("admin@demo.com", "correct-password")

    expect(result.accessToken).toBeTruthy()
    expect(result.user.role).toBe("SUPER_ADMIN")
    expect(mockedPrisma.refreshToken.create).toHaveBeenCalledOnce()
  })

  it("throws AppError 401 for a nonexistent email", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null)
    await expect(loginAdmin("nobody@b.com", "whatever")).rejects.toMatchObject({ statusCode: 401 })
  })

  it("throws AppError 401 when the account is an EMPLOYEE (wrong login mode)", async () => {
    const passwordHash = await hashPassword("correct-password")
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "staff@b.com",
      passwordHash,
      role: "EMPLOYEE",
      isActive: true,
      mustChangePassword: true,
    })
    await expect(loginAdmin("staff@b.com", "correct-password")).rejects.toMatchObject({ statusCode: 401 })
  })

  it("throws AppError 401 for a wrong password", async () => {
    const passwordHash = await hashPassword("correct-password")
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "admin@demo.com",
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
      mustChangePassword: false,
    })
    await expect(loginAdmin("admin@demo.com", "wrong-password")).rejects.toMatchObject({ statusCode: 401 })
  })

  it("throws AppError 403 for a deactivated user", async () => {
    const passwordHash = await hashPassword("correct-password")
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "admin@demo.com",
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: false,
      mustChangePassword: false,
    })
    await expect(loginAdmin("admin@demo.com", "correct-password")).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe("loginStaff", () => {
  it("returns tokens, a public user, and employeeCode for a correct EMPLOYEE login", async () => {
    const passwordHash = await hashPassword("temp-password")
    mockedPrisma.employee.findUnique.mockResolvedValue({
      employeeCode: "BS-EMP-00001",
      user: {
        id: "u2",
        email: "aisha@b.com",
        passwordHash,
        role: "EMPLOYEE",
        isActive: true,
        mustChangePassword: true,
      },
    })
    mockedPrisma.refreshToken.create.mockResolvedValue({})

    const result = await loginStaff("BS-EMP-00001", "temp-password")

    expect(result.accessToken).toBeTruthy()
    expect(result.user.employeeCode).toBe("BS-EMP-00001")
    expect(result.user.mustChangePassword).toBe(true)
  })

  it("throws AppError 401 for an unknown employeeId", async () => {
    mockedPrisma.employee.findUnique.mockResolvedValue(null)
    await expect(loginStaff("BS-EMP-99999", "whatever")).rejects.toMatchObject({ statusCode: 401 })
  })

  it("throws AppError 401 when the linked user is not EMPLOYEE/REPORTING_MANAGER", async () => {
    mockedPrisma.employee.findUnique.mockResolvedValue({
      employeeCode: "BS-EMP-00001",
      user: {
        id: "u2",
        email: "weird@b.com",
        passwordHash: "irrelevant",
        role: "SUPER_ADMIN",
        isActive: true,
        mustChangePassword: false,
      },
    })
    await expect(loginStaff("BS-EMP-00001", "whatever")).rejects.toMatchObject({ statusCode: 401 })
  })

  it("throws AppError 401 for a wrong password", async () => {
    const passwordHash = await hashPassword("temp-password")
    mockedPrisma.employee.findUnique.mockResolvedValue({
      employeeCode: "BS-EMP-00001",
      user: {
        id: "u2",
        email: "aisha@b.com",
        passwordHash,
        role: "EMPLOYEE",
        isActive: true,
        mustChangePassword: true,
      },
    })
    await expect(loginStaff("BS-EMP-00001", "wrong")).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe("refresh", () => {
  it("rotates a valid, unrevoked, unexpired refresh token for an admin user", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      user: { id: "u1", email: "admin@demo.com", role: "SUPER_ADMIN", isActive: true, mustChangePassword: false },
    })
    mockedPrisma.employee.findUnique.mockResolvedValue(null)
    mockedPrisma.refreshToken.update.mockResolvedValue({})
    mockedPrisma.refreshToken.create.mockResolvedValue({})

    const result = await refresh("some-raw-token")

    expect(result.accessToken).toBeTruthy()
    expect(result.user.employeeCode).toBeUndefined()
    expect(mockedPrisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rt1" } })
    )
  })

  it("re-attaches employeeCode for a staff user on refresh", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt2",
      userId: "u2",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      user: { id: "u2", email: "aisha@b.com", role: "EMPLOYEE", isActive: true, mustChangePassword: false },
    })
    mockedPrisma.employee.findUnique.mockResolvedValue({ employeeCode: "BS-EMP-00001" })
    mockedPrisma.refreshToken.update.mockResolvedValue({})
    mockedPrisma.refreshToken.create.mockResolvedValue({})

    const result = await refresh("some-raw-token")

    expect(result.user.employeeCode).toBe("BS-EMP-00001")
  })

  it("throws AppError 401 for an unknown token", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue(null)
    await expect(refresh("unknown-token")).rejects.toMatchObject({ statusCode: 401 })
  })

  it("throws AppError 401 for a revoked token", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt1",
      userId: "u1",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: new Date(),
      user: { id: "u1", email: "admin@demo.com", role: "SUPER_ADMIN", isActive: true, mustChangePassword: false },
    })
    await expect(refresh("revoked-token")).rejects.toMatchObject({ statusCode: 401 })
  })

  it("throws AppError 401 for an expired token", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt1",
      userId: "u1",
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      user: { id: "u1", email: "admin@demo.com", role: "SUPER_ADMIN", isActive: true, mustChangePassword: false },
    })
    await expect(refresh("expired-token")).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe("logout", () => {
  it("revokes the matching refresh token", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({ id: "rt1", revokedAt: null })
    mockedPrisma.refreshToken.update.mockResolvedValue({})
    await logout("some-raw-token")
    expect(mockedPrisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "rt1" },
      data: { revokedAt: expect.any(Date) },
    })
  })

  it("does nothing (no throw) if the token doesn't exist", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue(null)
    await expect(logout("unknown-token")).resolves.toBeUndefined()
  })
})
