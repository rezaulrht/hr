import { describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("../../config/prisma", () => ({
  default: { user: { update: vi.fn() } },
}))

import app from "../../app"
import { signAccessToken } from "./auth.utils"
import prisma from "../../config/prisma"

const mockedPrisma = prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }

function tokenFor(role: "SUPER_ADMIN" | "EMPLOYEE") {
  return signAccessToken({ sub: "actor-1", role: role as any, email: "actor@b.com", mustChangePassword: false })
}

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

  it("returns 200 and updates isActive for a Super Admin caller", async () => {
    mockedPrisma.user.update.mockResolvedValue({ id: "u2", email: "b@c.com", isActive: false })
    const res = await request(app)
      .patch("/api/users/u2/status")
      .set("Authorization", `Bearer ${tokenFor("SUPER_ADMIN")}`)
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: "u2", email: "b@c.com", isActive: false })
  })

  it("returns 400 for a malformed body", async () => {
    const res = await request(app)
      .patch("/api/users/u2/status")
      .set("Authorization", `Bearer ${tokenFor("SUPER_ADMIN")}`)
      .send({ isActive: "not-a-boolean" })
    expect(res.status).toBe(400)
  })
})
