import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { assertMonthNotLocked } from "../../utils/month-lock"
import { generateTemporaryPassword, hashPassword } from "../auth/auth.utils"
import { sendStaffCredentialsEmail } from "../auth/mailer"
import { emitEvent } from "../event/event.emit"
import { auditPayroll } from "../payroll/payroll.audit"
import { employeeExitedEvent, employeeJoinedEvent } from "./employee.events"
import type { ExitDetailsBody } from "../settlement/settlement.validators"
import type { CreateStaffAccountInput, CreateStaffAccountResult, EmployeeListItem } from "./employee.types"
import type { SetSalaryStructureBody } from "./employee.validators"

const CODE_PREFIX: Record<CreateStaffAccountInput["role"], string> = {
  EMPLOYEE: "EMP",
  REPORTING_MANAGER: "MNG",
}

/**
 * @param actorUserId The HR user creating the account. Optional so the seed
 *   and existing callers are unaffected; a null actor on the event reads as
 *   "the system did it", which for a seeded account is true.
 */
export async function createStaffAccount(
  input: CreateStaffAccountInput,
  actorUserId?: string
): Promise<CreateStaffAccountResult> {
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

    const employee = await tx.employee.create({
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

    await emitEvent(
      tx,
      employeeJoinedEvent({
        employeeId: employee.id,
        fullName: employee.fullName,
        designation: employee.designation,
        employeeCode: code,
        actorUserId: actorUserId ?? null,
      })
    )

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
    include: { department: true, user: true, salaryStructure: true },
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
    salaryStructure: e.salaryStructure
      ? { id: e.salaryStructure.id, name: e.salaryStructure.name, currency: e.salaryStructure.currency }
      : null,
  }))
}

/**
 * Puts an employee on a pay structure.
 *
 * The split is deliberate and is the reason this lives here rather than in the
 * payroll module: **Finance defines structures, HR assigns people to them.**
 * Neither role can invent a salary and pay it alone — HR may only choose from
 * bands Finance authored, and Finance cannot decide who sits in which band.
 *
 * No month lock. Reassigning does not disturb a paid month: a payslip is a
 * frozen snapshot holding its own figures, not a reference to the structure,
 * so June stays exactly as June was paid. The change lands on the next run.
 */
export async function setSalaryStructure(
  employeeId: string,
  actorUserId: string,
  body: SetSalaryStructureBody
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { salaryStructure: true },
  })
  if (!employee) throw new AppError(404, "Employee not found")

  let structure = null
  if (body.salaryStructureId !== null) {
    structure = await prisma.salaryStructure.findUnique({
      where: { id: body.salaryStructureId },
    })
    if (!structure) throw new AppError(404, "Salary structure not found")
    // An inactive structure is one Finance has retired. Assigning to it would
    // pay a band that is no longer authorised.
    if (!structure.isActive) {
      throw new AppError(409, `"${structure.name}" is inactive and cannot be assigned`)
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: { salaryStructureId: body.salaryStructureId },
      include: { salaryStructure: true },
    })
    await auditPayroll(tx, {
      entity: "EMPLOYEE_SALARY_STRUCTURE",
      entityId: employeeId,
      action: "UPDATE",
      changedBy: actorUserId,
      before: { salaryStructure: employee.salaryStructure?.name ?? null },
      after: { salaryStructure: structure?.name ?? null },
    })
    return updated
  })
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
    await emitEvent(
      tx,
      employeeExitedEvent({
        employeeId,
        fullName: employee.fullName,
        exitReason: body.exitReason,
        lastWorkingDay: body.lastWorkingDay,
        actorUserId,
      })
    )
    return updated
  })
}
