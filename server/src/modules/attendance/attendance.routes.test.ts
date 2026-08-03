import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("./attendance.service", () => ({
  getToday: vi.fn(),
  getMyAttendance: vi.fn(),
  getEmployeeAttendance: vi.fn(),
  listShifts: vi.fn(),
}))

import app from "../../app"
import { signAccessToken } from "../auth/auth.utils"
import * as service from "./attendance.service"

type TestRole = "EMPLOYEE" | "REPORTING_MANAGER" | "HR_ADMIN" | "SUPER_ADMIN" | "FINANCE_OFFICER"

function tokenFor(role: TestRole) {
  return signAccessToken({
    sub: "actor-1",
    role: role as never,
    email: "actor@demo.com",
    mustChangePassword: false,
  })
}

const auth = (role: TestRole) => `Bearer ${tokenFor(role)}`

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/attendance/today", () => {
  it("returns 401 with no Authorization header", async () => {
    expect((await request(app).get("/api/attendance/today")).status).toBe(401)
  })

  it.each<TestRole>(["HR_ADMIN", "SUPER_ADMIN", "FINANCE_OFFICER"])(
    "returns 403 for %s, which holds no attendance of its own",
    async (role) => {
      const res = await request(app).get("/api/attendance/today").set("Authorization", auth(role))
      expect(res.status).toBe(403)
    }
  )

  it.each<TestRole>(["EMPLOYEE", "REPORTING_MANAGER"])("returns 200 for %s", async (role) => {
    vi.mocked(service.getToday).mockResolvedValue({ serverTime: "x" } as never)
    const res = await request(app).get("/api/attendance/today").set("Authorization", auth(role))
    expect(res.status).toBe(200)
  })
})

describe("GET /api/attendance/me", () => {
  it("returns 401 with no Authorization header", async () => {
    expect((await request(app).get("/api/attendance/me")).status).toBe(401)
  })

  it("passes an explicit range through to the service", async () => {
    vi.mocked(service.getMyAttendance).mockResolvedValue([])
    const res = await request(app)
      .get("/api/attendance/me?from=2026-08-01&to=2026-08-15")
      .set("Authorization", auth("EMPLOYEE"))

    expect(res.status).toBe(200)
    expect(service.getMyAttendance).toHaveBeenCalledWith("actor-1", "2026-08-01", "2026-08-15")
  })

  it("leaves the range undefined so the service can default to this month", async () => {
    vi.mocked(service.getMyAttendance).mockResolvedValue([])
    await request(app).get("/api/attendance/me").set("Authorization", auth("EMPLOYEE"))
    expect(service.getMyAttendance).toHaveBeenCalledWith("actor-1", undefined, undefined)
  })

  it("returns 400 for a malformed date", async () => {
    const res = await request(app)
      .get("/api/attendance/me?from=01-08-2026")
      .set("Authorization", auth("EMPLOYEE"))
    expect(res.status).toBe(400)
  })
})

describe("GET /api/attendance/shifts", () => {
  it("returns 401 with no Authorization header", async () => {
    expect((await request(app).get("/api/attendance/shifts")).status).toBe(401)
  })

  it("returns 403 for an EMPLOYEE, who does not pick shifts for anyone", async () => {
    const res = await request(app).get("/api/attendance/shifts").set("Authorization", auth("EMPLOYEE"))
    expect(res.status).toBe(403)
  })

  it.each<TestRole>(["HR_ADMIN", "SUPER_ADMIN"])("returns 200 for %s", async (role) => {
    vi.mocked(service.listShifts).mockResolvedValue([])
    const res = await request(app).get("/api/attendance/shifts").set("Authorization", auth(role))
    expect(res.status).toBe(200)
  })
})

describe("GET /api/attendance/history/:employeeId", () => {
  it("returns 401 with no Authorization header", async () => {
    expect((await request(app).get("/api/attendance/history/emp-9")).status).toBe(401)
  })

  it("is open to every authenticated role at the route, and scoped in the service", async () => {
    // Visibility differs per role rather than per route, so the rule lives
    // in one place in the service instead of being spread across guards.
    vi.mocked(service.getEmployeeAttendance).mockResolvedValue([])
    const res = await request(app)
      .get("/api/attendance/history/emp-9")
      .set("Authorization", auth("FINANCE_OFFICER"))

    expect(res.status).toBe(200)
    expect(service.getEmployeeAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "actor-1", role: "FINANCE_OFFICER" }),
      "emp-9",
      undefined,
      undefined
    )
  })

  it("surfaces the service's 403 for an employee reading someone else", async () => {
    const { AppError } = await import("../../middleware/errorHandler")
    vi.mocked(service.getEmployeeAttendance).mockRejectedValue(
      new AppError(403, "You can only view your own attendance")
    )
    const res = await request(app)
      .get("/api/attendance/history/emp-9")
      .set("Authorization", auth("EMPLOYEE"))

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/your own attendance/i)
  })
})
