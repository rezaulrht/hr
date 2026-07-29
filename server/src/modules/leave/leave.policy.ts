/**
 * The statutory leave catalogue: Bangladesh Labour Act 2006, as amended.
 *
 * This file is the only place the Act's numbers appear. The seed writes them
 * into `LeaveType` rows and the service reads the rows back — nothing reads
 * these constants at request time, so HR can adjust a quota upward in the
 * database without a redeploy and without this file lying about the statute.
 *
 * Scope note, so the absences here read as decisions rather than oversights:
 *
 * - **Festival holidays (§118)** are not a leave type. Eid, Durga Puja and
 *   the rest are already rows in `Holiday`, and the attendance day grid
 *   resolves them to HOLIDAY for everyone with no application and no balance.
 *   Adding a "Festival" leave type would create a second, spendable copy of
 *   days people already have. The §118 consequence that is genuinely missing
 *   — work a festival holiday, get a substitute day plus two days' wages —
 *   is a payroll rule, and payroll does not exist yet.
 * - **Leave pay (§119)** — the daily average of wages and dearness allowance,
 *   excluding overtime and bonus — is likewise payroll's.
 * - **Weekly holiday (§103)** is 1.5 days per week for shop and commercial
 *   establishments. The system models a single Friday and has no half-day
 *   unit anywhere, in leave or attendance or payroll, so the half day is not
 *   represented. It cannot be fixed inside the leave module alone.
 */

import type { EmploymentType, LeaveAccrualBasis } from "../../generated/prisma/client"

/** §117: one day of earned leave for every eighteen days actually worked. */
export const EARNED_LEAVE_DAYS_PER_DAY = 18

/** §117: accumulated earned leave is capped at sixty days. */
export const EARNED_LEAVE_MAX_ACCRUAL = 60

/** §117: nothing accrues until one year of continuous service is complete. */
export const EARNED_LEAVE_MIN_SERVICE_MONTHS = 12

/** §45/§46: maternity benefit requires six months' service with the employer. */
export const MATERNITY_MIN_SERVICE_MONTHS = 6

/** §46 as amended (Nov 2025): 60 days before delivery and 60 days after. */
export const MATERNITY_DAYS = 120

const ALL_STAFF: EmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT"]
const EVERYONE: EmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]

export interface LeaveTypeDefinition {
  code: string
  name: string
  isPaid: boolean
  annualQuota: number
  carryForwardPct: number
  maxConsecutive: number | null
  allowsBackdating: boolean
  eligibleFor: EmploymentType[]
  statutory: boolean
  countsHolidays: boolean
  accrualBasis: LeaveAccrualBasis
  minServiceMonths: number
  maxAccrual: number | null
}

/**
 * Seeded on every run. Only `statutory: true` rows are rewritten in place —
 * see `seed.ts` — because a company-policy benefit that HR has tuned must
 * survive the next time somebody corrects a section number in here.
 */
export const LEAVE_TYPE_CATALOGUE: LeaveTypeDefinition[] = [
  {
    // §115. Ten days a year, and expressly not accumulable — an unused
    // casual day is gone at year end, hence carryForwardPct 0.
    code: "CASUAL",
    name: "Casual",
    isPaid: true,
    annualQuota: 10,
    carryForwardPct: 0,
    maxConsecutive: null,
    allowsBackdating: false,
    eligibleFor: ALL_STAFF,
    statutory: true,
    countsHolidays: false,
    accrualBasis: "PRO_RATED",
    minServiceMonths: 0,
    maxAccrual: null,
  },
  {
    // §116. Fourteen days a year on full wages. Backdatable for the same
    // reason it always was: you cannot schedule getting ill.
    code: "SICK",
    name: "Sick",
    isPaid: true,
    annualQuota: 14,
    carryForwardPct: 0,
    maxConsecutive: null,
    allowsBackdating: true,
    eligibleFor: ALL_STAFF,
    statutory: true,
    countsHolidays: false,
    accrualBasis: "PRO_RATED",
    minServiceMonths: 0,
    maxAccrual: null,
  },
  {
    // §117. `annualQuota` is 0 and means nothing here — the entitlement is
    // bought with days worked, so the number lives in `maxAccrual` and in
    // the accrual maths, not in a fixed quota.
    //
    // carryForwardPct is 100 because unused earned leave carries in full up
    // to the sixty-day ceiling; it is the one type the Act lets accumulate.
    code: "EARNED",
    name: "Earned",
    isPaid: true,
    annualQuota: 0,
    carryForwardPct: 100,
    maxConsecutive: null,
    allowsBackdating: false,
    eligibleFor: ALL_STAFF,
    statutory: true,
    countsHolidays: true,
    accrualBasis: "EARNED",
    minServiceMonths: EARNED_LEAVE_MIN_SERVICE_MONTHS,
    maxAccrual: EARNED_LEAVE_MAX_ACCRUAL,
  },
  {
    // §46. Granted per delivery, not per year, so PER_EVENT: a November
    // hire's maternity benefit is not pro-rated down to twenty days.
    //
    // The eligibility conditions the Act attaches — no benefit where the
    // employee already has two or more surviving children, and the 60/60
    // split anchored on the delivery date — are left to the approver's
    // judgement. `Employee` records neither a surviving-children count nor a
    // delivery date, and inventing both to enforce a rule HR already applies
    // by hand would be schema written ahead of a need.
    //
    // Known limitation: `applyForLeave` refuses a range crossing 31 December,
    // so a 120-day leave starting after early September has to be filed as
    // two requests. The balance is per leave year, which is what makes the
    // single-year rule load-bearing everywhere else.
    code: "MATERNITY",
    name: "Maternity",
    isPaid: true,
    annualQuota: MATERNITY_DAYS,
    carryForwardPct: 0,
    maxConsecutive: MATERNITY_DAYS,
    allowsBackdating: true,
    eligibleFor: ALL_STAFF,
    statutory: true,
    countsHolidays: true,
    accrualBasis: "PER_EVENT",
    minServiceMonths: MATERNITY_MIN_SERVICE_MONTHS,
    maxAccrual: null,
  },
  {
    // Not statutory — the Act has no unpaid-leave provision. It is the
    // fallback that keeps someone whose paid allowance is spent able to take
    // time off at all, so interns get it too.
    code: "LWP",
    name: "Leave Without Pay",
    isPaid: false,
    annualQuota: 0,
    carryForwardPct: 0,
    maxConsecutive: null,
    allowsBackdating: false,
    eligibleFor: EVERYONE,
    statutory: false,
    countsHolidays: false,
    accrualBasis: "NONE",
    minServiceMonths: 0,
    maxAccrual: null,
  },
  {
    // Company policy, predating the statutory rework. Kept rather than
    // deleted: it has requests filed against it, and dropping a benefit
    // already granted is not something a compliance change should do
    // silently. Non-statutory, so the seed leaves it alone from here.
    code: "PERSONAL",
    name: "Personal",
    isPaid: true,
    annualQuota: 5,
    carryForwardPct: 0,
    maxConsecutive: null,
    allowsBackdating: false,
    eligibleFor: ALL_STAFF,
    statutory: false,
    countsHolidays: false,
    accrualBasis: "PRO_RATED",
    minServiceMonths: 0,
    maxAccrual: null,
  },
]
