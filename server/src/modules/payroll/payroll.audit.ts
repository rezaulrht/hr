/**
 * The payroll change log.
 *
 * Source spec §7 asks for this by name, settlement included. Polymorphic
 * `entity` + `entityId` rather than eight typed audit tables, because the read
 * pattern is always "what happened to this thing" or "what happened this
 * month", and neither wants a join.
 *
 * Called inside the same transaction as the change it records — a write that
 * succeeds without its audit row is a bug, matching `attendance.audit.ts`.
 */

import type { Prisma } from "../../generated/prisma/client"

export type PayrollAuditEntity =
  | "PAYROLL_RUN"
  | "PAYSLIP"
  | "SALARY_STRUCTURE"
  | "ADJUSTMENT"
  | "EXPENSE_CLAIM"
  | "SETTLEMENT"
  | "EXCHANGE_RATE"
  | "EMPLOYEE_EXIT"
  | "EMPLOYEE_SALARY_STRUCTURE"

export type PayrollAuditAction =
  | "CREATE"
  | "PROCESS"
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "DISBURSE"
  | "PAY"
  | "UPDATE"
  | "DELETE"

export interface PayrollAuditEntry {
  entity: PayrollAuditEntity
  entityId: string
  action: PayrollAuditAction
  changedBy?: string | null
  /** Only the fields that changed, not whole snapshots. */
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
  note?: string | null
}

export function auditPayroll(tx: Prisma.TransactionClient, entry: PayrollAuditEntry) {
  return tx.payrollAudit.create({
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

export function listPayrollAudits(
  entity: PayrollAuditEntity,
  entityId: string,
  tx: Prisma.TransactionClient
) {
  return tx.payrollAudit.findMany({
    where: { entity, entityId },
    orderBy: { changedAt: "asc" },
  })
}
