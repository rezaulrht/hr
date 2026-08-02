/**
 * Office-timezone helpers for attendance.
 *
 * Attendance juggles three different kinds of time at once, and confusing
 * them is the source of almost every attendance bug:
 *
 *   - `checkIn`/`checkOut` are true instants, stored as UTC.
 *   - `date` is a *label* — which business day a record belongs to.
 *   - `Shift.startTime` is a wall-clock time with no date and no timezone.
 *
 * The business day always comes from `APP_TIMEZONE`, never from the server's
 * locale and never from the client. A server running in UTC at 20:00Z is
 * already tomorrow in Dhaka; one running in US-East reads a 09:15 Dhaka
 * check-in as 23:15 the *previous* day, which would file every ordinary
 * morning arrival under the wrong date. Deriving a date with
 * `new Date().toISOString().slice(0, 10)` reads it off UTC and is banned in
 * this module — use `officeDateOf`.
 */

import { env } from "../../config/env"
import { parseDateOnly } from "../../utils/dates"

/**
 * An open check-in older than this is a forgotten check-out, not a long day.
 * Closing it silently would put an 18-hour shift into payroll unreviewed.
 */
export const MAX_OPEN_SHIFT_HOURS = 18

/** How far back an employee may amend their own record. */
export const MAX_REGULARISE_DAYS = 14

/** Pending longer than this is surfaced to HR as a stalled approval queue. */
export const AGING_WARN_DAYS = 3

// `hourCycle: "h23"` matters: with `hour12: false`, some Node versions render
// midnight as "24" rather than "00", which would sort after every other time
// and make a 00:30 arrival look like the latest of the day.
const officeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: env.APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

function officeParts(instant: Date) {
  const parts = officeFormat.formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((p) => p.type === type)
    if (!part) throw new Error(`Intl did not return a "${type}" part for ${env.APP_TIMEZONE}`)
    return part.value
  }
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  }
}

/**
 * The office-local calendar date of an instant, as a UTC-midnight date.
 * This is the only sanctioned way to decide which business day a punch
 * belongs to.
 */
export function officeDateOf(instant: Date): Date {
  const { year, month, day } = officeParts(instant)
  return parseDateOnly(`${year}-${month}-${day}`)
}

/** The office-local wall-clock time of an instant, as "HH:mm". */
export function officeTimeOf(instant: Date): string {
  const { hour, minute } = officeParts(instant)
  return `${hour}:${minute}`
}

/** Today's business date, office-local. */
export function officeToday(): Date {
  return officeDateOf(new Date())
}

/**
 * "09:00" + 15 → "09:15".
 *
 * Clamps at "23:59" rather than wrapping past midnight. A shift whose grace
 * window crosses midnight is a night shift, which this phase does not model,
 * and wrapping would silently mark everyone on time.
 */
export function addMinutesToTime(time: string, minutes: number): string {
  const total = clamp(toMinutes(time) + minutes)
  return fromMinutes(total)
}

/** "09:00" - 15 → "08:45". Clamps at "00:00", for the same reason. */
export function subtractMinutesFromTime(time: string, minutes: number): string {
  return fromMinutes(clamp(toMinutes(time) - minutes))
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Minutes since midnight for an "HH:mm" wall-clock time. */
export function toMinutes(time: string): number {
  const match = TIME_OF_DAY.exec(time)
  if (!match) throw new Error(`Expected an HH:mm time, received "${time}"`)
  return Number(match[1]) * 60 + Number(match[2])
}

export function fromMinutes(total: number): string {
  const hours = String(Math.floor(total / 60)).padStart(2, "0")
  const minutes = String(total % 60).padStart(2, "0")
  return `${hours}:${minutes}`
}

function clamp(total: number): number {
  return Math.min(Math.max(total, 0), 23 * 60 + 59)
}

/**
 * An office-local "HH:mm" on a given business date, as a UTC instant.
 *
 * The inverse of `officeTimeOf`, used when a human types a time rather than
 * punching one. The office's offset is measured from the date itself by
 * round-tripping a midday probe, rather than hard-coded — so this stays
 * correct if APP_TIMEZONE is ever pointed somewhere that observes DST.
 */
export function officeInstantOf(date: Date, time: string): Date {
  const minutes = toMinutes(time)
  const probe = new Date(date.getTime() + 12 * 3_600_000)
  const offsetMinutes = toMinutes(officeTimeOf(probe)) - 12 * 60
  return new Date(date.getTime() + (minutes - offsetMinutes) * 60_000)
}

/**
 * The boundary between a shift's two halves, as "HH:mm".
 *
 * Rounds rather than floors: 09:00-17:45 is 525.5 minutes past start and
 * `fromMinutes` needs an integer.
 *
 * Does **not** subtract `breakMinutes`. Lunch sits inside the span everywhere
 * in this module — `expectedHours` for 09:00-18:00 is 9, not 8 — and a
 * midpoint using a different convention would make the two halves fail to sum
 * to the whole day.
 *
 * A night shift whose span wraps midnight would break this, as it breaks the
 * rest of this file; night shifts are not modelled (see `addMinutesToTime`).
 */
export function shiftMidpoint(shift: { startTime: string; endTime: string }): string {
  return fromMinutes(Math.round((toMinutes(shift.startTime) + toMinutes(shift.endTime)) / 2))
}

/** Whole elapsed hours between two instants, rounded to 2dp. */
export function elapsedHours(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 100) / 100
}
