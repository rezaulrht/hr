/**
 * Date-only helpers for leave. Every date in this module is a calendar date
 * pinned to UTC midnight, never an instant — so day counts can't drift with
 * server locale, and a date the user picked never shifts by one.
 */

/** Friday. Compared against getUTCDay(). The weekly non-working day. */
export const WEEKLY_OFF_DAY = 5

/** How far back a backdating-enabled leave type may be filed. */
export const MAX_BACKDATE_DAYS = 30

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

export function parseDateOnly(value: string): Date {
  if (!DATE_ONLY.test(value)) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${value}"`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || formatDateOnly(date) !== value) {
    throw new Error(`"${value}" is not a valid calendar date`)
  }
  return date
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Today, as a UTC-midnight calendar date. */
export function todayUtc(): Date {
  return parseDateOnly(formatDateOnly(new Date()))
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

/** Inclusive calendar-day span, ignoring which days are working days. */
export function calendarSpan(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1
}

/**
 * Charged leave days: every date in [start, end] that isn't the weekly off
 * day. Thu-to-Sat is 2, not 3. A range landing entirely on Fridays is 0,
 * which callers must reject.
 */
export function countLeaveDays(start: Date, end: Date): number {
  let count = 0
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    if (d.getUTCDay() !== WEEKLY_OFF_DAY) count++
  }
  return count
}
