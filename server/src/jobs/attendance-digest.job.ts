/**
 * The two attendance notifications.
 *
 * The leave module shipped notification *shells* with nothing behind them.
 * That was defensible there — a leave request is something the employee
 * actively watches for. It is not defensible here: a manager who never logs
 * in never learns there is a queue, and an unworked queue blocks payroll.
 *
 * Both job bodies are exported separately from their schedules so they can
 * be invoked directly, in a test or by hand, without a scheduler running.
 */

import prisma from "../config/prisma"
import { env } from "../config/env"
import { exceptionsFor } from "../modules/attendance/attendance.approval"
import { shiftInfo, resolveShift } from "../modules/attendance/attendance.grid"
import {
  sendApprovalsDigest,
  sendMissingCheckOutNudge,
} from "../modules/attendance/attendance.mailer"
import { officeToday } from "../modules/attendance/attendance.time"
import type { ExceptionCode } from "../modules/attendance/attendance.types"
import { addDays, formatDateOnly } from "../utils/dates"

const appLink = (path: string) => `${env.CLIENT_ORIGIN}${path}`

/**
 * One send per approver *who has something pending*.
 *
 * Never to approvers with an empty queue: a digest that arrives every
 * morning regardless is filtered to spam within a fortnight, and then the
 * mechanism is gone precisely when it is needed.
 */
export async function runApprovalsDigest(): Promise<number> {
  const pending = await prisma.attendance.findMany({
    where: { approval: "PENDING" },
    include: {
      employee: {
        select: {
          id: true,
          shiftId: true,
          reportingManagerId: true,
          reportingManager: { select: { user: { select: { email: true } } } },
        },
      },
    },
  })
  if (pending.length === 0) return 0

  const [shifts, hrUsers] = await Promise.all([
    prisma.shift.findMany(),
    prisma.user.findMany({
      where: { role: { in: ["HR_ADMIN", "SUPER_ADMIN"] }, isActive: true },
      select: { email: true },
    }),
  ])

  const today = officeToday()
  const buckets = new Map<
    string,
    { pending: number; oldestAgingDays: number; byException: Partial<Record<ExceptionCode, number>> }
  >()

  for (const record of pending) {
    // The approver rule, applied here exactly as it is at decision time:
    // the employee's reporting manager, or HR when there is none. Records
    // with no manager are the ones that would otherwise be orphaned.
    const recipients = record.employee.reportingManager?.user.email
      ? [record.employee.reportingManager.user.email]
      : hrUsers.map((u) => u.email)

    const shift = resolveShift(
      {
        id: record.employee.id,
        joiningDate: new Date(0),
        employmentStatus: "ACTIVE",
        shiftId: record.employee.shiftId,
      },
      record.date,
      shifts
    )

    const codes = exceptionsFor({
      isLate: record.isLate,
      isEarlyOut: record.isEarlyOut,
      checkOut: record.checkOut,
      workedHours: record.workedHours,
      expectedHours: shiftInfo(shift).expectedHours,
      onApprovedLeave: false,
      isOffDay: false,
      regularisedAt: record.regularisedAt,
      source: record.source,
    })

    const aging = Math.max(
      0,
      Math.round((today.getTime() - record.date.getTime()) / 86_400_000)
    )

    for (const email of recipients) {
      const bucket = buckets.get(email) ?? {
        pending: 0,
        oldestAgingDays: 0,
        byException: {},
      }
      bucket.pending++
      bucket.oldestAgingDays = Math.max(bucket.oldestAgingDays, aging)
      for (const code of codes) {
        bucket.byException[code] = (bucket.byException[code] ?? 0) + 1
      }
      buckets.set(email, bucket)
    }
  }

  for (const [to, bucket] of buckets) {
    await sendApprovalsDigest({ to, ...bucket, link: appLink("/manager/attendance") })
  }

  return buckets.size
}

/**
 * Yesterday's un-closed records, nudged to the employee.
 *
 * This is the notification that prevents most of HR's correction load, by
 * catching a forgotten check-out while the person still remembers what time
 * they actually left.
 */
export async function runMissingCheckOutNudge(): Promise<number> {
  const yesterday = addDays(officeToday(), -1)

  const open = await prisma.attendance.findMany({
    where: { date: yesterday, checkIn: { not: null }, checkOut: null },
    include: { employee: { select: { user: { select: { email: true } } } } },
  })

  for (const record of open) {
    await sendMissingCheckOutNudge(
      record.employee.user.email,
      formatDateOnly(record.date),
      appLink("/employee/attendance")
    )
  }

  return open.length
}
