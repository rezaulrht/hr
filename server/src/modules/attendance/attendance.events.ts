/**
 * How an attendance change reads in a feed.
 *
 * **This is the module the whole event/audit separation exists for.**
 * `decideOne` writes one `AttendanceAudit` row per record, which is correct:
 * an audit trail has to answer "who decided this specific day". Bulk
 * approving a fortnight for sixteen people is therefore 160 audit rows — and
 * exactly **one** event, because it was one thing a person did, and 160
 * notifications for it would train everyone to ignore the feed.
 *
 * No post-hoc de-duplication rule can recover that distinction, because it
 * would have to guess at intent from timestamps and actors. The emitting code
 * already knows. So `auditAttendance` and `emitEvent` are called from
 * different places on purpose, and neither replaces the other.
 */

import { formatShortDate } from "../../utils/dates"
import type { EventInput } from "../event/event.types"

interface DecidedArgs {
  attendanceId: string
  decision: "APPROVE" | "REJECT"
  actorUserId: string
  employee: { id: string; fullName: string }
  date: Date
  note?: string | null
}

export function attendanceDecidedEvent(args: DecidedArgs): EventInput {
  const approved = args.decision === "APPROVE"
  return {
    type: "attendance.decided",
    severity: approved ? "SUCCESS" : "WARNING",
    actorUserId: args.actorUserId,
    entity: "ATTENDANCE",
    entityId: args.attendanceId,
    subjectEmployeeId: args.employee.id,
    targetRoles: ["HR_ADMIN"],
    title: `Attendance ${approved ? "approved" : "rejected"}`,
    meta: `${args.employee.fullName} · ${formatShortDate(args.date)}`,
    href: "/attendance",
    payload: {
      decision: args.decision,
      date: args.date.toISOString().slice(0, 10),
      note: args.note ?? null,
    },
  }
}

interface BulkArgs {
  attendanceIds: string[]
  decision: "APPROVE" | "REJECT"
  actorUserId: string
  /**
   * The acting manager's own employee id, so the batch lands in their feed.
   * Passed explicitly because a bulk decision has **no single subject** —
   * there is nobody for `emitEvent` to resolve a reporting line from.
   */
  actorEmployeeId: string | null
}

/**
 * One event for the whole batch, whatever its size.
 *
 * `payload.attendanceIds` keeps the detail recoverable without the detail
 * being N feed rows — the batch can be reconstructed exactly, it just is not
 * announced N times.
 */
export function attendanceBulkDecidedEvent(args: BulkArgs): EventInput {
  const count = args.attendanceIds.length
  const verb = args.decision === "APPROVE" ? "Approved" : "Rejected"
  return {
    type: "attendance.bulk_decided",
    severity: args.decision === "APPROVE" ? "SUCCESS" : "WARNING",
    actorUserId: args.actorUserId,
    entity: "ATTENDANCE",
    // The batch has no id of its own, so it is filed under the first record
    // it touched. `payload.attendanceIds` is the authoritative list.
    entityId: args.attendanceIds[0],
    managerEmployeeId: args.actorEmployeeId,
    targetRoles: ["HR_ADMIN"],
    title: `${verb} ${count} attendance record${count === 1 ? "" : "s"}`,
    href: "/attendance",
    payload: {
      count,
      decision: args.decision,
      attendanceIds: args.attendanceIds,
    },
  }
}

interface CorrectionArgs {
  attendanceId: string
  actorUserId: string
  employee: { id: string; fullName: string }
  date: Date
  note?: string | null
}

/** HR editing, or creating, somebody else's record. */
export function attendanceCorrectedEvent(args: CorrectionArgs): EventInput {
  return {
    type: "attendance.corrected",
    severity: "INFO",
    actorUserId: args.actorUserId,
    entity: "ATTENDANCE",
    entityId: args.attendanceId,
    // The subject is included so the employee learns their record was
    // changed by someone else. A correction they are never told about is
    // exactly the kind an employee should be able to query.
    subjectEmployeeId: args.employee.id,
    targetRoles: ["HR_ADMIN"],
    title: "Attendance corrected by HR",
    meta: `${args.employee.fullName} · ${formatShortDate(args.date)}`,
    href: "/attendance",
    payload: { date: args.date.toISOString().slice(0, 10), note: args.note ?? null },
  }
}

/** The employee amending their own day, which is why HR is in the audience. */
export function attendanceRegularisedEvent(args: CorrectionArgs): EventInput {
  return {
    type: "attendance.regularised",
    severity: "WARNING",
    actorUserId: args.actorUserId,
    entity: "ATTENDANCE",
    entityId: args.attendanceId,
    // Subject carries the manager resolution as well as the confirmation.
    // The point of the event is that the time came from the person it
    // benefits, so the approver has to see it before signing it off.
    subjectEmployeeId: args.employee.id,
    targetRoles: ["HR_ADMIN"],
    title: "Attendance amended, awaiting approval",
    meta: `${args.employee.fullName} · ${formatShortDate(args.date)}`,
    href: "/attendance",
    payload: { date: args.date.toISOString().slice(0, 10), note: args.note ?? null },
  }
}

interface AutoClosedArgs {
  attendanceId: string
  employeeId: string
  /** "2026-08-18" — the day that was closed, not the day it was closed on. */
  date: string
  /** "18:00", the shift end the guess was taken from. */
  closedAt: string
}

/**
 * The day the job closed, told to the person whose day it was.
 *
 * The employee is the entire audience. Their approver already sees it through
 * the AUTO_CHECK_OUT exception on the queue, and HR does not need a
 * notification per forgotten punch — that is what the digest is for.
 *
 * `actorUserId` is null: the system did this, and naming a user would
 * attribute a decision nobody made.
 *
 * WARNING rather than INFO. Nothing failed, but a time was written that
 * nobody witnessed, and it is on the employee to contest it — which is
 * exactly the kind of row the severity filter exists to surface.
 */
export function attendanceAutoClosedEvent(args: AutoClosedArgs): EventInput {
  return {
    type: "attendance.auto_closed",
    severity: "WARNING",
    actorUserId: null,
    entity: "ATTENDANCE",
    entityId: args.attendanceId,
    subjectEmployeeId: args.employeeId,
    // No manager audience: `emitEvent` resolves one from the subject unless
    // told otherwise, and a reporting line does not need telling that someone
    // forgot to tap a button.
    managerEmployeeId: null,
    title: "You didn't check out",
    meta: `${args.date} · closed at ${args.closedAt}`,
    href: "/attendance",
    payload: { date: args.date, closedAt: args.closedAt },
  }
}
