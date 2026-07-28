import { describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("./employee.service", () => ({
  createStaffAccount: vi.fn(),
}))

import app from "../../app"
import { signAccessToken } from "../auth/auth.utils"
import * as employeeService from "./employee.service"

function tokenFor(role: "HR_ADMIN" | "EMPLOYEE") {
  return signAccessToken({ sub: "actor-1", role: role as any, email: "actor@b.com", mustChangePassword: false })
}

const validBody = {
  fullName: "New Hire",
  email: "new@b.com",
  role: "EMPLOYEE",
  designation: "Analyst",
  departmentId: "dept-1",
  employmentType: "FULL_TIME",
  joiningDate: "2026-07-27",
}

describe("POST /api/employees/staff", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).post("/api/employees/staff").send(validBody)
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-HR/Admin caller", async () => {
    const res = await request(app)
      .post("/api/employees/staff")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
      .send(validBody)
    expect(res.status).toBe(403)
  })

  it("returns 201 with the generated code and temporary password for an HR Admin caller", async () => {
    vi.mocked(employeeService.createStaffAccount).mockResolvedValue({
      employeeCode: "BS-EMP-00001",
      temporaryPassword: "Ab3dEf7gHk",
      fullName: "New Hire",
      email: "new@b.com",
    })
    const res = await request(app)
      .post("/api/employees/staff")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .send(validBody)
    expect(res.status).toBe(201)
    expect(res.body.employeeCode).toBe("BS-EMP-00001")
    expect(res.body.temporaryPassword).toBe("Ab3dEf7gHk")
  })

  it("returns 400 for a malformed body", async () => {
    const res = await request(app)
      .post("/api/employees/staff")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .send({ fullName: "No other fields" })
    expect(res.status).toBe(400)
  })
})
