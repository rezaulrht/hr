/**
 * Asset requests, approved by the requester's manager.
 *
 * The approver rule is attendance's, verbatim:
 *
 *   The approver is the employee's `reportingManagerId`. If that is null, the
 *   request falls to HR_ADMIN / SUPER_ADMIN.
 *
 * It is right for the same reason it was right there: a Reporting Manager is
 * an Employee like any other, so a manager's own request goes to whoever is
 * above them and to HR when nobody is. No role check, no special case — it
 * falls out of the org chart. Two guards on top: nobody approves their own
 * request, and HR/Super Admin can override any of them, so a resigned or slow
 * manager cannot park a request forever.
 *
 * *Why the manager rather than HR:* "does this person need a second monitor?"
 * is a judgement about their work, which their manager has and HR does not.
 * HR owns whether a unit is available, which is answered at fulfilment.
 */

import prisma from "../../config/prisma"
import type { AssetRequest, Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import { assignAsset } from "./asset.assignments"
import type { AccessTokenPayload } from "../auth/auth.types"
import { emitEvent } from "../event/event.emit"
import { assetRequestEvent } from "./asset.events"

export interface SubmitRequestInput {
  categoryId: string
  reason: string
}

/** `employee.reportingManagerId`, or null so the request falls to HR. */
export async function resolveApprover(employeeId: string): Promise<string | null> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { reportingManagerId: true },
  })
  return employee?.reportingManagerId ?? null
}

/**
 * Whether this actor may decide this request.
 *
 * Mirrors `attendance.approval.ts`'s `assertCanDecide`: nobody decides their
 * own request, HR/Super Admin override anyone, and otherwise the caller must
 * be the resolved approver.
 */
async function assertCanDecide(
  actor: AccessTokenPayload,
  request: { employeeId: string }
): Promise<void> {
  const isHr = actor.role === "HR_ADMIN" || actor.role === "SUPER_ADMIN"

  const self = await prisma.employee.findUnique({
    where: { userId: actor.sub },
    select: { id: true },
  })
  if (self && self.id === request.employeeId) {
    throw new AppError(403, "You cannot approve your own asset request")
  }

  if (isHr) return

  const approverId = await resolveApprover(request.employeeId)
  if (self && approverId === self.id) return

  throw new AppError(403, "You are not the approver for this request")
}

export async function submitRequest(
  input: SubmitRequestInput,
  actor: AccessTokenPayload
): Promise<AssetRequest> {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { userId: actor.sub } })
    if (!employee) throw new AppError(404, "Employee profile not found")

    const category = await tx.assetCategory.findUnique({ where: { id: input.categoryId } })
    if (!category) throw new AppError(400, "Asset category not found")

    const request = await tx.assetRequest.create({
      data: {
        employeeId: employee.id,
        categoryId: input.categoryId,
        reason: input.reason,
        status: "PENDING",
      },
    })

    await writeAudit(tx, {
      entity: "ASSET_REQUEST",
      entityId: request.id,
      action: "SUBMIT",
      changedBy: actor.sub,
      after: { categoryId: input.categoryId, reason: input.reason },
    })

    await emitEvent(
      tx,
      assetRequestEvent({
        stage: "submitted",
        requestId: request.id,
        employeeId: employee.id,
        approverEmployeeId: await resolveApprover(employee.id),
        categoryName: category.name,
        actorUserId: actor.sub,
        note: null,
      })
    )

    return request
  })
}

/**
 * Scoped the way attendance's approvals queue is: an employee sees their own
 * requests, a manager sees their own plus their reports', HR/Super Admin see
 * all.
 */
export async function listRequests(viewer: AccessTokenPayload): Promise<AssetRequest[]> {
  const isHr = viewer.role === "HR_ADMIN" || viewer.role === "SUPER_ADMIN"

  let where: Prisma.AssetRequestWhereInput = {}
  if (!isHr) {
    const self = await prisma.employee.findUnique({
      where: { userId: viewer.sub },
      select: { id: true },
    })
    if (!self) return []

    where =
      viewer.role === "REPORTING_MANAGER"
        ? { OR: [{ employeeId: self.id }, { employee: { reportingManagerId: self.id } }] }
        : { employeeId: self.id }
  }

  return prisma.assetRequest.findMany({
    where,
    include: {
      category: true,
      employee: { select: { id: true, fullName: true, employeeCode: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function approveRequest(
  requestId: string,
  body: { note?: string },
  actor: AccessTokenPayload
): Promise<AssetRequest> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.assetRequest.findUnique({
      where: { id: requestId },
      include: { category: true },
    })
    if (!request) throw new AppError(404, "Asset request not found")

    await assertCanDecide(actor, request)

    if (request.status !== "PENDING") {
      throw new AppError(409, "This request has already been decided")
    }

    const updated = await tx.assetRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        decidedBy: actor.sub,
        decidedAt: new Date(),
        decisionNote: body.note ?? null,
      },
    })

    await writeAudit(tx, {
      entity: "ASSET_REQUEST",
      entityId: requestId,
      action: "APPROVE",
      changedBy: actor.sub,
      after: { status: "APPROVED" },
      note: body.note ?? null,
    })

    await emitEvent(
      tx,
      assetRequestEvent({
        stage: "approved",
        requestId,
        employeeId: request.employeeId,
        approverEmployeeId: null,
        categoryName: request.category.name,
        actorUserId: actor.sub,
        note: body.note ?? null,
      })
    )

    return updated
  })
}

/** Reject requires a non-empty `note`, matching leave and attendance. */
export async function rejectRequest(
  requestId: string,
  body: { note: string },
  actor: AccessTokenPayload
): Promise<AssetRequest> {
  if (!body.note || !body.note.trim()) {
    throw new AppError(400, "A reason is required to reject a request")
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.assetRequest.findUnique({
      where: { id: requestId },
      include: { category: true },
    })
    if (!request) throw new AppError(404, "Asset request not found")

    await assertCanDecide(actor, request)

    if (request.status !== "PENDING") {
      throw new AppError(409, "This request has already been decided")
    }

    const updated = await tx.assetRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        decidedBy: actor.sub,
        decidedAt: new Date(),
        decisionNote: body.note,
      },
    })

    await writeAudit(tx, {
      entity: "ASSET_REQUEST",
      entityId: requestId,
      action: "REJECT",
      changedBy: actor.sub,
      after: { status: "REJECTED" },
      note: body.note,
    })

    await emitEvent(
      tx,
      assetRequestEvent({
        stage: "rejected",
        requestId,
        employeeId: request.employeeId,
        approverEmployeeId: null,
        categoryName: request.category.name,
        actorUserId: actor.sub,
        note: body.note,
      })
    )

    return updated
  })
}

/** The requester's own, while PENDING. No event: there is no "cancelled" stage in the feed. */
export async function cancelRequest(
  requestId: string,
  actor: AccessTokenPayload
): Promise<AssetRequest> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.assetRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new AppError(404, "Asset request not found")

    const self = await prisma.employee.findUnique({
      where: { userId: actor.sub },
      select: { id: true },
    })
    if (!self || self.id !== request.employeeId) {
      throw new AppError(403, "You can only cancel your own request")
    }
    if (request.status !== "PENDING") {
      throw new AppError(409, "Only a pending request can be cancelled")
    }

    const updated = await tx.assetRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", decidedBy: actor.sub, decidedAt: new Date() },
    })

    await writeAudit(tx, {
      entity: "ASSET_REQUEST",
      entityId: requestId,
      action: "CANCEL",
      changedBy: actor.sub,
      after: { status: "CANCELLED" },
    })

    return updated
  })
}

export async function fulfilRequest(
  requestId: string,
  input: { assetId: string },
  actor: AccessTokenPayload
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.assetRequest.findUnique({
      where: { id: requestId },
      include: { category: true },
    })
    if (!request) throw new AppError(404, "Asset request not found")
    // Fulfilment is an action, not a second approval. HR either has a spare
    // monitor or does not; if they do not, the request stays APPROVED and
    // visibly unfulfilled, which is the honest state and a useful
    // procurement signal.
    if (request.status !== "APPROVED") {
      throw new AppError(409, "Only an approved request can be fulfilled")
    }

    // Same transaction: a fulfilled request with no assignment behind it
    // would be a register that says somebody has a monitor nobody issued.
    await assignAsset(
      input.assetId,
      { employeeId: request.employeeId, conditionOut: "GOOD", requestId },
      actor,
      tx
    )

    const updated = await tx.assetRequest.update({
      where: { id: requestId },
      data: {
        status: "FULFILLED",
        fulfilledAt: new Date(),
        fulfilledBy: actor.sub,
        fulfilledAssetId: input.assetId,
      },
    })

    await writeAudit(tx, {
      entity: "ASSET_REQUEST",
      entityId: requestId,
      action: "FULFIL",
      changedBy: actor.sub,
      after: { assetId: input.assetId },
    })

    // No event here. assignAsset already emitted asset.assigned carrying the
    // request id; a second event would put one fact in the feed twice.
    return updated
  })
}
