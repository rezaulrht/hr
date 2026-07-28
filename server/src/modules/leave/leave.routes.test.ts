import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("./leave.service", () => ({
  listLeaveTypes: vi.fn(),
  getMyBalances: vi.fn(),
  listLeaveRequests: vi.fn(),
  getTeamStatus: vi.fn(),
  applyForLeave: vi.fn(),
  approveLeaveRequest: vi.fn(),
  rejectLeaveRequest: vi.fn(),
  cancelLeaveRequest: vi.fn(),
  revertLeaveRequest: vi.fn(),
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

describe("GET /api/leave/requests", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).get("/api/leave/requests")
    expect(res.status).toBe(401)
  })

  it("returns 200 for every authenticated role", async () => {
    vi.mocked(leaveService.listLeaveRequests).mockResolvedValue([])
    for (const role of [
      "EMPLOYEE",
      "REPORTING_MANAGER",
      "HR_ADMIN",
      "SUPER_ADMIN",
      "FINANCE_OFFICER",
    ] as const) {
      const res = await request(app)
        .get("/api/leave/requests")
        .set("Authorization", `Bearer ${tokenFor(role)}`)
      expect(res.status).toBe(200)
    }
  })
})

describe("GET /api/leave/team-status", () => {
  it("returns 403 for a non-manager", async () => {
    const res = await request(app)
      .get("/api/leave/team-status")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
    expect(res.status).toBe(403)
  })

  it("returns 200 for a reporting manager", async () => {
    vi.mocked(leaveService.getTeamStatus).mockResolvedValue([])
    const res = await request(app)
      .get("/api/leave/team-status")
      .set("Authorization", `Bearer ${tokenFor("REPORTING_MANAGER")}`)
    expect(res.status).toBe(200)
  })
})

describe("POST /api/leave/requests", () => {
  const body = { leaveTypeId: "lt-1", startDate: "2026-09-07", endDate: "2026-09-09" }

  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).post("/api/leave/requests").send(body)
    expect(res.status).toBe(401)
  })

  it("returns 403 for a reviewer role", async () => {
    const res = await request(app)
      .post("/api/leave/requests")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .send(body)
    expect(res.status).toBe(403)
  })

  it("returns 400 for a malformed body", async () => {
    const res = await request(app)
      .post("/api/leave/requests")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
      .send({ leaveTypeId: "lt-1", startDate: "07/09/2026", endDate: "2026-09-09" })
    expect(res.status).toBe(400)
  })

  it("returns 201 for a valid application", async () => {
    vi.mocked(leaveService.applyForLeave).mockResolvedValue({ id: "req-1" } as any)
    const res = await request(app)
      .post("/api/leave/requests")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
      .send(body)
    expect(res.status).toBe(201)
  })
})

describe("leave decision routes", () => {
  it("403s when an employee tries to approve", async () => {
    const res = await request(app)
      .patch("/api/leave/requests/req-1/approve")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
    expect(res.status).toBe(403)
  })

  it("403s when finance tries to approve — read-only per the matrix", async () => {
    const res = await request(app)
      .patch("/api/leave/requests/req-1/approve")
      .set("Authorization", `Bearer ${tokenFor("FINANCE_OFFICER")}`)
    expect(res.status).toBe(403)
  })

  it("403s when a reporting manager tries to approve", async () => {
    const res = await request(app)
      .patch("/api/leave/requests/req-1/approve")
      .set("Authorization", `Bearer ${tokenFor("REPORTING_MANAGER")}`)
    expect(res.status).toBe(403)
  })

  it("200s when HR approves", async () => {
    vi.mocked(leaveService.approveLeaveRequest).mockResolvedValue({ id: "req-1" } as any)
    const res = await request(app)
      .patch("/api/leave/requests/req-1/approve")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(200)
  })

  it("400s when rejecting without a note", async () => {
    const res = await request(app)
      .patch("/api/leave/requests/req-1/reject")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it("200s when rejecting with a note", async () => {
    vi.mocked(leaveService.rejectLeaveRequest).mockResolvedValue({ id: "req-1" } as any)
    const res = await request(app)
      .patch("/api/leave/requests/req-1/reject")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .send({ note: "Short-staffed" })
    expect(res.status).toBe(200)
  })

  it("403s when HR tries to cancel (cancel is the requester's action)", async () => {
    const res = await request(app)
      .patch("/api/leave/requests/req-1/cancel")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(403)
  })
})
