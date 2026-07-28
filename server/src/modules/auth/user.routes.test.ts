import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("../../config/prisma", () => ({
  default: { user: { update: vi.fn() }, refreshToken: { updateMany: vi.fn() } },
}))

import app from "../../app"
import { signAccessToken } from "./auth.utils"
import prisma from "../../config/prisma"
import { Prisma } from "../../generated/prisma"

const mockedPrisma = prisma as unknown as {
  user: { update: ReturnType<typeof vi.fn> }
  refreshToken: { updateMany: ReturnType<typeof vi.fn> }
}

function tokenFor(role: "SUPER_ADMIN" | "EMPLOYEE") {
  return signAccessToken({ sub: "actor-1", role: role as any, email: "actor@b.com", mustChangePassword: false })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PATCH /api/users/:id/status", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).patch("/api/users/u2/status").send({ isActive: false })
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-Super-Admin caller", async () => {
    const res = await request(app)
      .patch("/api/users/u2/status")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
      .send({ isActive: false })
    expect(res.status).toBe(403)
  })

  it("returns 200, updates isActive, and revokes refresh tokens when deactivating", async () => {
    mockedPrisma.user.update.mockResolvedValue({ id: "u2", email: "b@c.com", isActive: false })
    mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 })
    const res = await request(app)
      .patch("/api/users/u2/status")
      .set("Authorization", `Bearer ${tokenFor("SUPER_ADMIN")}`)
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: "u2", email: "b@c.com", isActive: false })
    expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u2", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
  })

  it("returns 200 and does not revoke tokens when reactivating", async () => {
    mockedPrisma.user.update.mockResolvedValue({ id: "u2", email: "b@c.com", isActive: true })
    const res = await request(app)
      .patch("/api/users/u2/status")
      .set("Authorization", `Bearer ${tokenFor("SUPER_ADMIN")}`)
      .send({ isActive: true })
    expect(res.status).toBe(200)
    expect(mockedPrisma.refreshToken.updateMany).not.toHaveBeenCalled()
  })

  it("returns 400 for a malformed body", async () => {
    const res = await request(app)
      .patch("/api/users/u2/status")
      .set("Authorization", `Bearer ${tokenFor("SUPER_ADMIN")}`)
      .send({ isActive: "not-a-boolean" })
    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown user id", async () => {
    mockedPrisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: "7.9.0" })
    )
    const res = await request(app)
      .patch("/api/users/unknown-id/status")
      .set("Authorization", `Bearer ${tokenFor("SUPER_ADMIN")}`)
      .send({ isActive: false })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: "User not found" })
  })
})
