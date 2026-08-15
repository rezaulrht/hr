/**
 * Full and final settlement arithmetic. Pure — no Prisma, no Express.
 */

import { computePayslip } from "../payroll/payroll.calc"
import { dec, type Money, round2, sum } from "../payroll/payroll.money"
import type { ComponentInput } from "../payroll/payroll.types"
import type { ExitReason } from "../../generated/prisma/client"
import {
  DAYS_PER_MONTH,
  EXIT_POLICIES,
  gratuityDaysPerYear,
  noticeDaysFor,
} from "./settlement.policy"

const MS_PER_DAY = 86_400_000

/**
 * Completed years of continuous service, to 2dp.
 *
 * Calendar-anniversary based, not day-count based: somebody who joined on 6
 * January 2020 and leaves on 5 January 2026 has served five years, not
 * 5.997 — and gratuity turns on *completed* years, so the distinction is
 * money.
 */
/**
 * Completed years of continuous service, as an integer.
 *
 * **Counted independently, never floored from the rounded `serviceYears`
 * figure.** Somebody who joined on 6 January 2020 and left on 5 January 2026
 * has served 5.997 years, which rounds to 6.00 for storage — flooring *that*
 * would credit a sixth year they did not complete, and §2(10) multiplies
 * gratuity by exactly this number.
 */
export function completedServiceYears(joiningDate: Date, lastWorkingDay: Date): number {
  if (lastWorkingDay.getTime() < joiningDate.getTime()) return 0

  let years = lastWorkingDay.getUTCFullYear() - joiningDate.getUTCFullYear()
  const anniversary = new Date(
    Date.UTC(
      joiningDate.getUTCFullYear() + years,
      joiningDate.getUTCMonth(),
      joiningDate.getUTCDate()
    )
  )
  if (anniversary.getTime() > lastWorkingDay.getTime()) years -= 1
  return Math.max(0, years)
}

/**
 * Service to 2dp, for the stored `serviceYears` column and for display.
 * Not the gratuity multiplier — see `completedServiceYears`.
 */
export function serviceYears(joiningDate: Date, lastWorkingDay: Date): Money {
  if (lastWorkingDay.getTime() < joiningDate.getTime()) return dec(0)

  const years = completedServiceYears(joiningDate, lastWorkingDay)

  const lastAnniversary = new Date(
    Date.UTC(
      joiningDate.getUTCFullYear() + years,
      joiningDate.getUTCMonth(),
      joiningDate.getUTCDate()
    )
  )
  const nextAnniversary = new Date(
    Date.UTC(
      joiningDate.getUTCFullYear() + years + 1,
      joiningDate.getUTCMonth(),
      joiningDate.getUTCDate()
    )
  )
  const spanDays = (nextAnniversary.getTime() - lastAnniversary.getTime()) / MS_PER_DAY
  const elapsedDays = (lastWorkingDay.getTime() - lastAnniversary.getTime()) / MS_PER_DAY

  return round2(dec(years).plus(dec(elapsedDays).dividedBy(spanDays)))
}


/**
 * The §2(10) gratuity base and the §119 leave-pay base: the sum of
 * `countsAsWages` earnings at a full month. This is what that flag exists
 * for, and its second consumer.
 */
export function wagesBase(basic: Money, components: Array<ComponentInput & { countsAsWages: boolean }>): Money {
  const earnings = components
    .filter((c) => c.kind === "EARNING" && c.countsAsWages)
    .map((c) => (c.calc === "PERCENT_OF_BASIC" ? round2(basic.times(c.value).dividedBy(100)) : round2(c.value)))
  return sum([basic, ...earnings])
}

export interface GratuityWorking {
  eligible: boolean
  wagesBase: string
  daysPerYear: number
  completedYears: number
  amount: Money
  reason: string
}

/**
 * `wagesBase × daysPerYear/30 × completedYears`.
 *
 * Returns its working, not just a number: a settlement is disputed far more
 * often than a payslip, and "30 days × 4 years on wages of 78,000" is
 * answerable where a bare figure is not.
 */
export function computeGratuity(
  base: Money,
  /** Completed years as an integer — from `completedServiceYears`, never a
   *  floored rounding of the 2dp display figure. */
  completed: number,
  reason: ExitReason
): GratuityWorking {
  const policy = EXIT_POLICIES[reason]
  const daysPerYear = gratuityDaysPerYear(completed)

  if (!policy.gratuityEligible) {
    return {
      eligible: false,
      wagesBase: base.toFixed(2),
      daysPerYear,
      completedYears: completed,
      amount: dec(0),
      reason: `${policy.label} does not ordinarily carry gratuity`,
    }
  }
  if (completed < policy.minServiceYears) {
    return {
      eligible: false,
      wagesBase: base.toFixed(2),
      daysPerYear,
      completedYears: completed,
      amount: dec(0),
      reason: `Gratuity needs ${policy.minServiceYears} completed year(s) of service; this is ${completed}`,
    }
  }

  return {
    eligible: true,
    wagesBase: base.toFixed(2),
    daysPerYear,
    completedYears: completed,
    amount: round2(base.times(daysPerYear).dividedBy(DAYS_PER_MONTH).times(completed)),
    reason: `${daysPerYear} days × ${completed} completed year(s) on wages of ${base.toFixed(2)}`,
  }
}

export interface NoticeWorking {
  days: number
  amount: Money
  reason: string
}

/** Notice pay in lieu, when the required notice was not served. */
export function computeNoticePay(
  base: Money,
  reason: ExitReason,
  noticeServed: boolean
): NoticeWorking {
  const days = noticeDaysFor(reason)
  if (noticeServed || days === 0) {
    return {
      days,
      amount: dec(0),
      reason: noticeServed ? "Notice was served" : "No notice period applies to this exit reason",
    }
  }
  return {
    days,
    amount: round2(base.times(days).dividedBy(DAYS_PER_MONTH)),
    reason: `${days} days' notice not served, at ${base.toFixed(2)} per 30 days`,
  }
}

export interface PendingSalaryInput {
  basic: Money
  components: ComponentInput[]
  /** Days in the exit month. */
  calendarDays: number
  /** 1st to lastWorkingDay inclusive. */
  daysEmployed: number
  /** Loss-of-pay days within that span. */
  lopDays: number
  workingDays: number
  present: number
  onPaidLeave: number
}

/**
 * The final partial month.
 *
 * Composes `computePayslip` rather than reimplementing it. A final partial
 * month *is* a payslip with a truncated payable-day count, and reusing it is
 * what guarantees a leaver's last month follows the same rules as everyone
 * else's. A second implementation would be the one that is wrong, and nobody
 * would find out.
 *
 * The unworked remainder of the month is expressed as loss of pay, which is
 * exactly what it is: days in the payroll month for which no salary is due.
 */
export function computePendingSalary(input: PendingSalaryInput) {
  const notEmployed = input.calendarDays - input.daysEmployed
  return computePayslip({
    basic: input.basic,
    components: input.components,
    adjustments: [],
    reimbursements: [],
    calendarDays: input.calendarDays,
    workingDays: input.workingDays,
    present: input.present,
    absent: notEmployed + input.lopDays,
    onPaidLeave: input.onPaidLeave,
    onUnpaidLeave: 0,
  })
}

export interface SettlementHeads {
  pendingSalary: Money
  gratuity: Money
  noticePay: Money
  expenseReimbursement: Money
  leaveEncashment: Money
  outstandingDeductions: Money
  assetRecoveries: Money
}

/**
 * `pendingSalary + gratuity + noticePay + expenseReimbursement +
 *  leaveEncashment − outstandingDeductions − assetRecoveries`.
 */
export function finalAmount(heads: SettlementHeads): Money {
  return round2(
    sum([
      heads.pendingSalary,
      heads.gratuity,
      heads.noticePay,
      heads.expenseReimbursement,
      heads.leaveEncashment,
    ]).minus(heads.outstandingDeductions).minus(heads.assetRecoveries)
  )
}
