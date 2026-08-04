/**
 * The shared change log.
 *
 * Polymorphic `entity` + `entityId` rather than one typed audit table per
 * module, because the read pattern is always "what happened to this thing"
 * or "what happened this month", and neither wants a join.
 *
 * Called inside the same transaction as the change it records — a write that
 * succeeds without its audit row is a bug, matching `attendance.audit.ts`.
 *
 * Distinct from the event log: this is one row per *record*, `emitEvent` is
 * one row per *user action*. Bulk-approving a fortnight for sixteen people is
 * 160 audit rows and one event.
 */

import type { Prisma } from "../generated/prisma/client"

export type AuditEntity =
  | "PAYROLL_RUN"
  | "PAYSLIP"
  | "SALARY_STRUCTURE"
  | "ADJUSTMENT"
  | "EXPENSE_CLAIM"
  | "SETTLEMENT"
  | "EXCHANGE_RATE"
  | "EMPLOYEE_EXIT"
  | "EMPLOYEE_SALARY_STRUCTURE"
  | "EMPLOYEE_DOCUMENT"
  | "EMPLOYEE_PROFILE"
  | "ASSET"
  | "ASSET_CATEGORY"
  | "ASSET_ASSIGNMENT"
  | "ASSET_REQUEST"
  | "ASSET_REPAIR"

export type AuditAction =
  | "CREATE"
  | "PROCESS"
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "DISBURSE"
  | "PAY"
  | "UPDATE"
  | "DELETE"
  | "ASSIGN"
  | "ACKNOWLEDGE"
  | "RETURN"
  | "SEND_REPAIR"
  | "RECEIVE_REPAIR"
  | "RETIRE"
  | "MARK_LOST"
  | "FULFIL"
  | "IMPORT"

export interface AuditEntry {
  entity: AuditEntity
  entityId: string
  action: AuditAction
  changedBy?: string | null
  /** Only the fields that changed, not whole snapshots. */
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
  note?: string | null
}

export function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry) {
  return tx.auditLog.create({
    data: {
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      changedBy: entry.changedBy ?? null,
      before: entry.before,
      after: entry.after,
      note: entry.note ?? null,
    },
  })
}

export function listAudits(
  entity: AuditEntity,
  entityId: string,
  tx: Prisma.TransactionClient
) {
  return tx.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { changedAt: "asc" },
  })
}
