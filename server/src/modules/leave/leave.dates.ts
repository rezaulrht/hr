/**
 * Date rules for leave policy. Every date here is a calendar date pinned to
 * UTC midnight, never an instant — so day counts can't drift with server
 * locale, and a date the user picked never shifts by one.
 *
 * The generic date-only arithmetic moved to `src/utils/dates.ts` so the
 * attendance module can use it without importing from leave. It is
 * re-exported below, so every existing call site here keeps working.
 */

import { MS_PER_DAY, addDays, formatDateOnly, parseDateOnly } from "../../utils/dates"

export { addDays, formatDateOnly, parseDateOnly }

/** Friday. Compared against getUTCDay(). The weekly non-working day. */
export const WEEKLY_OFF_DAY = 5

/** How far back a backdating-enabled leave type may be filed. */
export const MAX_BACKDATE_DAYS = 30

/** Today, as a UTC-midnight calendar date. */
export function todayUtc(): Date {
  return parseDateOnly(formatDateOnly(new Date()))
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
