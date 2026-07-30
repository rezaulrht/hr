/**
 * The Bangladesh Labour Act's exit numbers, in one file.
 *
 * Mirrors `leave.policy.ts` exactly: the Act's figures appear once, and the
 * service reads a table rather than a chain of conditionals. A correction to
 * the statute is then a change to one file.
 *
 * ⚠️ These figures need verifying against the current amended Act before
 * anyone relies on them. The leave rework already showed why: the November
 * 2025 amendment moved maternity from 112 to 120 days. They are isolated
 * here precisely so a correction stays a one-file change.
 *
 * What this file must NOT do is arbitrate contested cases. Whether a
 * particular dismissal forfeits gratuity is a legal judgement about conduct,
 * not arithmetic. The table encodes the ordinary reading; Finance can
 * override a computed head before approval, audited.
 */

import type { ExitReason } from "../../generated/prisma/client"

/** §2(10): 30 days' wages per completed year of service. */
export const GRATUITY_DAYS_PER_YEAR = 30
/** §2(10): 45 days where service exceeds ten years. */
export const GRATUITY_DAYS_PER_YEAR_AFTER_10 = 45
export const GRATUITY_LONG_SERVICE_YEARS = 10

/** A month of wages is treated as 30 days throughout, matching §2(10). */
export const DAYS_PER_MONTH = 30

export interface ExitPolicy {
  gratuityEligible: boolean
  /** Completed years of continuous service before gratuity is payable. */
  minServiceYears: number
  /** §26 — employer terminates. */
  noticeDaysByEmployer: number
  /** §27 — the worker resigns. */
  noticeDaysByWorker: number
  label: string
}

export const EXIT_POLICIES: Record<ExitReason, ExitPolicy> = {
  RESIGNATION: {
    gratuityEligible: true,
    minServiceYears: 1,
    noticeDaysByEmployer: 0,
    noticeDaysByWorker: 60,
    label: "Resignation (§27)",
  },
  RETIREMENT: {
    gratuityEligible: true,
    minServiceYears: 1,
    noticeDaysByEmployer: 0,
    noticeDaysByWorker: 0,
    label: "Retirement (§28)",
  },
  TERMINATION: {
    gratuityEligible: true,
    minServiceYears: 1,
    noticeDaysByEmployer: 120,
    noticeDaysByWorker: 0,
    label: "Termination by employer (§26)",
  },
  DISMISSAL: {
    // §23 — misconduct. The ordinary reading forfeits gratuity, but this is
    // exactly the contested case Finance may override with a reason.
    gratuityEligible: false,
    minServiceYears: 1,
    noticeDaysByEmployer: 0,
    noticeDaysByWorker: 0,
    label: "Dismissal for misconduct (§23)",
  },
  DISCHARGE: {
    gratuityEligible: true,
    minServiceYears: 1,
    noticeDaysByEmployer: 0,
    noticeDaysByWorker: 0,
    label: "Discharge on health grounds (§22)",
  },
  RETRENCHMENT: {
    gratuityEligible: true,
    minServiceYears: 1,
    noticeDaysByEmployer: 30,
    noticeDaysByWorker: 0,
    label: "Retrenchment (§20)",
  },
  CONTRACT_END: {
    gratuityEligible: true,
    minServiceYears: 1,
    noticeDaysByEmployer: 0,
    noticeDaysByWorker: 0,
    label: "Fixed-term contract expiry",
  },
  DEATH: {
    gratuityEligible: true,
    minServiceYears: 1,
    noticeDaysByEmployer: 0,
    noticeDaysByWorker: 0,
    label: "Death in service",
  },
}

/** §2(10): 30 days per completed year, 45 once service exceeds ten years. */
export function gratuityDaysPerYear(completedYears: number): number {
  return completedYears > GRATUITY_LONG_SERVICE_YEARS
    ? GRATUITY_DAYS_PER_YEAR_AFTER_10
    : GRATUITY_DAYS_PER_YEAR
}

/** Which side owed notice, and therefore whose figure applies. */
export function noticeDaysFor(reason: ExitReason): number {
  const policy = EXIT_POLICIES[reason]
  return Math.max(policy.noticeDaysByEmployer, policy.noticeDaysByWorker)
}
