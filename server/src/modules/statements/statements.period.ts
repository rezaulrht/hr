/**
 * Reporting-period arithmetic. Pure — no Prisma, no clock, no I/O.
 *
 * The presets (Month, Quarter, Half-year, Year) are computed client-side and
 * arrive here already resolved to a from/to pair. That is deliberate: a
 * quarter is relative to the financial year's start month, the client
 * already holds the financial-year list to render the picker, and putting a
 * preset vocabulary in the API would mean the server had to look the year up
 * again to resolve the word "Q2".
 */

import { AppError } from "../../middleware/errorHandler"

export interface DateRange {
  from: Date
  to: Date
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const FIVE_YEARS_MS = 5 * 366 * 24 * 60 * 60 * 1000

function lastDayOf(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function isLastDayOfMonth(d: Date): boolean {
  return d.getUTCDate() === lastDayOf(d.getUTCFullYear(), d.getUTCMonth())
}

/**
 * The comparative period: the same range one year earlier.
 *
 * The day is clamped to the target month's end, so 29 February 2028
 * compares against 28 February 2027 rather than silently rolling into
 * 1 March. Returns new Date objects; the input is never mutated.
 */
export function shiftBackOneYear(range: DateRange): DateRange {
  const shift = (d: Date): Date => {
    const year = d.getUTCFullYear() - 1
    const monthIndex = d.getUTCMonth()
    const day = Math.min(d.getUTCDate(), lastDayOf(year, monthIndex))
    return new Date(Date.UTC(year, monthIndex, day))
  }
  return { from: shift(range.from), to: shift(range.to) }
}

export function assertValidRange(range: DateRange): void {
  if (range.to.getTime() < range.from.getTime()) {
    throw new AppError(400, "The end date cannot be before the start date")
  }
  // Not a technical limit — a guard against a mistyped year turning a report
  // into a full-table scan across every journal ever posted.
  if (range.to.getTime() - range.from.getTime() > FIVE_YEARS_MS) {
    throw new AppError(400, "A reporting period cannot be longer than five years")
  }
}

/**
 * A human label for the range. Used in the response so the client renders
 * "compared with July 2025" without re-deriving the same three cases.
 */
export function describeRange({ from, to }: DateRange): string {
  const wholeMonths = from.getUTCDate() === 1 && isLastDayOfMonth(to)

  if (wholeMonths) {
    const sameMonth =
      from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth()

    if (sameMonth) {
      return `${MONTHS_LONG[from.getUTCMonth()]} ${from.getUTCFullYear()}`
    }
    return (
      `${MONTHS_SHORT[from.getUTCMonth()]} ${from.getUTCFullYear()} – ` +
      `${MONTHS_SHORT[to.getUTCMonth()]} ${to.getUTCFullYear()}`
    )
  }

  const full = (d: Date) =>
    `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  return `${full(from)} – ${full(to)}`
}
