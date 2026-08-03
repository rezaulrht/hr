import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("./employee.service", () => ({
  createStaffAccount: vi.fn(),
  listEmployees: vi.fn(),
  setSalaryStructure: vi.fn(),
  getEmployee: vi.fn(),
  getMyProfile: vi.fn(),
  employeeIdForUser: vi.fn(),
}))

vi.mock("./employee.media", () => ({
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  getDocumentUrl: vi.fn(),
  deleteDocument: vi.fn(),
  uploadAvatar: vi.fn(),
  clearAvatar: vi.fn(),
}))

vi.mock("../../config/prisma", () => ({
  default: { employee: { findUnique: vi.fn() } },
}))

import app from "../../app"
import { signAccessToken } from "../auth/auth.utils"
import * as employeeService from "./employee.service"
import * as employeeMedia from "./employee.media"
import prismaForRoutes from "../../config/prisma"

function tokenFor(role: "HR_ADMIN" | "EMPLOYEE" | "FINANCE_OFFICER" | "SUPER_ADMIN", sub = "actor-1") {
  return signAccessToken({ sub, role: role as any, email: "actor@b.com", mustChangePassword: false })
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

describe("employee read routes", () => {
  it("returns 401 unauthenticated on GET /api/employees", async () => {
    const res = await request(app).get("/api/employees")
    expect(res.status).toBe(401)
  })

  it("no longer 403s an EMPLOYEE on GET /api/employees", async () => {
    // This is what fixes /finance/employees and enables the staff directory.
    vi.mocked(employeeService.listEmployees).mockResolvedValue([])
    const res = await request(app)
      .get("/api/employees")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE")}`)
    expect(res.status).toBe(200)
  })

  it("routes /me to the profile handler, not to :id", async () => {
    vi.mocked(employeeService.getMyProfile).mockResolvedValue({
      account: { email: "hr@demo.com", role: "HR_ADMIN", mustChangePassword: false },
      employee: null,
    })
    const res = await request(app)
      .get("/api/employees/me")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(200)
    expect(res.body.employee).toBeNull()
    expect(employeeService.getEmployee).not.toHaveBeenCalled()
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

describe("employee document routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 unauthenticated on document list", async () => {
    const res = await request(app).get("/api/employees/emp-1/documents")
    expect(res.status).toBe(401)
  })

  it("lets HR list documents", async () => {
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({
      userId: "u-other",
      reportingManagerId: null,
    } as any)
    vi.mocked(employeeMedia.listDocuments).mockResolvedValue([])
    const res = await request(app)
      .get("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(200)
  })

  it("lets an employee list their OWN documents", async () => {
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({ userId: "u-1" } as any)
    vi.mocked(employeeMedia.listDocuments).mockResolvedValue([])
    const res = await request(app)
      .get("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE", "u-1")}`)
    expect(res.status).toBe(200)
  })

  it("refuses an employee listing somebody else's documents", async () => {
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({ userId: "u-other" } as any)
    const res = await request(app)
      .get("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE", "u-1")}`)
    expect(res.status).toBe(403)
  })

  it("refuses Finance listing documents", async () => {
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({ userId: "u-other" } as any)
    const res = await request(app)
      .get("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("FINANCE_OFFICER")}`)
    expect(res.status).toBe(403)
  })

  it("lets HR upload a document as multipart", async () => {
    vi.mocked(employeeMedia.uploadDocument).mockResolvedValue({
      id: "doc-1",
      type: "CONTRACT",
      fileName: "c.pdf",
      bytes: 5,
      format: "pdf",
      uploadedAt: "2026-08-03T09:00:00.000Z",
    })
    const res = await request(app)
      .post("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .field("type", "CONTRACT")
      .attach("file", Buffer.from("hello"), "c.pdf")
    expect(res.status).toBe(201)
    expect(res.body.id).toBe("doc-1")
  })

  it("refuses an employee uploading a document", async () => {
    const res = await request(app)
      .post("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE", "u-1")}`)
      .field("type", "CERTIFICATE")
      .attach("file", Buffer.from("hello"), "c.pdf")
    expect(res.status).toBe(403)
  })

  it("returns 400 when no file is attached", async () => {
    const res = await request(app)
      .post("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .field("type", "CONTRACT")
    expect(res.status).toBe(400)
  })

  it("returns 400 for an unknown document type", async () => {
    const res = await request(app)
      .post("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .field("type", "PASSPORT")
      .attach("file", Buffer.from("hello"), "c.pdf")
    expect(res.status).toBe(400)
  })

  it("rejects a disallowed format before it reaches the service", async () => {
    const res = await request(app)
      .post("/api/employees/emp-1/documents")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
      .field("type", "OTHER")
      .attach("file", Buffer.from("MZ"), "virus.exe")
    expect(res.status).toBe(400)
    expect(employeeMedia.uploadDocument).not.toHaveBeenCalled()
  })

  it("returns a signed url with an expiry", async () => {
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({
      userId: "u-other",
      reportingManagerId: null,
    } as any)
    vi.mocked(employeeMedia.getDocumentUrl).mockResolvedValue({
      url: "https://dl/x",
      expiresAt: "2026-08-03T10:05:00.000Z",
    })
    const res = await request(app)
      .get("/api/employees/emp-1/documents/doc-1/url")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(200)
    expect(res.body.expiresAt).toBe("2026-08-03T10:05:00.000Z")
  })

  it("lets HR delete a document", async () => {
    vi.mocked(employeeMedia.deleteDocument).mockResolvedValue(undefined)
    const res = await request(app)
      .delete("/api/employees/emp-1/documents/doc-1")
      .set("Authorization", `Bearer ${tokenFor("HR_ADMIN")}`)
    expect(res.status).toBe(204)
  })
})

describe("avatar routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lets an employee upload their own avatar", async () => {
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({ userId: "u-1" } as any)
    vi.mocked(employeeMedia.uploadAvatar).mockResolvedValue({ avatarUrl: "https://res/a.jpg" })
    const res = await request(app)
      .patch("/api/employees/emp-1/avatar")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE", "u-1")}`)
      .attach("file", Buffer.from("img"), "me.jpg")
    expect(res.status).toBe(200)
    expect(res.body.avatarUrl).toBe("https://res/a.jpg")
  })

  it("refuses an employee setting somebody else's avatar", async () => {
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({ userId: "u-other" } as any)
    const res = await request(app)
      .patch("/api/employees/emp-1/avatar")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE", "u-1")}`)
      .attach("file", Buffer.from("img"), "me.jpg")
    expect(res.status).toBe(403)
  })

  it("rejects a pdf as an avatar", async () => {
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({ userId: "u-1" } as any)
    const res = await request(app)
      .patch("/api/employees/emp-1/avatar")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE", "u-1")}`)
      .attach("file", Buffer.from("%PDF"), "scan.pdf")
    expect(res.status).toBe(400)
  })

  it("clears the avatar via DELETE", async () => {
    // A separate verb because a multipart request with no file part is
    // indistinguishable from a malformed one.
    vi.mocked(prismaForRoutes.employee.findUnique).mockResolvedValue({ userId: "u-1" } as any)
    vi.mocked(employeeMedia.clearAvatar).mockResolvedValue({ avatarUrl: null })
    const res = await request(app)
      .delete("/api/employees/emp-1/avatar")
      .set("Authorization", `Bearer ${tokenFor("EMPLOYEE", "u-1")}`)
    expect(res.status).toBe(200)
    expect(res.body.avatarUrl).toBeNull()
  })
})
