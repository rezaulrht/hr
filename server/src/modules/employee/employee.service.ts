import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { assertMonthNotLocked } from "../../utils/month-lock"
import { generateTemporaryPassword, hashPassword } from "../auth/auth.utils"
import { sendStaffCredentialsEmail } from "../auth/mailer"
import { auditPayroll } from "../payroll/payroll.audit"
import type { ExitDetailsBody } from "../settlement/settlement.validators"
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

/**
 * Records the facts a settlement is computed from. HR owns this; the enum
 * drives money, so it is not a filing category.
 */
export async function setExitDetails(
  employeeId: string,
  actorUserId: string,
  body: ExitDetailsBody
) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) throw new AppError(404, "Employee not found")

  const lastWorkingDay = new Date(`${body.lastWorkingDay}T00:00:00.000Z`)
  if (lastWorkingDay.getTime() < employee.joiningDate.getTime()) {
    throw new AppError(400, "The last working day cannot precede the joining date")
  }

  // Otherwise a settlement would pay days a run already paid — the exact
  // overlap the run's roster rule exists to prevent.
  await assertMonthNotLocked(lastWorkingDay)

  // Those fields *are* the money once a settlement has been agreed.
  const settled = await prisma.settlement.findFirst({
    where: { employeeId, status: { in: ["APPROVED", "PAID"] } },
  })
  if (settled) {
    throw new AppError(
      409,
      `This employee's settlement is already ${settled.status.toLowerCase()}. Exit details are frozen once a settlement is approved.`
    )
  }

  // §22/§23 are employer-ended; the rest read as the employee leaving.
  const employmentStatus =
    body.exitReason === "TERMINATION" ||
    body.exitReason === "DISMISSAL" ||
    body.exitReason === "DISCHARGE" ||
    body.exitReason === "RETRENCHMENT"
      ? "TERMINATED"
      : "RESIGNED"

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        lastWorkingDay,
        exitReason: body.exitReason,
        exitNote: body.exitNote,
        employmentStatus,
      },
    })
    await auditPayroll(tx, {
      entity: "EMPLOYEE_EXIT",
      entityId: employeeId,
      action: "UPDATE",
      changedBy: actorUserId,
      before: {
        lastWorkingDay: employee.lastWorkingDay?.toISOString().slice(0, 10) ?? null,
        exitReason: employee.exitReason,
        employmentStatus: employee.employmentStatus,
      },
      after: {
        lastWorkingDay: body.lastWorkingDay,
        exitReason: body.exitReason,
        employmentStatus,
      },
      note: body.exitNote,
    })
    return updated
  })
}
