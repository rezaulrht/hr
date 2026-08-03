/**
 * The single implementation of both employee access matrices.
 *
 * Everything that reads or writes an employee goes through this file: the list
 * endpoint, the detail endpoint, the edit endpoint, My Profile, the details
 * page, the directory and the document endpoints. The alternative — role
 * checks written at each call site — is how two copies of the same rule end up
 * disagreeing about whether Finance may see a national ID.
 */

import type { AccessTokenPayload } from "../auth/auth.types"

export type Tier = "SELF" | "FULL" | "FINANCE" | "MANAGER" | "COLLEAGUE"

export interface TierSubject {
  userId: string
  reportingManagerId: string | null
}

/**
 * Resolved in order; the first match wins.
 *
 * SELF is checked first so a reporting manager viewing their own record gets
 * the full self view rather than the narrower MANAGER one.
 *
 * COLLEAGUE is the floor, not a denial: every authenticated user may see every
 * other user's work identity. That is what a staff directory is.
 */
export function visibilityTierFor(
  viewer: AccessTokenPayload,
  subject: TierSubject,
  viewerEmployeeId: string | null
): Tier {
  if (subject.userId === viewer.sub) return "SELF"
  if (viewer.role === "SUPER_ADMIN" || viewer.role === "HR_ADMIN") return "FULL"
  if (viewer.role === "FINANCE_OFFICER") return "FINANCE"
  if (
    viewer.role === "REPORTING_MANAGER" &&
    viewerEmployeeId !== null &&
    subject.reportingManagerId === viewerEmployeeId
  ) {
    return "MANAGER"
  }
  return "COLLEAGUE"
}

/**
 * The facts the employee is the authority on.
 *
 * `permanentAddress` is deliberately absent: it is the legal address of
 * record, it appears on the employment contract, and it is where legal notices
 * are served, so it changes with document proof through HR. `presentAddress`
 * is where you currently live and changes when you move flats.
 *
 * Bank fields are absent too. Self-service bank editing is the classic
 * payroll-diversion vector — a compromised login redirects that person's
 * salary and the change looks legitimate because it came from the right
 * account.
 */
export const SELF_EDITABLE_FIELDS = [
  "phone",
  "presentAddress",
  "emergencyContact",
  "maritalStatus",
  "bloodGroup",
] as const

export const HR_ONLY_EDITABLE_FIELDS = [
  "fullName",
  "dateOfBirth",
  "gender",
  "nationalId",
  "permanentAddress",
  "designation",
  "departmentId",
  "reportingManagerId",
  "employmentType",
  "joiningDate",
  "officeLocation",
  "shiftId",
  "deviceUserId",
  "bankAccountNumber",
  "bankName",
  "bankRoutingNumber",
] as const

const SELF_SET: ReadonlySet<string> = new Set(SELF_EDITABLE_FIELDS)
const FULL_SET: ReadonlySet<string> = new Set([
  ...SELF_EDITABLE_FIELDS,
  ...HR_ONLY_EDITABLE_FIELDS,
])
const EMPTY_SET: ReadonlySet<string> = new Set()

export function writableFieldsFor(tier: Tier): ReadonlySet<string> {
  if (tier === "FULL") return FULL_SET
  if (tier === "SELF") return SELF_SET
  return EMPTY_SET
}
