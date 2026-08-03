/**
 * The write half of the employee record.
 *
 * Authorisation is a single call to `writableFieldsFor(tier)` — the read side
 * (`employee.access.ts`) is the one place that decides who may see or touch
 * which field, and this module is deliberately thin on top of it: resolve the
 * tier, reject anything the tier doesn't allow, validate the references that
 * survive, diff against the stored row, and write only what changed.
 *
 * `writableFieldsFor` rejects, never drops: a field the caller may not write
 * produces a 403 naming every forbidden field, not a silent 200 that leaves
 * the value unchanged while the UI reports success.
 */

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { emitEvent } from "../event/event.emit"
import { auditPayroll } from "../payroll/payroll.audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import type { Prisma } from "../../generated/prisma/client"
import {
  EMPLOYEE_INCLUDE,
  projectEmployee,
  visibilityTierFor,
  writableFieldsFor,
} from "./employee.access"
import { employeeBankChangedEvent } from "./employee.events"
import { employeeIdForUser } from "./employee.service"
import type { EmployeeView } from "./employee.types"
import type { UpdateEmployeeBody } from "./employee.validators"

const BANK_FIELDS = ["bankAccountNumber", "bankName", "bankRoutingNumber"] as const
const DATE_FIELDS = ["dateOfBirth", "joiningDate"] as const

function toUtcMidnight(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export async function updateEmployee(
  viewer: AccessTokenPayload,
  id: string,
  body: UpdateEmployeeBody
): Promise<EmployeeView> {
  const existing = await prisma.employee.findUnique({
    where: { id },
    include: EMPLOYEE_INCLUDE,
  })
  if (!existing) throw new AppError(404, "Employee not found")

  const tier = visibilityTierFor(viewer, existing, await employeeIdForUser(viewer.sub))

  // Reject, never drop. A silent drop returns 200 and shows the user a success
  // message for a change that did not happen.
  const allowed = writableFieldsFor(tier)
  const forbidden = Object.keys(body).filter((field) => !allowed.has(field))
  if (forbidden.length > 0) {
    throw new AppError(403, `You cannot change: ${forbidden.join(", ")}`)
  }

  await assertReferencesExist(id, body, existing.lastWorkingDay)

  // Only what actually changed. A field submitted with its existing value is
  // not a change, and recording it would make the audit answer "what was
  // sent" rather than "what changed".
  const before: Record<string, Prisma.InputJsonValue> = {}
  const after: Record<string, Prisma.InputJsonValue> = {}
  const data: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(body)) {
    const current = (existing as unknown as Record<string, unknown>)[key]
    const next =
      value !== null && (DATE_FIELDS as readonly string[]).includes(key)
        ? toUtcMidnight(value as string)
        : value

    const same =
      next instanceof Date && current instanceof Date
        ? next.getTime() === current.getTime()
        : next === current
    if (same) continue

    data[key] = next
    before[key] = (
      current instanceof Date ? current.toISOString().slice(0, 10) : current
    ) as Prisma.InputJsonValue
    after[key] = (
      next instanceof Date ? next.toISOString().slice(0, 10) : next
    ) as Prisma.InputJsonValue
  }

  if (Object.keys(data).length === 0) {
    // Nothing changed. Return the current view rather than writing an audit
    // row that records no change.
    return projectEmployee(existing, tier)
  }

  const changedBankFields = BANK_FIELDS.filter((field) => field in data)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.employee.update({
      where: { id },
      data,
      include: EMPLOYEE_INCLUDE,
    })
    await auditPayroll(tx, {
      entity: "EMPLOYEE_PROFILE",
      entityId: id,
      action: "UPDATE",
      changedBy: viewer.sub,
      before,
      after,
    })
    if (changedBankFields.length > 0) {
      await emitEvent(
        tx,
        employeeBankChangedEvent({
          employeeId: id,
          fullName: row.fullName,
          changedFields: [...changedBankFields],
          actorUserId: viewer.sub,
        })
      )
    }
    return row
  })

  return projectEmployee(updated, tier)
}

async function assertReferencesExist(
  employeeId: string,
  body: UpdateEmployeeBody,
  lastWorkingDay: Date | null
): Promise<void> {
  if (body.departmentId !== undefined) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } })
    if (!dept) throw new AppError(400, "Department not found")
  }

  if (body.shiftId !== undefined && body.shiftId !== null) {
    const shift = await prisma.shift.findUnique({ where: { id: body.shiftId } })
    if (!shift) throw new AppError(400, "Shift not found")
  }

  if (body.reportingManagerId !== undefined && body.reportingManagerId !== null) {
    if (body.reportingManagerId === employeeId) {
      throw new AppError(400, "An employee cannot report to themselves")
    }
    const manager = await prisma.employee.findUnique({
      where: { id: body.reportingManagerId },
      include: { user: { select: { role: true } } },
    })
    if (!manager) throw new AppError(400, "Reporting manager not found")
    if (manager.user.role !== "REPORTING_MANAGER") {
      throw new AppError(400, "That employee is not a reporting manager")
    }
  }

  if (body.dateOfBirth !== undefined && body.dateOfBirth !== null) {
    if (toUtcMidnight(body.dateOfBirth).getTime() >= Date.now()) {
      throw new AppError(400, "Date of birth must be in the past")
    }
  }

  if (body.joiningDate !== undefined && lastWorkingDay !== null) {
    if (toUtcMidnight(body.joiningDate).getTime() > lastWorkingDay.getTime()) {
      throw new AppError(409, "An employee cannot start after their last working day")
    }
  }
}
