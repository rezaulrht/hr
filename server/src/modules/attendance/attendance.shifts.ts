/**
 * Shifts: the company's working-hours definitions.
 *
 * Two rules here do not generalise from the other reference tables.
 *
 * 1. The shift named DEFAULT_SHIFT_NAME is load-bearing *by name*. The day
 *    grid resolves it for every employee whose shiftId is null and throws a
 *    raw Error when it is absent, so deleting or renaming it 500s attendance
 *    for the whole company. The usage guard cannot see this: employees on the
 *    default reference the row not at all, so its count is zero.
 *
 * 2. Only weeklyOffDays rewrites history. `isLate` is decided at punch time
 *    and stored, so a change to startTime/endTime/graceMinutes/breakMinutes
 *    affects future punches only. weeklyOffDays is re-derived on read, so
 *    changing it reclassifies past days for everyone on the shift — hence the
 *    impact block, following the holiday module's precedent.
 */

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import { describeUsage } from "../../utils/referenceUsage"
import type { AccessTokenPayload } from "../auth/auth.types"
import { DEFAULT_SHIFT_NAME } from "./attendance.grid"
import type { ShiftBody, ShiftUpdateBody } from "./attendance.validators"

export interface ShiftImpactBlock {
  affectedEmployees: number
  /** Earliest date that re-derives. Null when no attendance exists yet. */
  earliestAffectedDate: string | null
}

export interface ShiftWriteResult {
  shift: Awaited<ReturnType<typeof prisma.shift.update>>
  /** Present only when weeklyOffDays actually changed. */
  impact?: ShiftImpactBlock
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002"
}

const sameDays = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((day, i) => day === b[i])

/**
 * Two consumers: HR's employee-form shift picker, which needs only the name
 * and window, and the Settings editor, which needs every field it can write.
 * Whole rows rather than the picker's old four-column select — a superset the
 * picker ignores, and the alternative is a second near-identical query.
 */
export async function listShifts() {
  return prisma.shift.findMany({ orderBy: { name: "asc" } })
}

export async function createShift(input: ShiftBody, actor: AccessTokenPayload) {
  try {
    return await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({ data: input })

      await writeAudit(tx, {
        entity: "SHIFT",
        entityId: shift.id,
        action: "CREATE",
        changedBy: actor.sub,
        after: { name: shift.name, startTime: shift.startTime, endTime: shift.endTime },
      })

      return shift
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "A shift with this name already exists")
    }
    throw err
  }
}

/** Employees on the shift, and the earliest attendance date among them. */
async function impactOf(shiftId: string): Promise<ShiftImpactBlock> {
  const [affectedEmployees, earliest] = await Promise.all([
    prisma.employee.count({ where: { shiftId } }),
    prisma.attendance.findFirst({
      where: { employee: { shiftId } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ])

  return {
    affectedEmployees,
    earliestAffectedDate: earliest ? earliest.date.toISOString().slice(0, 10) : null,
  }
}

export async function updateShift(
  id: string,
  input: ShiftUpdateBody,
  actor: AccessTokenPayload
): Promise<ShiftWriteResult> {
  let offDaysChanged = false

  const shift = await prisma
    .$transaction(async (tx) => {
      const existing = await tx.shift.findUnique({ where: { id } })
      if (!existing) throw new AppError(404, "Shift not found")

      if (
        existing.name === DEFAULT_SHIFT_NAME &&
        input.name !== undefined &&
        input.name !== existing.name
      ) {
        throw new AppError(
          409,
          `"${DEFAULT_SHIFT_NAME}" is the company default and cannot be renamed. Every employee without an explicit shift is resolved by that name.`
        )
      }

      offDaysChanged =
        input.weeklyOffDays !== undefined && !sameDays(input.weeklyOffDays, existing.weeklyOffDays)

      const updated = await tx.shift.update({ where: { id }, data: input })

      await writeAudit(tx, {
        entity: "SHIFT",
        entityId: id,
        action: "UPDATE",
        changedBy: actor.sub,
        before: {
          name: existing.name,
          startTime: existing.startTime,
          endTime: existing.endTime,
          weeklyOffDays: existing.weeklyOffDays,
        },
        after: {
          name: updated.name,
          startTime: updated.startTime,
          endTime: updated.endTime,
          weeklyOffDays: updated.weeklyOffDays,
        },
      })

      return updated
    })
    .catch((err: unknown) => {
      if (isUniqueViolation(err)) {
        throw new AppError(409, "A shift with this name already exists")
      }
      throw err
    })

  // Computed after the transaction: it is a read for the caller's benefit,
  // not part of the write, and holding the transaction open for two extra
  // queries buys nothing.
  return offDaysChanged ? { shift, impact: await impactOf(id) } : { shift }
}

export async function deleteShift(id: string, actor: AccessTokenPayload): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.shift.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Shift not found")

    // Checked before the usage count, and independently of it: employees on
    // the default have shiftId null, so this shift's count is zero and the
    // guard below would wave the delete straight through.
    if (existing.name === DEFAULT_SHIFT_NAME) {
      throw new AppError(
        409,
        `"${DEFAULT_SHIFT_NAME}" is the company default and cannot be deleted. Attendance resolves it for every employee without an explicit shift.`
      )
    }

    const employees = await tx.employee.count({ where: { shiftId: id } })
    const usage = describeUsage([{ noun: "employee", count: employees }])
    if (usage !== null) {
      throw new AppError(409, `This shift is still in use by ${usage}. Reassign them first.`)
    }

    await tx.shift.delete({ where: { id } })

    await writeAudit(tx, {
      entity: "SHIFT",
      entityId: id,
      action: "DELETE",
      changedBy: actor.sub,
      before: { name: existing.name, startTime: existing.startTime, endTime: existing.endTime },
    })
  })
}
