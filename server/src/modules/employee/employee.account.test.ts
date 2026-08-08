import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    employee: { findUnique: vi.fn() },
    user: { update: vi.fn() },
  },
}))

vi.mock("../auth/auth.service", () => ({
  revokeAllUserTokens: vi.fn(async () => undefined),
}))

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { revokeAllUserTokens } from "../auth/auth.service"
import { setAccountActive } from "./employee.account"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("setAccountActive", () => {
  it("resolves the user id from the employee id and disables the login", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: "emp-1",
      userId: "u-1",
    } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "u-1", isActive: false } as never)

    const result = await setAccountActive("emp-1", false)

    // The caller only ever holds an employee id — userId is deliberately not
    // projected onto EmployeeView.
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { isActive: false },
      select: { id: true, isActive: true },
    })
    expect(result).toEqual({ id: "emp-1", accountActive: false })
  })

  it("revokes every refresh token when disabling, or the session outlives the lockout", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: "emp-1",
      userId: "u-1",
    } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "u-1", isActive: false } as never)

    await setAccountActive("emp-1", false)

    expect(revokeAllUserTokens).toHaveBeenCalledWith("u-1")
  })

  it("does NOT revoke tokens when re-enabling", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: "emp-1",
      userId: "u-1",
    } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "u-1", isActive: true } as never)

    await setAccountActive("emp-1", true)

    expect(revokeAllUserTokens).not.toHaveBeenCalled()
  })

  it("404s for an unknown employee", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null as never)

    await expect(setAccountActive("nope", false)).rejects.toThrow(AppError)
    await expect(setAccountActive("nope", false)).rejects.toMatchObject({ statusCode: 404 })
  })
})
