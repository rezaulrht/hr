import { beforeEach, describe, expect, it, vi } from "vitest"

const txMock = {
  idCounter: { upsert: vi.fn() },
  user: { create: vi.fn() },
  employee: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  payrollAudit: { create: vi.fn() },
  // The event log, written in the same transaction. Distinct from
  // payrollAudit: one row per user action rather than per record.
  event: { create: vi.fn() },
}

vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn((fn: any) => fn(txMock)),
    employee: { findMany: vi.fn(), findUnique: vi.fn() },
    salaryStructure: { findUnique: vi.fn() },
  },
}))

vi.mock("../auth/mailer", () => ({
  sendStaffCredentialsEmail: vi.fn(() => Promise.resolve()),
}))

import prisma from "../../config/prisma"
import { createStaffAccount, listEmployees, setSalaryStructure } from "./employee.service"
import { sendStaffCredentialsEmail } from "../auth/mailer"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createStaffAccount", () => {
  it("generates a BS-EMP-00001 code for the first EMPLOYEE created", async () => {
    txMock.idCounter.upsert.mockResolvedValue({ id: "EMP", value: 1 })
    txMock.user.create.mockResolvedValue({ id: "u1", email: "new@b.com", role: "EMPLOYEE", isActive: true, mustChangePassword: true })
    txMock.employee.create.mockResolvedValue({})

    const result = await createStaffAccount({
      fullName: "New Hire",
      email: "new@b.com",
      role: "EMPLOYEE",
      designation: "Analyst",
      departmentId: "dept-1",
      employmentType: "FULL_TIME",
      joiningDate: "2026-07-27",
    })

    expect(result.employeeCode).toBe("BS-EMP-00001")
    expect(result.temporaryPassword).toHaveLength(10)
    expect(sendStaffCredentialsEmail).toHaveBeenCalledWith("new@b.com", "BS-EMP-00001", result.temporaryPassword)
  })

  it("generates a BS-MNG-00001 code for a REPORTING_MANAGER, independent of the EMP counter", async () => {
    txMock.idCounter.upsert.mockResolvedValue({ id: "MNG", value: 1 })
    txMock.user.create.mockResolvedValue({ id: "u2", email: "mgr@b.com", role: "REPORTING_MANAGER", isActive: true, mustChangePassword: true })
    txMock.employee.create.mockResolvedValue({})

    const result = await createStaffAccount({
      fullName: "New Manager",
      email: "mgr@b.com",
      role: "REPORTING_MANAGER",
      designation: "Team Lead",
      departmentId: "dept-1",
      employmentType: "FULL_TIME",
      joiningDate: "2026-07-27",
    })

    expect(result.employeeCode).toBe("BS-MNG-00001")
    expect(txMock.idCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "MNG" } })
    )
  })

  it("zero-pads the sequence to 5 digits", async () => {
    txMock.idCounter.upsert.mockResolvedValue({ id: "EMP", value: 42 })
    txMock.user.create.mockResolvedValue({ id: "u3", email: "x@b.com", role: "EMPLOYEE", isActive: true, mustChangePassword: true })
    txMock.employee.create.mockResolvedValue({})

    const result = await createStaffAccount({
      fullName: "X",
      email: "x@b.com",
      role: "EMPLOYEE",
      designation: "Analyst",
      departmentId: "dept-1",
      employmentType: "FULL_TIME",
      joiningDate: "2026-07-27",
    })

    expect(result.employeeCode).toBe("BS-EMP-00042")
  })
})

describe("listEmployees", () => {
  it("returns employees mapped to the list shape, ordered by fullName", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      {
        id: "e1",
        employeeCode: "BS-EMP-00002",
        fullName: "Bea Smith",
        designation: "Analyst",
        employmentType: "FULL_TIME",
        employmentStatus: "ACTIVE",
        joiningDate: new Date("2026-01-15T00:00:00.000Z"),
        department: { id: "d1", name: "Engineering" },
        user: { email: "bea@b.com" },
        salaryStructure: { id: "s1", name: "Standard (BDT)", currency: "BDT" },
      },
      {
        id: "e2",
        employeeCode: "BS-EMP-00001",
        fullName: "Alice Doe",
        designation: "Lead",
        employmentType: "CONTRACT",
        employmentStatus: "ON_LEAVE",
        joiningDate: new Date("2025-11-01T00:00:00.000Z"),
        department: { id: "d2", name: "Sales" },
        user: { email: "alice@b.com" },
        salaryStructure: null,
      },
    ] as any)

    const result = await listEmployees()

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      include: { department: true, user: true, salaryStructure: true },
      orderBy: { fullName: "asc" },
    })
    expect(result).toEqual([
      {
        id: "e1",
        employeeCode: "BS-EMP-00002",
        fullName: "Bea Smith",
        email: "bea@b.com",
        designation: "Analyst",
        department: { id: "d1", name: "Engineering" },
        employmentType: "FULL_TIME",
        employmentStatus: "ACTIVE",
        joiningDate: "2026-01-15T00:00:00.000Z",
        salaryStructure: { id: "s1", name: "Standard (BDT)", currency: "BDT" },
      },
      {
        id: "e2",
        employeeCode: "BS-EMP-00001",
        fullName: "Alice Doe",
        email: "alice@b.com",
        designation: "Lead",
        department: { id: "d2", name: "Sales" },
        employmentType: "CONTRACT",
        employmentStatus: "ON_LEAVE",
        joiningDate: "2025-11-01T00:00:00.000Z",
        salaryStructure: null,
      },
    ])
  })

  it("returns an empty array when there are no employees", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([])
    const result = await listEmployees()
    expect(result).toEqual([])
  })
})

describe("setSalaryStructure", () => {
  const employee = {
    id: "e1",
    fullName: "Bea Smith",
    salaryStructure: { id: "s-old", name: "Standard (USD)" },
  }
  const structure = { id: "s1", name: "Standard (BDT)", isActive: true }

  it("assigns the structure and audits the change by name", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(employee as any)
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(structure as any)
    txMock.employee.update.mockResolvedValue({ id: "e1", salaryStructureId: "s1" })

    await setSalaryStructure("e1", "hr-user", { salaryStructureId: "s1" })

    expect(txMock.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { salaryStructureId: "s1" } })
    )
    // Names, not uuids — an audit row a human can read without a join.
    expect(txMock.payrollAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "EMPLOYEE_SALARY_STRUCTURE",
          action: "UPDATE",
          changedBy: "hr-user",
          before: { salaryStructure: "Standard (USD)" },
          after: { salaryStructure: "Standard (BDT)" },
        }),
      })
    )
  })

  it("un-assigns on an explicit null without looking up a structure", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(employee as any)
    txMock.employee.update.mockResolvedValue({ id: "e1", salaryStructureId: null })

    await setSalaryStructure("e1", "hr-user", { salaryStructureId: null })

    expect(prisma.salaryStructure.findUnique).not.toHaveBeenCalled()
    expect(txMock.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { salaryStructureId: null } })
    )
    expect(txMock.payrollAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ after: { salaryStructure: null } }),
      })
    )
  })

  it("404s for an unknown employee", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null)
    await expect(
      setSalaryStructure("nope", "hr-user", { salaryStructureId: "s1" })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(txMock.employee.update).not.toHaveBeenCalled()
  })

  it("404s for an unknown structure", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(employee as any)
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(null)
    await expect(
      setSalaryStructure("e1", "hr-user", { salaryStructureId: "ghost" })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(txMock.employee.update).not.toHaveBeenCalled()
  })

  // A retired band is one Finance has withdrawn; assigning to it would pay a
  // rate nobody currently authorises.
  it("409s when the structure is inactive", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(employee as any)
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue({
      ...structure,
      isActive: false,
    } as any)

    await expect(
      setSalaryStructure("e1", "hr-user", { salaryStructureId: "s1" })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(txMock.employee.update).not.toHaveBeenCalled()
  })

  // Reassigning must not be gated on a locked month: payslips are frozen
  // snapshots, so a paid June cannot change under a new structure.
  it("assigns even when a payroll month is already locked", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(employee as any)
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(structure as any)
    txMock.employee.update.mockResolvedValue({ id: "e1", salaryStructureId: "s1" })

    await expect(
      setSalaryStructure("e1", "hr-user", { salaryStructureId: "s1" })
    ).resolves.toBeDefined()
  })
})

describe("lifecycle events", () => {
  const emitted = () => txMock.event.create.mock.calls[0][0].data as any

  const input = {
    email: "new@demo.com",
    role: "EMPLOYEE" as const,
    fullName: "Nusrat Jahan",
    designation: "Product Designer",
    departmentId: "dept-eng",
    employmentType: "FULL_TIME" as const,
    joiningDate: "2026-08-01",
  }

  it("emits employee.joined at HR and the Super Admin", async () => {
    txMock.idCounter.upsert.mockResolvedValue({ id: "EMP", value: 7 })
    txMock.user.create.mockResolvedValue({ id: "u1" })
    txMock.employee.create.mockResolvedValue({
      id: "emp-7",
      fullName: "Nusrat Jahan",
      designation: "Product Designer",
    })
    txMock.employee.findUnique.mockResolvedValue({ reportingManagerId: "emp-mgr" })

    await createStaffAccount(input, "hr-user")

    expect(emitted()).toMatchObject({
      type: "employee.joined",
      entity: "EMPLOYEE",
      entityId: "emp-7",
      subjectEmployeeId: "emp-7",
      targetRoles: ["HR_ADMIN", "SUPER_ADMIN"],
      actorUserId: "hr-user",
      title: "Nusrat Jahan joined",
    })
    // The joiner's manager, resolved from the subject — which for a joiner
    // is exactly the person who should hear about it.
    expect(emitted().managerEmployeeId).toBe("emp-mgr")
  })

  it("records a null actor when nobody was passed, meaning the system did it", async () => {
    txMock.idCounter.upsert.mockResolvedValue({ id: "EMP", value: 8 })
    txMock.user.create.mockResolvedValue({ id: "u1" })
    txMock.employee.create.mockResolvedValue({ id: "emp-8", fullName: "X", designation: "Y" })
    txMock.employee.findUnique.mockResolvedValue(null)

    await createStaffAccount(input)
    expect(emitted().actorUserId).toBeNull()
  })

  it("writes no event when account creation rolls back", async () => {
    txMock.idCounter.upsert.mockResolvedValue({ id: "EMP", value: 9 })
    txMock.user.create.mockRejectedValueOnce(new Error("duplicate email"))

    await expect(createStaffAccount(input, "hr-user")).rejects.toThrow("duplicate email")
    expect(txMock.event.create).not.toHaveBeenCalled()
  })
})
