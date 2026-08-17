/**
 * How an asset action reads in a feed.
 *
 * Costs are never carried here. A feed line is visible to the subject
 * employee and their manager, and neither is entitled to `purchaseCost` —
 * the same asymmetry the read endpoints enforce by omitting the field.
 */

import type { EventInput } from "../event/event.types"

interface AssignedArgs {
  assetId: string
  assetTag: string
  assetName: string
  employeeId: string
  actorUserId: string | null
  /** Set when this assignment fulfilled a request. */
  requestId: string | null
}

export function assetAssignedEvent(args: AssignedArgs): EventInput {
  return {
    type: "asset.assigned",
    severity: "INFO",
    actorUserId: args.actorUserId,
    entity: "ASSET",
    entityId: args.assetId,
    subjectEmployeeId: args.employeeId,
    // Left undefined so emitEvent resolves the reporting line. An explicit
    // null would suppress the manager audience, which is right for payslips
    // and wrong here — a manager should see what their report is holding.
    targetRoles: ["HR_ADMIN"],
    title: "Asset issued",
    meta: `${args.assetTag} · ${args.assetName}`,
    href: "/assets",
    payload: {
      assetTag: args.assetTag,
      assetName: args.assetName,
      requestId: args.requestId,
    },
  }
}

interface AcknowledgedArgs {
  assetId: string
  assetTag: string
  employeeId: string
  actorUserId: string | null
}

export function assetAcknowledgedEvent(args: AcknowledgedArgs): EventInput {
  return {
    type: "asset.acknowledged",
    severity: "SUCCESS",
    actorUserId: args.actorUserId,
    entity: "ASSET_ASSIGNMENT",
    entityId: args.assetId,
    subjectEmployeeId: args.employeeId,
    targetRoles: ["HR_ADMIN"],
    title: "Asset receipt acknowledged",
    meta: args.assetTag,
    href: "/assets",
    payload: { assetTag: args.assetTag },
  }
}

interface ReturnedArgs {
  assetId: string
  assetTag: string
  employeeId: string
  conditionIn: string
  actorUserId: string | null
}

export function assetReturnedEvent(args: ReturnedArgs): EventInput {
  return {
    type: "asset.returned",
    severity: args.conditionIn === "DAMAGED" ? "WARNING" : "SUCCESS",
    actorUserId: args.actorUserId,
    entity: "ASSET",
    entityId: args.assetId,
    subjectEmployeeId: args.employeeId,
    targetRoles: ["HR_ADMIN"],
    title: "Asset returned",
    meta: `${args.assetTag} · returned ${args.conditionIn.toLowerCase()}`,
    href: "/assets",
    payload: { assetTag: args.assetTag, conditionIn: args.conditionIn },
  }
}

type RequestStage = "submitted" | "approved" | "rejected"

const REQUEST_COPY: Record<RequestStage, { title: string; severity: EventInput["severity"] }> = {
  submitted: { title: "Asset request submitted", severity: "INFO" },
  approved: { title: "Asset request approved", severity: "SUCCESS" },
  rejected: { title: "Asset request rejected", severity: "WARNING" },
}

interface RequestArgs {
  stage: RequestStage
  requestId: string
  employeeId: string
  subject: string
  actorUserId: string | null
  note: string | null
}

export function assetRequestEvent(args: RequestArgs): EventInput {
  const copy = REQUEST_COPY[args.stage]
  return {
    type: `asset.request.${args.stage}` as EventInput["type"],
    severity: copy.severity,
    actorUserId: args.actorUserId,
    entity: "ASSET_REQUEST",
    entityId: args.requestId,
    subjectEmployeeId: args.employeeId,
    targetRoles: ["HR_ADMIN"],
    title: copy.title,
    meta: [args.subject, args.note].filter(Boolean).join(" · "),
    href: "/assets",
    payload: { stage: args.stage, subject: args.subject, note: args.note },
  }
}

interface LifecycleArgs {
  stage: "retired" | "marked_lost"
  assetId: string
  assetTag: string
  assetName: string
  note: string
  actorUserId: string | null
}

export function assetLifecycleEvent(args: LifecycleArgs): EventInput {
  const retired = args.stage === "retired"
  return {
    type: retired ? "asset.retired" : "asset.marked_lost",
    severity: retired ? "INFO" : "WARNING",
    actorUserId: args.actorUserId,
    entity: "ASSET",
    entityId: args.assetId,
    // No subject employee: this is a decision about a thing, not about a
    // person, even when somebody was holding it.
    managerEmployeeId: null,
    targetRoles: ["HR_ADMIN", "FINANCE_OFFICER"],
    title: retired ? "Asset retired" : "Asset marked lost",
    meta: `${args.assetTag} · ${args.assetName} · ${args.note}`,
    href: "/assets",
    payload: { assetTag: args.assetTag, note: args.note },
  }
}

interface ImportedArgs {
  assetCount: number
  assignmentCount: number
  actorUserId: string | null
}

export function assetImportedEvent(args: ImportedArgs): EventInput {
  return {
    type: "asset.imported",
    severity: "SUCCESS",
    actorUserId: args.actorUserId,
    entity: "ASSET",
    // The import itself has no single row to point at. "IMPORT" is a stable
    // sentinel rather than an id, so the feed row still groups correctly.
    entityId: "IMPORT",
    managerEmployeeId: null,
    targetRoles: ["HR_ADMIN"],
    title: "Asset register imported",
    // One event, never one per row. 142 feed lines would bury every real
    // notification — the rule stated in event.types.ts:1-10.
    meta: `${args.assetCount} assets · ${args.assignmentCount} with open custody`,
    payload: { assetCount: args.assetCount, assignmentCount: args.assignmentCount },
    href: "/assets",
  }
}

interface RecoveryCollectedArgs {
  recoveryId: string
  assetId: string
  assetTag: string
  employeeId: string
  amount: string
  currency: string
  actorUserId: string | null
}

/** Emitted by the sweep, one per recovery. A deduction from somebody's pay is
 *  a separate fact for each person and each of them needs telling. */
export function assetRecoveryCollectedEvent(args: RecoveryCollectedArgs): EventInput {
  return {
    type: "asset.recovery.collected",
    severity: "WARNING",
    actorUserId: args.actorUserId,
    entity: "ASSET_RECOVERY",
    entityId: args.recoveryId,
    subjectEmployeeId: args.employeeId,
    targetRoles: ["HR_ADMIN"],
    title: "Asset recovery collected",
    meta: `${args.assetTag} · ${args.amount} ${args.currency}`,
    href: "/assets",
    payload: { assetTag: args.assetTag, amount: args.amount, currency: args.currency },
  }
}
