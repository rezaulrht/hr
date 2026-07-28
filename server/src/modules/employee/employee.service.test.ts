import { beforeEach, describe, expect, it, vi } from "vitest"

const txMock = {
  idCounter: { upsert: vi.fn() },
  user: { create: vi.fn() },
  employee: { create: vi.fn() },
}

vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn((fn: any) => fn(txMock)),
    employee: { findMany: vi.fn() },
  },
}))

vi.mock("../auth/mailer", () => ({
  sendStaffCredentialsEmail: vi.fn(() => Promise.resolve()),
}))

import prisma from "../../config/prisma"
import { createStaffAccount, listEmployees } from "./employee.service"
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
      },
    ] as any)

    const result = await listEmployees()

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      include: { department: true, user: true },
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
      },
    ])
  })

  it("returns an empty array when there are no employees", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([])
    const result = await listEmployees()
    expect(result).toEqual([])
  })
})
