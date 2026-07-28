import prisma from "../../config/prisma"
import { generateTemporaryPassword, hashPassword } from "../auth/auth.utils"
import { sendStaffCredentialsEmail } from "../auth/mailer"
import type { CreateStaffAccountInput, CreateStaffAccountResult, EmployeeListItem } from "./employee.types"

const CODE_PREFIX: Record<CreateStaffAccountInput["role"], string> = {
  EMPLOYEE: "EMP",
  REPORTING_MANAGER: "MNG",
}

export async function createStaffAccount(input: CreateStaffAccountInput): Promise<CreateStaffAccountResult> {
  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  const prefix = CODE_PREFIX[input.role]

  const employeeCode = await prisma.$transaction(async (tx) => {
    const counter = await tx.idCounter.upsert({
      where: { id: prefix },
      update: { value: { increment: 1 } },
      create: { id: prefix, value: 1 },
    })
    const code = `BS-${prefix}-${String(counter.value).padStart(5, "0")}`

    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
        mustChangePassword: true,
      },
    })

    await tx.employee.create({
      data: {
        userId: user.id,
        employeeCode: code,
        fullName: input.fullName,
        designation: input.designation,
        departmentId: input.departmentId,
        employmentType: input.employmentType,
        joiningDate: new Date(input.joiningDate),
        reportingManagerId: input.reportingManagerId,
      },
    })

    return code
  })

  await sendStaffCredentialsEmail(input.email, employeeCode, temporaryPassword).catch((err) => {
    console.error("Failed to send staff credentials email", err)
  })

  return {
    employeeCode,
    temporaryPassword,
    fullName: input.fullName,
    email: input.email,
  }
}

export async function listEmployees(): Promise<EmployeeListItem[]> {
  const employees = await prisma.employee.findMany({
    include: { department: true, user: true },
    orderBy: { fullName: "asc" },
  })
  return employees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    fullName: e.fullName,
    email: e.user.email,
    designation: e.designation,
    department: { id: e.department.id, name: e.department.name },
    employmentType: e.employmentType,
    employmentStatus: e.employmentStatus,
    joiningDate: e.joiningDate.toISOString(),
  }))
}
