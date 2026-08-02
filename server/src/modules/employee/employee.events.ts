/**
 * Joining and leaving, as feed entries.
 *
 * Both are targeted at HR and the Super Admin. The subject is set as well, so
 * the new joiner's manager learns they have a report — `emitEvent` resolves
 * the reporting line from the subject, which for a joiner is exactly right.
 *
 * An exit carries the reason but never the settlement figure. The reason is
 * operationally necessary — a dismissal and a resignation start different
 * processes — and the money belongs to the settlement events.
 */

import type { EventInput } from "../event/event.types"

interface JoinedArgs {
  employeeId: string
  fullName: string
  designation: string
  employeeCode: string
  actorUserId: string | null
}

export function employeeJoinedEvent(args: JoinedArgs): EventInput {
  return {
    type: "employee.joined",
    severity: "SUCCESS",
    actorUserId: args.actorUserId,
    entity: "EMPLOYEE",
    entityId: args.employeeId,
    subjectEmployeeId: args.employeeId,
    targetRoles: ["HR_ADMIN", "SUPER_ADMIN"],
    title: `${args.fullName} joined`,
    meta: `${args.designation} · ${args.employeeCode}`,
    href: "/employees",
    payload: { employeeCode: args.employeeCode, designation: args.designation },
  }
}

interface ExitedArgs {
  employeeId: string
  fullName: string
  exitReason: string
  lastWorkingDay: string
  actorUserId: string
}

export function employeeExitedEvent(args: ExitedArgs): EventInput {
  return {
    type: "employee.exited",
    severity: "WARNING",
    actorUserId: args.actorUserId,
    entity: "EMPLOYEE",
    entityId: args.employeeId,
    subjectEmployeeId: args.employeeId,
    targetRoles: ["HR_ADMIN", "SUPER_ADMIN"],
    title: `${args.fullName} is leaving`,
    meta: `${args.exitReason} · last day ${args.lastWorkingDay}`,
    href: "/employees",
    payload: { exitReason: args.exitReason, lastWorkingDay: args.lastWorkingDay },
  }
}
