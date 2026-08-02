/**
 * Date rules for leave policy. Every date here is a calendar date pinned to
 * UTC midnight, never an instant — so day counts can't drift with server
 * locale, and a date the user picked never shifts by one.
 *
 * The generic date-only arithmetic moved to `src/utils/dates.ts` so the
 * attendance module can use it without importing from leave. It is
 * re-exported below, so every existing call site here keeps working.
 */

import type { LeaveSession } from "../../generated/prisma/client"
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
 * The gazetted calendar over some date range, indexed for day counting.
 *
 * Built from the `Holiday` table that attendance owns, so leave and the
 * attendance day grid agree about which dates are days off. Two independent
 * notions of "holiday" would drift, and the one that drifts is the one
 * payroll divides by.
 */
export interface LeaveCalendar {
  /** YYYY-MM-DD dates carrying a gazetted holiday that takes the day off. */
  holidayDates: Set<string>
  /**
   * YYYY-MM-DD dates where a WORKING_DAY order cancels the weekly off — as
   * the cabinet did on 2026-05-23 to extend Eid-ul-Azha. Without this, leave
   * would hand back a Friday that the government had already taken away.
   */
  workingOverrides: Set<string>
}

/** No holidays known. Weekly-off exclusion still applies. */
export const EMPTY_LEAVE_CALENDAR: LeaveCalendar = {
  holidayDates: new Set(),
  workingOverrides: new Set(),
}

/** True when a date is neither a working day nor chargeable as leave. */
export function isNonWorkingDay(date: Date, calendar: LeaveCalendar): boolean {
  const key = formatDateOnly(date)
  if (calendar.holidayDates.has(key)) return true
  return date.getUTCDay() === WEEKLY_OFF_DAY && !calendar.workingOverrides.has(key)
}

export interface LeaveDayCountOptions {
  /**
   * §117(3): holidays falling inside an earned-leave period are part of the
   * leave, so every calendar day in the range is charged. §115 and §116 say
   * the opposite for casual and sick — hence a per-type flag rather than one
   * rule. Defaults to false, which is the more common case and the one every
   * pre-statutory call site assumed.
   */
  countsHolidays?: boolean
  calendar?: LeaveCalendar
}

/**
 * Charged leave days in [start, end].
 *
 * For a holiday-counting type this is simply the calendar span: Thu-to-Sat
 * is 3. For every other type it is the dates that are neither the weekly off
 * nor a gazetted holiday, so the same Thu-to-Sat is 2. A non-counting range
 * landing entirely on days off is 0, which callers must reject.
 */
export function countLeaveDays(
  start: Date,
  end: Date,
  options: LeaveDayCountOptions = {}
): number {
  if (options.countsHolidays) return calendarSpan(start, end)

  const calendar = options.calendar ?? EMPTY_LEAVE_CALENDAR
  let count = 0
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    if (!isNonWorkingDay(d, calendar)) count++
  }
  return count
}

/** Which half of the boundary dates a request covers. */
export interface LeaveSessions {
  startSession: LeaveSession
  endSession: LeaveSession
}

/**
 * The session pair meaning "the whole of both boundary days". Also the pair
 * of column defaults, so a row that predates half-day support reads as this.
 */
export const WHOLE_DAY: LeaveSessions = {
  startSession: "FIRST_HALF",
  endSession: "SECOND_HALF",
}

/** True when either boundary is a half rather than the full day. */
export function isHalfDay(sessions: LeaveSessions): boolean {
  return (
    sessions.startSession !== WHOLE_DAY.startSession ||
    sessions.endSession !== WHOLE_DAY.endSession
  )
}

/**
 * Charged days in [start, end], including the half-day adjustment.
 *
 * Wraps `countLeaveDays` rather than replacing it: that function is the
 * integer calendar primitive and is used elsewhere for whole-day questions.
 *
 * Both subtractions are guarded on the boundary date actually being
 * chargeable. A range whose start lands on a Friday contributed 0 to the base
 * count for a non-holiday-counting type, and taking half off that would
 * charge a negative half day.
 */
export function countChargedDays(
  start: Date,
  end: Date,
  sessions: LeaveSessions,
  options: LeaveDayCountOptions = {}
): number {
  const base = countLeaveDays(start, end, options)
  if (base === 0) return 0

  const chargeable = (date: Date) =>
    options.countsHolidays === true ||
    !isNonWorkingDay(date, options.calendar ?? EMPTY_LEAVE_CALENDAR)

  let days = base
  if (sessions.startSession === "SECOND_HALF" && chargeable(start)) days -= 0.5
  if (sessions.endSession === "FIRST_HALF" && chargeable(end)) days -= 0.5
  return days
}
