/**
 * Earned-leave accrual (§117).
 *
 * "One day for every eighteen days of work performed by him during the
 * previous period of twelve months" — so the number is bought with days
 * *actually worked*, not with days on the payroll. That is why this module
 * could not exist before attendance did.
 *
 * The source is the attendance day grid rather than the `Attendance` table.
 * Status there is derived on read, so approving last Tuesday's sick leave
 * re-labels that day ON_LEAVE and it stops counting as worked, with no
 * backfill and no window in which the accrual is quietly wrong. Reading the
 * raw rows would miss every one of those corrections.
 */

import type { Employee } from "../../generated/prisma/client"
import { buildDayGrid, goLiveDate } from "../attendance/attendance.grid"
import { addDays, formatDateOnly } from "../../utils/dates"
import { EARNED_LEAVE_DAYS_PER_DAY } from "./leave.policy"

/** The employee fields the accrual needs — a superset of the day grid's. */
export type AccrualEmployee = Pick<
  Employee,
  "id" | "joiningDate" | "employmentStatus" | "shiftId"
>

export interface EarnedAccrual {
  /** Days accrued: floor(daysWorked / 18), capped at the ceiling. */
  days: number
  daysWorked: number
  /** Inclusive window the days were counted over, as YYYY-MM-DD. */
  windowStart: string
  windowEnd: string
  /**
   * Days inside the window that attendance never tracked, because they fall
   * before ATTENDANCE_GO_LIVE. Reported rather than estimated: an accrual
   * padded with guessed attendance is indistinguishable from a measured one,
   * and it is the number an employee will dispute.
   */
  untrackedDays: number
  /** False until `minServiceMonths` of continuous service is complete. */
  eligible: boolean
}

/** UTC-safe month arithmetic that clamps to the end of a short month. */
export function addMonths(date: Date, months: number): Date {
  const targetDay = date.getUTCDate()
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)
  ).getUTCDate()
  shifted.setUTCDate(Math.min(targetDay, lastDay))
  return shifted
}

/** Whole months of service completed on `asOf`. A part month does not count. */
export function completedServiceMonths(joiningDate: Date, asOf: Date): number {
  let months =
    (asOf.getUTCFullYear() - joiningDate.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - joiningDate.getUTCMonth())
  if (asOf.getUTCDate() < joiningDate.getUTCDate()) months--
  return Math.max(0, months)
}

/**
 * The twelve months the accrual is measured over, ending on `asOf`.
 *
 * Rolling rather than pinned to the calendar year, because the Act says "the
 * previous period of twelve months" and not "the previous year". The trade
 * is that entitlement moves a little as the window rolls, while the `used`
 * figure it is compared against is per leave year — so a balance is a
 * snapshot, not a ledger. Materialising it into `LeaveBalance` is the fix if
 * that ever needs to be auditable per day.
 */
export function accrualWindow(asOf: Date): { from: Date; to: Date } {
  return { from: addDays(addMonths(asOf, -12), 1), to: asOf }
}

/** floor(daysWorked / 18), never above the ceiling. */
export function accruedDays(daysWorked: number, maxAccrual: number | null): number {
  const earned = Math.floor(daysWorked / EARNED_LEAVE_DAYS_PER_DAY)
  return maxAccrual === null ? earned : Math.min(earned, maxAccrual)
}

/**
 * Days the employee was actually at work in [from, to], plus how much of
 * that window attendance has no opinion about.
 *
 * PRESENT only. Leave, holidays, weekly offs and absences are all days no
 * work was performed, which is exactly what §117 measures against.
 */
export async function countDaysWorked(
  employee: AccrualEmployee,
  from: Date,
  to: Date
): Promise<{ daysWorked: number; untrackedDays: number }> {
  const grid = await buildDayGrid([employee], from, to)
  const days = grid.get(employee.id) ?? []

  const goLive = formatDateOnly(goLiveDate())
  const joined = formatDateOnly(employee.joiningDate)

  let daysWorked = 0
  let untrackedDays = 0
  for (const day of days) {
    if (day.status === "PRESENT") daysWorked++
    // Only days the person was already employed for. A window reaching back
    // before someone joined is not a gap in the records.
    else if (day.status === "NOT_TRACKED" && day.date >= joined && day.date < goLive) {
      untrackedDays++
    }
  }
  return { daysWorked, untrackedDays }
}

/**
 * Earned leave available to an employee, measured as at `asOf`.
 *
 * Returns a zero accrual with `eligible: false` before one year of service —
 * and still reports the window, so the UI can say *why* the number is zero
 * rather than showing a bare 0 next to a type the employee can see.
 */
export async function computeEarnedAccrual(
  employee: AccrualEmployee,
  asOf: Date,
  policy: { minServiceMonths: number; maxAccrual: number | null }
): Promise<EarnedAccrual> {
  const { from, to } = accrualWindow(asOf)
  const windowStart = formatDateOnly(from)
  const windowEnd = formatDateOnly(to)

  if (completedServiceMonths(employee.joiningDate, asOf) < policy.minServiceMonths) {
    return {
      days: 0,
      daysWorked: 0,
      windowStart,
      windowEnd,
      untrackedDays: 0,
      eligible: false,
    }
  }

  const { daysWorked, untrackedDays } = await countDaysWorked(employee, from, to)
  return {
    days: accruedDays(daysWorked, policy.maxAccrual),
    daysWorked,
    windowStart,
    windowEnd,
    untrackedDays,
    eligible: true,
  }
}
