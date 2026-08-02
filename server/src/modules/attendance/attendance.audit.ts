/**
 * The attendance change log.
 *
 * `correctedBy` / `correctedAt` / `correctionNote` on the row hold only the
 * *most recent* edit, and the dispute that matters — "I did check in, and
 * someone changed it" — is always about the value before the change. So
 * every mutation appends here, inside the same transaction as the change
 * itself: a write that succeeds without its audit row is a bug.
 */

import type { Prisma } from "../../generated/prisma/client"

export type AuditAction =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "REGULARISE"
  | "CORRECT"
  | "APPROVE"
  | "REJECT"
  // A leave approval or revert changed what the day expected, so the frozen
  // punch flags were re-judged. Nobody touched the record by hand, which is
  // exactly why it needs an audit row.
  | "LEAVE_RECOMPUTE"

export interface AuditEntry {
  attendanceId: string
  action: AuditAction
  /** User id of whoever performed the action. */
  changedBy?: string | null
  /** Only the fields that changed, not whole snapshots. */
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
  note?: string | null
}

export function auditAttendance(tx: Prisma.TransactionClient, entry: AuditEntry) {
  return tx.attendanceAudit.create({
    data: {
      attendanceId: entry.attendanceId,
      action: entry.action,
      changedBy: entry.changedBy ?? null,
      before: entry.before,
      after: entry.after,
      note: entry.note ?? null,
    },
  })
}

export async function listAudits(attendanceId: string, tx: Prisma.TransactionClient) {
  return tx.attendanceAudit.findMany({
    where: { attendanceId },
    orderBy: { changedAt: "asc" },
  })
}
