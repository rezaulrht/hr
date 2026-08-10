/**
 * HR administration of the leave catalogue.
 *
 * Company-policy types are ordinary reference data. Statutory types — the
 * Bangladesh Labour Act rows the seed writes — may be edited **upward only**
 * and never deleted, so the company can be more generous than the Act but
 * cannot quietly fall below it.
 *
 * Comparison is against the current database row, not against
 * LEAVE_TYPE_CATALOGUE. That is what makes "up only" compose: raise casual
 * from 10 to 12, and the next edit may go to 14 but not back to 11. The cost
 * is that a raise is one-way through this API — correcting a fat-fingered
 * quota needs the seed or direct database access. That is the deliberate
 * trade: comparing against the catalogue instead would let a deliberately
 * granted benefit be walked back to the statutory floor with no warning.
 */

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import { describeUsage } from "../../utils/referenceUsage"
import type { AccessTokenPayload } from "../auth/auth.types"
import type { CreateLeaveTypeInput, UpdateLeaveTypeInput } from "./leave.validators"

/** The subset of `LeaveType` the statutory check reads. */
export interface StatutoryComparable {
  name: string
  statutory: boolean
  isPaid: boolean
  annualQuota: number
  carryForwardPct: number
  maxConsecutive: number | null
  maxAccrual: number | null
  minServiceMonths: number
  accrualBasis: string
  countsHolidays: boolean
  allowsBackdating: boolean
  allowsHalfDay: boolean
  eligibleFor: string[]
}

/**
 * Fields that say *which section applies and how it computes*, rather than
 * how generous the company is. There is no coherent "up" for these: setting
 * EARNED.accrualBasis to PRO_RATED grants nobody an extra day, it detaches
 * the §117 accrual engine that switches on it.
 */
const LOCKED = ["accrualBasis", "countsHolidays", "allowsBackdating", "allowsHalfDay"] as const

/** Numeric fields where a higher value is the more generous one. */
const AT_LEAST = ["annualQuota", "carryForwardPct"] as const

/** Numeric caps where higher is more generous and null means uncapped. */
const CAPS = ["maxAccrual", "maxConsecutive"] as const

export function assertStatutoryUpdateAllowed(
  existing: StatutoryComparable,
  input: UpdateLeaveTypeInput
): void {
  if (!existing.statutory) return

  // Returns the error rather than throwing it, so every call site reads
  // `throw refusal(...)`. A helper that throws would not narrow `current`
  // below — TypeScript only treats a call as unreachable-after when the
  // callee is declared `never` at the variable, not at the arrow.
  const refusal = (reason: string): AppError =>
    new AppError(409, `${existing.name} is statutory: ${reason}.`)

  for (const field of LOCKED) {
    const next = input[field]
    if (next !== undefined && next !== existing[field]) {
      throw refusal(`${field} cannot be changed`)
    }
  }

  for (const field of AT_LEAST) {
    const next = input[field]
    if (next !== undefined && next < existing[field]) {
      throw refusal(`${field} cannot go below ${existing[field]}`)
    }
  }

  for (const field of CAPS) {
    const next = input[field]
    if (next === undefined) continue
    // null is uncapped, so it is always at least as generous as any number.
    if (next === null) continue
    const current = existing[field]
    // Going from uncapped to any number is a reduction.
    if (current === null) throw refusal(`${field} cannot be capped once it is uncapped`)
    if (next < current) throw refusal(`${field} cannot go below ${current}`)
  }

  // Inverted on purpose, and the only field that is: minServiceMonths is a
  // waiting period, so a SMALLER number is the more generous one. §117 needs
  // twelve months; six is a benefit, twenty-four is a breach.
  if (input.minServiceMonths !== undefined && input.minServiceMonths > existing.minServiceMonths) {
    throw refusal(`minServiceMonths cannot go above ${existing.minServiceMonths}`)
  }

  if (input.isPaid !== undefined && !input.isPaid && existing.isPaid) {
    throw refusal("isPaid cannot be turned off")
  }

  if (input.eligibleFor !== undefined) {
    const next = new Set<string>(input.eligibleFor)
    const dropped = existing.eligibleFor.filter((type) => !next.has(type))
    if (dropped.length > 0) {
      throw refusal(`eligibleFor cannot drop ${dropped.join(", ")}`)
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002"
}

export async function createLeaveType(input: CreateLeaveTypeInput, actor: AccessTokenPayload) {
  try {
    return await prisma.$transaction(async (tx) => {
      const leaveType = await tx.leaveType.create({
        // `statutory` is forced, never taken from the body: a row HR could
        // mark statutory is a row HR could then no longer correct.
        data: { ...input, statutory: false },
      })

      await writeAudit(tx, {
        entity: "LEAVE_TYPE",
        entityId: leaveType.id,
        action: "CREATE",
        changedBy: actor.sub,
        after: { code: leaveType.code, name: leaveType.name, annualQuota: leaveType.annualQuota },
      })

      return leaveType
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "A leave type with this code or name already exists")
    }
    throw err
  }
}

export async function updateLeaveType(
  id: string,
  input: UpdateLeaveTypeInput,
  actor: AccessTokenPayload
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.leaveType.findUnique({ where: { id } })
      if (!existing) throw new AppError(404, "Leave type not found")

      assertStatutoryUpdateAllowed(existing, input)

      const updated = await tx.leaveType.update({ where: { id }, data: input })

      await writeAudit(tx, {
        entity: "LEAVE_TYPE",
        entityId: id,
        action: "UPDATE",
        changedBy: actor.sub,
        before: {
          name: existing.name,
          annualQuota: existing.annualQuota,
          minServiceMonths: existing.minServiceMonths,
        },
        after: {
          name: updated.name,
          annualQuota: updated.annualQuota,
          minServiceMonths: updated.minServiceMonths,
        },
      })

      return updated
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "A leave type with this code or name already exists")
    }
    throw err
  }
}

export async function deleteLeaveType(id: string, actor: AccessTokenPayload): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.leaveType.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Leave type not found")

    if (existing.statutory) {
      throw new AppError(
        409,
        `${existing.name} is a statutory leave type and cannot be deleted. Reduce it as far as the Act allows instead.`
      )
    }

    const [requests, balances] = await Promise.all([
      tx.leaveRequest.count({ where: { leaveTypeId: id } }),
      tx.leaveBalance.count({ where: { leaveTypeId: id } }),
    ])

    const usage = describeUsage([
      { noun: "leave request", count: requests },
      { noun: "leave balance", count: balances },
    ])
    if (usage !== null) {
      throw new AppError(409, `This leave type is still in use by ${usage}. Reassign them first.`)
    }

    await tx.leaveType.delete({ where: { id } })

    await writeAudit(tx, {
      entity: "LEAVE_TYPE",
      entityId: id,
      action: "DELETE",
      changedBy: actor.sub,
      before: { code: existing.code, name: existing.name },
    })
  })
}
