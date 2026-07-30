import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Friday — the weekly non-working day. Matches WEEKLY_OFF_DAY on the server. */
export const WEEKLY_OFF_DAY = 5

/**
 * Format a Date as YYYY-MM-DD using its LOCAL parts.
 *
 * Deliberately not `toISOString().slice(0,10)`: at UTC+6 a locally-picked
 * Aug 14 becomes "2026-08-13T18:00Z", so that idiom stores every date a day
 * early.
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Parse YYYY-MM-DD into a local-midnight Date (the inverse of toDateString). */
export function parseDateString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function isWeeklyOff(date: Date): boolean {
  return date.getDay() === WEEKLY_OFF_DAY
}

/**
 * The gazetted calendar, as the day-count preview needs it. Mirrors
 * `LeaveCalendar` on the server; both are built from the same Holiday rows.
 */
export interface LeaveCalendar {
  /** YYYY-MM-DD dates that carry a holiday taking the day off. */
  holidayDates: Set<string>
  /** YYYY-MM-DD dates where a WORKING_DAY order cancels the weekly off. */
  workingOverrides: Set<string>
}

export const EMPTY_LEAVE_CALENDAR: LeaveCalendar = {
  holidayDates: new Set(),
  workingOverrides: new Set(),
}

/** True when a date is neither a working day nor chargeable as leave. */
export function isNonWorkingDay(
  date: Date,
  calendar: LeaveCalendar = EMPTY_LEAVE_CALENDAR
): boolean {
  const key = toDateString(date)
  if (calendar.holidayDates.has(key)) return true
  return isWeeklyOff(date) && !calendar.workingOverrides.has(key)
}

/** Inclusive calendar-day span, ignoring which days are working days. */
export function countCalendarDays(start: Date, end: Date): number {
  let count = 0
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  while (cursor.getTime() <= end.getTime()) {
    count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

/**
 * Mirrors the server's `countLeaveDays` so the UI preview matches what is
 * charged — including the §117 split, where a holiday-counting type charges
 * every calendar day and every other type skips the days off.
 */
export function countLeaveDays(
  start: Date,
  end: Date,
  options: { countsHolidays?: boolean; calendar?: LeaveCalendar } = {}
): number {
  if (options.countsHolidays) return countCalendarDays(start, end)

  const calendar = options.calendar ?? EMPTY_LEAVE_CALENDAR
  let count = 0
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  while (cursor.getTime() <= end.getTime()) {
    if (!isNonWorkingDay(cursor, calendar)) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}
