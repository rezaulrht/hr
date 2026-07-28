import { describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("../../config/prisma", () => ({
  default: { department: { findMany: vi.fn() } },
}))

import app from "../../app"
import prisma from "../../config/prisma"
import { signAccessToken } from "../auth/auth.utils"

function tokenFor(role: "EMPLOYEE") {
  return signAccessToken({ sub: "actor-1", role: role as any, email: "actor@b.com", mustChangePassword: false })
}

describe("GET /api/departments", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).get("/api/departments")
    expect(res.status).toBe(401)
  })

  it("returns 200 with the department list for any authenticated role", async () => {
    vi.mocked(prisma.department.findMany).mockResolvedValue([
      { id: "d1", name: "Engineering" },
      { id: "d2", name: "Sales" },
    ] as any)
    const res = await request(app).get("/api/departments").set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { id: "d1", name: "Engineering" },
      { id: "d2", name: "Sales" },
    ])
    expect(prisma.department.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
  })
})
