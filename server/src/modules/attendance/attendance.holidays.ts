/**
 * The holiday calendar.
 *
 * The seed is a starting point, not an authority: lunar dates move on moon
 * sighting, and the government amends its own gazette mid-year — 2026's
 * Eid-ul-Azha was announced as six days and later extended to seven, taking
 * a weekend day with it. So HR owns this from here.
 */

import prisma from "../../config/prisma"
import type { Holiday, Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { formatDateOnly, parseDateOnly } from "../../utils/dates"
import { officeToday } from "./attendance.time"
import type { HolidayItem } from "./attendance.types"
import type { HolidayBody, HolidayUpdateBody } from "./attendance.validators"

export interface ImpactBlock {
  affectedEmployees: number
  affectedDates: string[]
  monthsTouched: string[]
}

export interface HolidayWriteResult {
  holiday: HolidayItem
  /** Present only when the write touches a date on or before today. */
  impact?: ImpactBlock
}

const toItem = (holiday: Holiday): HolidayItem => ({
  id: holiday.id,
  name: holiday.name,
  date: formatDateOnly(holiday.date),
  type: holiday.type,
})

/**
 * Once `PayrollRun` is real, any write landing in a month with a run at
 * APPROVED or DISBURSED must 409 — the figures have already been paid.
 *
 * Payroll does not exist yet, so this always passes. It is a named function
 * rather than a TODO comment so the payroll phase has an obvious slot to
 * fill instead of a rule to rediscover.
 *
 * The payroll phase must also call this from leave's `approveLeaveRequest`:
 * the leave module permits Sick leave to be backdated 30 days, and approving
 * a backdated sick day retroactively flips it from ABSENT to ON_LEAVE. If
 * that month was already paid, the money is already wrong and nothing
 * currently notices.
 */
export function assertMonthNotLocked(_date: Date): void {
  // Intentionally empty until PayrollRun exists.
}

export async function listHolidays(year?: number): Promise<HolidayItem[]> {
  const target = year ?? officeToday().getUTCFullYear()
  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: new Date(Date.UTC(target, 0, 1)),
        lte: new Date(Date.UTC(target, 11, 31)),
      },
    },
    orderBy: { date: "asc" },
  })
  return holidays.map(toItem)
}

/**
 * What changes if this date stops or starts being a holiday.
 *
 * Because the day grid is derived, a write here instantly rewrites every
 * employee's status for that date — with no migration, no warning and no
 * trace. The UI shows this before letting the write through, because the
 * consequence is invisible on the screen where it happens and lands in a
 * different module entirely.
 */
async function impactOf(dates: Date[]): Promise<ImpactBlock | undefined> {
  const today = officeToday()
  const past = dates.filter((d) => d <= today)
  if (past.length === 0) return undefined

  const affectedEmployees = await prisma.employee.count({
    where: { employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] } },
  })

  const affectedDates = past.map(formatDateOnly).sort()
  const monthsTouched = [...new Set(affectedDates.map((d) => d.slice(0, 7)))].sort()

  return { affectedEmployees, affectedDates, monthsTouched }
}

function conflictError(date: Date, name: string): AppError {
  return new AppError(
    409,
    `"${name}" already exists on ${formatDateOnly(date)}. Two different holidays may share a date, but not the same name twice.`
  )
}

function isUniqueViolation(err: unknown): boolean {
  return (err as Prisma.PrismaClientKnownRequestError)?.code === "P2002"
}

export async function createHoliday(body: HolidayBody): Promise<HolidayWriteResult> {
  const date = parseDateOnly(body.date)
  assertMonthNotLocked(date)

  try {
    const holiday = await prisma.holiday.create({
      data: { name: body.name, date, type: body.type },
    })
    return { holiday: toItem(holiday), impact: await impactOf([date]) }
  } catch (err) {
    if (isUniqueViolation(err)) throw conflictError(date, body.name)
    throw err
  }
}

export async function updateHoliday(
  id: string,
  body: HolidayUpdateBody
): Promise<HolidayWriteResult> {
  const existing = await prisma.holiday.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, "Holiday not found")

  const nextDate = body.date ? parseDateOnly(body.date) : existing.date
  assertMonthNotLocked(existing.date)
  assertMonthNotLocked(nextDate)

  try {
    const holiday = await prisma.holiday.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.date !== undefined ? { date: nextDate } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
      },
    })
    // Moving a holiday is a two-date impact: the old date stops being one
    // and the new date starts. Both are reported.
    const dates =
      nextDate.getTime() === existing.date.getTime() ? [nextDate] : [existing.date, nextDate]
    return { holiday: toItem(holiday), impact: await impactOf(dates) }
  } catch (err) {
    if (isUniqueViolation(err)) throw conflictError(nextDate, body.name ?? existing.name)
    throw err
  }
}

export async function deleteHoliday(id: string): Promise<{ impact?: ImpactBlock }> {
  const existing = await prisma.holiday.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, "Holiday not found")

  assertMonthNotLocked(existing.date)
  await prisma.holiday.delete({ where: { id } })

  // Deleting a WORKING_DAY row is the one delete whose effect is the
  // opposite of every other: it takes a working day *away* by restoring the
  // weekly off, rather than adding one back.
  return { impact: await impactOf([existing.date]) }
}
