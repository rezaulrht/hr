/**
 * Re-judges stored punch flags after an approval changes what a day expected.
 *
 * `isLate`/`isEarlyOut` are computed once at capture and stored, which is
 * right for a punch: it records what was true when somebody walked in. But
 * leave is approved on a different schedule from punching. File a first-half
 * leave, arrive at the midpoint while it is still PENDING, and the flag is
 * written against the full shift — correctly, because at that instant no
 * leave was approved. Approving it the next day makes that flag a lie, and
 * nothing else in the system would ever revisit it.
 *
 * This lives in the attendance module, not in leave, because attendance owns
 * writes to `Attendance`. Leave calls one exported function.
 */

import type { LeaveSession, Prisma } from "../../generated/prisma/client"
import { formatDateOnly } from "../../utils/dates"
import { auditAttendance } from "./attendance.audit"
import { effectiveShift, resolveShift } from "./attendance.grid"
import { computeIsEarlyOut, computeIsLate } from "./attendance.punch"

/**
 * Re-derives `isLate`/`isEarlyOut` for one employee's attendance rows in
 * [start, end], against whatever leave is approved **at the time it runs**.
 *
 * That "at the time it runs" is what makes a separate inverse unnecessary:
 * revert removes the approval and this re-judges against the full shift.
 *
 * Writes only rows whose flags actually change, so an approval that affects
 * nothing leaves no audit noise.
 */
export async function recomputePunchFlags(
  tx: Prisma.TransactionClient,
  employeeId: string,
  start: Date,
  end: Date
): Promise<void> {
  const rows = await tx.attendance.findMany({
    where: { employeeId, date: { gte: start, lte: end } },
  })
  if (rows.length === 0) return

  const [shifts, employee, leaves] = await Promise.all([
    tx.shift.findMany(),
    tx.employee.findUnique({ where: { id: employeeId }, select: { id: true, shiftId: true } }),
    tx.leaveRequest.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { startDate: true, endDate: true, startSession: true, endSession: true },
    }),
  ])
  if (!employee) return

  for (const row of rows) {
    const key = formatDateOnly(row.date)

    // The leave covering this date, reduced to the grid's fraction/session
    // pair. Mirrors `indexLeaves`; kept local because importing the grid's
    // private indexer would widen its surface for one caller.
    let fraction = 0
    let startSession: LeaveSession = "FIRST_HALF"
    for (const leave of leaves) {
      if (formatDateOnly(leave.startDate) > key || formatDateOnly(leave.endDate) < key) continue
      fraction = 1
      if (key === formatDateOnly(leave.startDate) && leave.startSession === "SECOND_HALF") {
        fraction -= 0.5
        startSession = "SECOND_HALF"
      }
      if (key === formatDateOnly(leave.endDate) && leave.endSession === "FIRST_HALF") {
        fraction -= 0.5
      }
    }

    const shift = effectiveShift(resolveShift(employee, row.date, shifts), fraction, startSession)

    // A missing punch keeps whatever the row already said: there is no
    // instant to re-judge, and overwriting with `false` would silently clear
    // a flag an HR correction had set.
    const isLate = row.checkIn ? computeIsLate(row.checkIn, shift) : row.isLate
    const isEarlyOut = row.checkOut
      ? computeIsEarlyOut(row.checkOut, row.date, shift)
      : row.isEarlyOut

    if (isLate === row.isLate && isEarlyOut === row.isEarlyOut) continue

    await tx.attendance.update({ where: { id: row.id }, data: { isLate, isEarlyOut } })
    await auditAttendance(tx, {
      attendanceId: row.id,
      action: "LEAVE_RECOMPUTE",
      changedBy: null,
      before: { isLate: row.isLate, isEarlyOut: row.isEarlyOut },
      after: { isLate, isEarlyOut },
      note: "Re-judged after a leave decision changed the expected window",
    })
  }
}
