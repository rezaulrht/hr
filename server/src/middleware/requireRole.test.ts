import { describe, expect, it, vi } from "vitest"
import { requireRole } from "./requireRole"

function mockReqRes(role?: string) {
  const req: any = { user: role ? { sub: "u1", role, email: "a@b.com", mustChangePassword: false } : undefined }
  const res: any = {}
  const next = vi.fn()
  return { req, res, next }
}

describe("requireRole", () => {
  it("calls next() when req.user.role is in the allowed list", () => {
    const { req, res, next } = mockReqRes("SUPER_ADMIN")
    requireRole("SUPER_ADMIN" as any)(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it("calls next(AppError 403) when req.user.role is not allowed", () => {
    const { req, res, next } = mockReqRes("EMPLOYEE")
    requireRole("SUPER_ADMIN" as any)(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }))
  })

  it("calls next(AppError 401) when there is no req.user at all", () => {
    const { req, res, next } = mockReqRes()
    requireRole("SUPER_ADMIN" as any)(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }))
  })
})
