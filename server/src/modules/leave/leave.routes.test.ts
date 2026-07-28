import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("./leave.service", () => ({
  listLeaveTypes: vi.fn(),
  getMyBalances: vi.fn(),
}))

import app from "../../app"
import { signAccessToken } from "../auth/auth.utils"
import * as leaveService from "./leave.service"

type TestRole = "EMPLOYEE" | "REPORTING_MANAGER" | "HR_ADMIN" | "SUPER_ADMIN" | "FINANCE_OFFICER"

function tokenFor(role: TestRole) {
  return signAccessToken({
    sub: "actor-1",
    role: role as any,
    email: "actor@b.com",
    mustChangePassword: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/leave/types", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).get("/api/leave/types")
    expect(res.status).toBe(401)
  })

  it("returns 200 for any authenticated role", async () => {
    vi.mocked(leaveService.listLeaveTypes).mockResolvedValue([
      {
        id: "lt-1",
        name: "Annual",
        isPaid: true,
        annualQuota: 18,
        carryForwardPct: 50,
        maxConsecutive: null,
        allowsBackdating: false,
        eligibleFor: ["FULL_TIME"],
      },
    ] as any)
    const res = await request(app)
      .get("/api/leave/types")
      .set("Authorization", `Bearer ${tokenFor("FINANCE_OFFICER")}`)
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe("Annual")
  })
})

describe("GET /api/leave/balances/me", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).get("/api/leave/balances/me")
    expect(res.status).toBe(401)
  })

  it("returns 403 for a reviewer role that has no employee profile", async () => {
    const res = await request(app)
      .get("/api/leave/balances/me")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(403)
  })

  it("returns 200 with balances for an employee", async () => {
    vi.mocked(leaveService.getMyBalances).mockResolvedValue([
      {
        leaveTypeId: "lt-1",
        name: "Annual",
        isPaid: true,
        annualQuota: 18,
        entitlement: 18,
        used: 3,
        pending: 2,
        balance: 13,
      },
    ])
    const res = await request(app)
      .get("/api/leave/balances/me")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
    expect(res.status).toBe(200)
    expect(res.body[0].balance).toBe(13)
  })
})
