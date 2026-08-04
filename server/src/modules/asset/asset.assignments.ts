/**
 * The custody ledger.
 *
 * **Append-only.** A row is written once and later closed by setting the
 * return fields. Nothing else about it is ever updated and nothing is ever
 * deleted. `Asset.currentHolderId` would have been smaller and is the wrong
 * shape for the same reason `Attendance.correctedBy` needed `AttendanceAudit`:
 * it is overwritten on every handover, and the dispute that matters is always
 * about the *previous* holder — "I gave it back", "that dent was already
 * there".
 *
 * The 409s here fire before the database's partial unique index does. The
 * index is the real guarantee; these just turn a constraint violation into a
 * message naming who is holding the thing.
 */

import prisma from "../../config/prisma"
import type { AssetAssignment, AssetCondition, Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { emitEvent } from "../event/event.emit"
import { assetAcknowledgedEvent, assetAssignedEvent, assetReturnedEvent } from "./asset.events"

export interface AssignInput {
  employeeId: string
  conditionOut: AssetCondition
  issueNote?: string
  /** Set when this handover fulfils a request; carried into the event. */
  requestId?: string | null
}

async function assignAssetIn(
  tx: Prisma.TransactionClient,
  assetId: string,
  input: AssignInput,
  actor: AccessTokenPayload
): Promise<AssetAssignment> {
  const asset = await tx.asset.findUnique({ where: { id: assetId } })
  if (!asset) throw new AppError(404, "Asset not found")
  if (asset.lifecycle === "RETIRED") {
    throw new AppError(409, "This asset is retired")
  }
  if (asset.lifecycle === "LOST") {
    throw new AppError(409, "This asset has been marked lost")
  }

  const open = await tx.assetAssignment.findFirst({
    where: { assetId, returnedAt: null },
    include: { employee: true },
  })
  if (open) {
    throw new AppError(
      409,
      `${asset.assetTag} is already assigned to ${open.employee.fullName}`
    )
  }

  const assignment = await tx.assetAssignment.create({
    data: {
      assetId,
      employeeId: input.employeeId,
      assignedAt: new Date(),
      assignedBy: actor.sub,
      conditionOut: input.conditionOut,
      issueNote: input.issueNote ?? null,
      acknowledgedAt: null,
    },
  })

  await writeAudit(tx, {
    entity: "ASSET_ASSIGNMENT",
    entityId: assignment.id,
    action: "ASSIGN",
    changedBy: actor.sub,
    after: { assetId, employeeId: input.employeeId, conditionOut: input.conditionOut },
  })

  await emitEvent(
    tx,
    assetAssignedEvent({
      assetId,
      assetTag: asset.assetTag,
      assetName: asset.name,
      employeeId: input.employeeId,
      actorUserId: actor.sub,
      requestId: input.requestId ?? null,
    })
  )

  return assignment
}

// The trailing `tx` is REQUIRED, not an afterthought: fulfilRequest must
// create the assignment and flip the request inside ONE transaction, and it
// cannot do that if assignAsset always opens its own. When absent, assignAsset
// opens its own $transaction; when present, it enlists in the caller's.
export function assignAsset(
  assetId: string,
  input: AssignInput,
  actor: AccessTokenPayload,
  tx?: Prisma.TransactionClient
): Promise<AssetAssignment> {
  if (tx) return assignAssetIn(tx, assetId, input, actor)
  return prisma.$transaction((t) => assignAssetIn(t, assetId, input, actor))
}

export async function returnAsset(
  assetId: string,
  input: { conditionIn: AssetCondition; returnNote?: string },
  actor: AccessTokenPayload
): Promise<AssetAssignment> {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId } })
    if (!asset) throw new AppError(404, "Asset not found")

    const open = await tx.assetAssignment.findFirst({
      where: { assetId, returnedAt: null },
    })
    if (!open) {
      throw new AppError(409, "Nobody is currently holding this asset")
    }

    const updated = await tx.assetAssignment.update({
      where: { id: open.id },
      data: {
        returnedAt: new Date(),
        returnedTo: actor.sub,
        conditionIn: input.conditionIn,
        returnNote: input.returnNote ?? null,
      },
    })

    await writeAudit(tx, {
      entity: "ASSET_ASSIGNMENT",
      entityId: open.id,
      action: "RETURN",
      changedBy: actor.sub,
      after: { conditionIn: input.conditionIn },
    })

    // Returning something DAMAGED never creates anything here. Pricing the
    // damage is a person's judgement and recoveries are a later phase.
    await emitEvent(
      tx,
      assetReturnedEvent({
        assetId,
        assetTag: asset.assetTag,
        employeeId: open.employeeId,
        conditionIn: input.conditionIn,
        actorUserId: actor.sub,
      })
    )

    return updated
  })
}

export async function acknowledgeAssignment(
  assignmentId: string,
  actor: AccessTokenPayload
): Promise<AssetAssignment> {
  const employee = await prisma.employee.findUnique({
    where: { userId: actor.sub },
    select: { id: true },
  })

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.assetAssignment.findUnique({
      where: { id: assignmentId },
      include: { asset: true },
    })
    if (!assignment) throw new AppError(404, "Assignment not found")
    if (!employee || assignment.employeeId !== employee.id) {
      throw new AppError(403, "You can only acknowledge your own assignments")
    }

    // Idempotent: a second press is not an error, it just returns the row
    // unchanged.
    if (assignment.acknowledgedAt) {
      return assignment
    }

    const updated = await tx.assetAssignment.update({
      where: { id: assignmentId },
      data: { acknowledgedAt: new Date() },
    })

    await writeAudit(tx, {
      entity: "ASSET_ASSIGNMENT",
      entityId: assignmentId,
      action: "ACKNOWLEDGE",
      changedBy: actor.sub,
      after: { acknowledgedAt: updated.acknowledgedAt },
    })

    await emitEvent(
      tx,
      assetAcknowledgedEvent({
        assetId: assignment.asset.id,
        assetTag: assignment.asset.assetTag,
        employeeId: assignment.employeeId,
        actorUserId: actor.sub,
      })
    )

    return updated
  })
}

/** The caller's own open and past assignments. */
export async function myHoldings(actor: AccessTokenPayload): Promise<AssetAssignment[]> {
  const employee = await prisma.employee.findUnique({
    where: { userId: actor.sub },
    select: { id: true },
  })
  if (!employee) return []

  return prisma.assetAssignment.findMany({
    where: { employeeId: employee.id },
    include: { asset: { include: { category: true } } },
    orderBy: { assignedAt: "desc" },
  })
}

/** HR's chase list: open assignments the holder has not yet acknowledged, oldest first. */
export async function listUnacknowledged(): Promise<AssetAssignment[]> {
  return prisma.assetAssignment.findMany({
    where: { returnedAt: null, acknowledgedAt: null },
    include: {
      asset: { include: { category: true } },
      employee: { select: { id: true, fullName: true, employeeCode: true } },
    },
    orderBy: { assignedAt: "asc" },
  })
}

export interface OpenAssignment {
  assignmentId: string
  assetId: string
  assetTag: string
  assetName: string
  categoryName: string
  assignedAt: Date
  conditionOut: AssetCondition
  acknowledgedAt: Date | null
}

/**
 * A leaver's exit checklist. Consumers, not writers — phase 2's settlement
 * preflight renders this as a **warning, never a blocker**: unapproved
 * attendance blocks a payroll run because the figure itself would be wrong;
 * an unreturned laptop does not block a settlement, because the salary figure
 * is right and the asset is a separate debt.
 *
 * Consumables are excluded. A mouse is issued, recorded and never chased.
 */
export async function openAssignmentsFor(employeeId: string): Promise<OpenAssignment[]> {
  const rows = await prisma.assetAssignment.findMany({
    where: {
      employeeId,
      returnedAt: null,
      asset: { category: { isConsumable: false } },
    },
    include: { asset: { include: { category: true } } },
    orderBy: { assignedAt: "asc" },
  })
  return rows.map((r) => ({
    assignmentId: r.id,
    assetId: r.assetId,
    assetTag: r.asset.assetTag,
    assetName: r.asset.name,
    categoryName: r.asset.category.name,
    assignedAt: r.assignedAt,
    conditionOut: r.conditionOut,
    acknowledgedAt: r.acknowledgedAt,
  }))
}
