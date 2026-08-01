/**
 * How a leave request reads in a feed.
 *
 * The strings are frozen at emit rather than rendered at read, so a feed
 * entry keeps saying what it said even after the leave type is renamed or
 * the request is deleted. That is the point of a log.
 *
 * Leave has **no audit table**, which makes it the cleanest demonstration
 * that an event is not an audit row: nothing here is a change record, it is
 * a notice that something happened to somebody.
 */

import type { EventInput, EventType } from "../event/event.types"
import { formatDateOnly } from "./leave.dates"

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** "Aug 10 – Aug 14", or just "Aug 10" for a single day. */
export function formatLeaveRange(start: Date, end: Date): string {
  const day = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  return start.getTime() === end.getTime() ? day(start) : `${day(start)} – ${day(end)}`
}

/**
 * "Casual leave approved" — but "Leave Without Pay approved", because a type
 * whose name already contains the word does not need it twice.
 */
export function leaveEventTitle(leaveTypeName: string, verb: string): string {
  const noun = /leave/i.test(leaveTypeName) ? leaveTypeName : `${leaveTypeName} leave`
  return `${noun} ${verb}`
}

interface LeaveEventArgs {
  type: EventType
  verb: string
  severity?: EventInput["severity"]
  actorUserId: string | null
  request: { id: string; startDate: Date; endDate: Date; status: string }
  leaveType: { code: string; name: string }
  employee: { id: string; fullName: string }
  days: number
}

export function leaveEvent(args: LeaveEventArgs): EventInput {
  return {
    type: args.type,
    severity: args.severity ?? "INFO",
    actorUserId: args.actorUserId,
    entity: "LEAVE_REQUEST",
    entityId: args.request.id,
    subjectEmployeeId: args.employee.id,
    // HR sees the whole company's leave traffic; the manager comes from the
    // subject's reporting line, resolved inside the transaction by emitEvent.
    targetRoles: ["HR_ADMIN"],
    title: leaveEventTitle(args.leaveType.name, args.verb),
    // The name is here rather than in the title because the same row is read
    // by the employee, their manager and HR — and a manager's feed of five
    // identical "Casual leave requested" lines is useless without it.
    meta: `${args.employee.fullName} · ${formatLeaveRange(args.request.startDate, args.request.endDate)} · ${args.days} day${args.days === 1 ? "" : "s"}`,
    href: "/leave",
    payload: {
      leaveTypeCode: args.leaveType.code,
      startDate: formatDateOnly(args.request.startDate),
      endDate: formatDateOnly(args.request.endDate),
      days: args.days,
      status: args.request.status,
    },
  }
}
