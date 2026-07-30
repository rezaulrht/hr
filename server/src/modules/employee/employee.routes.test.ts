import { describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("./employee.service", () => ({
  createStaffAccount: vi.fn(),
  listEmployees: vi.fn(),
  setSalaryStructure: vi.fn(),
}))

import app from "../../app"
import { signAccessToken } from "../auth/auth.utils"
import * as employeeService from "./employee.service"

function tokenFor(role: "HR_ADMIN" | "EMPLOYEE" | "FINANCE_OFFICER" | "SUPER_ADMIN") {
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

describe("GET /api/employees", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).get("/api/employees")
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-HR/Admin caller", async () => {
    const res = await request(app).get("/api/employees").set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
    expect(res.status).toBe(403)
  })

  it("returns 200 with the employee list for an HR Admin caller", async () => {
    vi.mocked(employeeService.listEmployees).mockResolvedValue([
      {
        id: "e1",
        employeeCode: "BS-EMP-00001",
        fullName: "New Hire",
        email: "new@b.com",
        designation: "Analyst",
        department: { id: "dept-1", name: "Engineering" },
        employmentType: "FULL_TIME",
        employmentStatus: "ACTIVE",
        joiningDate: "2026-07-27T00:00:00.000Z",
        salaryStructure: null,
      },
    ])
    const res = await request(app).get("/api/employees").set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].employeeCode).toBe("BS-EMP-00001")
  })
})

describe("PATCH /api/employees/:id/salary-structure", () => {
  const url = "/api/employees/e1/salary-structure"

  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).patch(url).send({ salaryStructureId: "s1" })
    expect(res.status).toBe(401)
  })

  it("returns 403 for an employee", async () => {
    const res = await request(app)
      .patch(url)
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
      .send({ salaryStructureId: "s1" })
    expect(res.status).toBe(403)
  })

  // Finance authors the structures but does not choose who is on them —
  // the half of the separation that is easy to lose in a later refactor.
  it("returns 403 for Finance", async () => {
    const res = await request(app)
      .patch(url)
      .set("Authorization", `Bearer ${tokenFor("FINANCE_OFFICER")}`)
      .send({ salaryStructureId: "s1" })
    expect(res.status).toBe(403)
  })

  it("returns 200 for an HR Admin", async () => {
    vi.mocked(employeeService.setSalaryStructure).mockResolvedValue({ id: "e1" } as never)
    const res = await request(app)
      .patch(url)
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .send({ salaryStructureId: "s1" })
    expect(res.status).toBe(200)
    expect(employeeService.setSalaryStructure).toHaveBeenCalledWith("e1", "actor-1", {
      salaryStructureId: "s1",
    })
  })

  it("accepts an explicit null to un-assign", async () => {
    vi.mocked(employeeService.setSalaryStructure).mockResolvedValue({ id: "e1" } as never)
    const res = await request(app)
      .patch(url)
      .set("Authorization", `Bearer ${tokenFor("SUPER_ADMIN")}`)
      .send({ salaryStructureId: null })
    expect(res.status).toBe(200)
    expect(employeeService.setSalaryStructure).toHaveBeenCalledWith("e1", "actor-1", {
      salaryStructureId: null,
    })
  })

  // An omitted key is not the same as an explicit null, and silently
  // treating it as one would un-assign a salary by accident.
  it("returns 400 when salaryStructureId is missing entirely", async () => {
    const res = await request(app)
      .patch(url)
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .send({})
    expect(res.status).toBe(400)
  })
})
