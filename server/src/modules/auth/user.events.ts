/**
 * A change of role, as a feed entry.
 *
 * This is the only notice the person receives. A promotion previously changed
 * one column and told nobody: no event, no audit row, no email — while
 * `createStaffAccount` right next door emits `employee.joined` *and* sends
 * credentials. The asymmetry was not deliberate; `setUserRole` carried an
 * unused `_actorUserId` with a comment saying an audit row could be added
 * later.
 *
 * The `Event` row is that record. Nothing writes to `AuditLog` for this,
 * deliberately: the event already stores the actor, the subject and the
 * before/after in `payload`, and two records of one fact can disagree.
 *
 * **No `href`.** Every other event points somewhere useful for all of its
 * readers, because `href` is role-agnostic and prefixed by the client with the
 * reader's own route group. This one has no such destination — HR wants
 * `/users`, which does not exist under `/employee`, and the subject wants a
 * dashboard they cannot reach until their token catches up. A link that 404s
 * for half the audience is worse than no link.
 */

import type { Role } from "../../generated/prisma/client"
import type { EventInput } from "../event/event.types"

/**
 * Ranked only where the ranking is real.
 *
 * `HR_ADMIN` and `FINANCE_OFFICER` are peers: neither contains the other, and
 * inventing an order between them would make one of the two directions a
 * "promotion" that silently keeps privileges it should drop. Equal rank means
 * *not* a promotion, which is the safe reading.
 */
const TIER: Record<Role, number> = {
  EMPLOYEE: 0,
  REPORTING_MANAGER: 1,
  HR_ADMIN: 2,
  FINANCE_OFFICER: 2,
  SUPER_ADMIN: 3,
}

/**
 * Whether the move strictly adds authority and takes nothing away.
 *
 * Only a strict rank increase qualifies. Everything else — down a tier, or
 * sideways between the two peers — removes something the old access token
 * still grants, which is what decides whether the session is cut short.
 */
export function isPromotion(from: Role, to: Role): boolean {
  return TIER[to] > TIER[from]
}

/** How a role is written when a person reads it, not when a column stores it. */
export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  FINANCE_OFFICER: "Finance Officer",
  REPORTING_MANAGER: "Reporting Manager",
  EMPLOYEE: "Employee",
}

/**
 * Spelled out rather than derived. The vowel rule gets `HR Admin` wrong — the
 * article follows how the letter is *said* ("an aitch-are"), not how it is
 * spelled — and a rule that is wrong for one of five values is worse than a
 * table of five.
 */
const WITH_ARTICLE: Record<Role, string> = {
  SUPER_ADMIN: "a Super Admin",
  HR_ADMIN: "an HR Admin",
  FINANCE_OFFICER: "a Finance Officer",
  REPORTING_MANAGER: "a Reporting Manager",
  EMPLOYEE: "an Employee",
}

interface RoleChangedArgs {
  targetUserId: string
  /**
   * Null for an administrative account, which has no Employee row. Those
   * accounts cannot be individually addressed by the event log — its audience
   * rules are written in terms of employees — so the row reaches them only
   * through `targetRoles`. Acceptable: the roles without an Employee record
   * are the administrative ones, who are in that audience anyway.
   */
  subjectEmployeeId: string | null
  /** Their name, or the login email when there is no employee record to name. */
  displayName: string
  from: Role
  to: Role
  actorUserId: string
}

export function roleChangedEvent(args: RoleChangedArgs): EventInput {
  const promoted = isPromotion(args.from, args.to)

  return {
    type: "user.role_changed",
    // A demotion is not a failure, but it removes access and someone should be
    // able to find it in a month of INFO rows. WARNING is what the severity
    // filter exists for.
    severity: promoted ? "SUCCESS" : "WARNING",
    actorUserId: args.actorUserId,
    entity: "USER",
    entityId: args.targetUserId,
    subjectEmployeeId: args.subjectEmployeeId,
    targetRoles: ["HR_ADMIN", "SUPER_ADMIN"],
    title: `${args.displayName} is now ${WITH_ARTICLE[args.to]}`,
    meta: `Was ${ROLE_LABEL[args.from]}`,
    payload: { from: args.from, to: args.to },
  }
}
