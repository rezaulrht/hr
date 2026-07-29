/**
 * Loading the gazetted calendar for leave day counting.
 *
 * Kept apart from `leave.dates.ts` so the counting rules stay pure and
 * testable without Prisma, and apart from the service so a caller counting
 * many requests can fetch one range once rather than per request.
 */

import prisma from "../../config/prisma"
import { formatDateOnly } from "../../utils/dates"
import { EMPTY_LEAVE_CALENDAR, type LeaveCalendar } from "./leave.dates"

export { EMPTY_LEAVE_CALENDAR }

/**
 * Every holiday in [from, to], split into days off and WORKING_DAY orders.
 *
 * One query per range, never one per request: `listLeaveRequests` counts days
 * for every row it returns, and a per-row lookup would be a query per leave
 * request on a page that exists to show hundreds of them.
 */
export async function loadLeaveCalendar(from: Date, to: Date): Promise<LeaveCalendar> {
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: from, lte: to } },
    select: { date: true, type: true },
  })

  const calendar: LeaveCalendar = { holidayDates: new Set(), workingOverrides: new Set() }
  for (const holiday of holidays) {
    const key = formatDateOnly(holiday.date)
    if (holiday.type === "WORKING_DAY") calendar.workingOverrides.add(key)
    else calendar.holidayDates.add(key)
  }
  return calendar
}

/** The calendar covering every date touched by a set of ranges. */
export async function loadCalendarSpanning(
  ranges: Array<{ startDate: Date; endDate: Date }>
): Promise<LeaveCalendar> {
  if (ranges.length === 0) return EMPTY_LEAVE_CALENDAR
  const from = new Date(Math.min(...ranges.map((r) => r.startDate.getTime())))
  const to = new Date(Math.max(...ranges.map((r) => r.endDate.getTime())))
  return loadLeaveCalendar(from, to)
}

/** The calendar for a whole leave year. */
export function loadCalendarForYear(year: number): Promise<LeaveCalendar> {
  return loadLeaveCalendar(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 11, 31)))
}
