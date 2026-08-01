/**
 * Attrition over a rolling twelve months.
 *
 *     leavers in window / ((opening headcount + closing headcount) / 2)
 *
 * The average of opening and closing headcount, not the closing one: a
 * company that halved would otherwise report an attrition rate above 100%,
 * and one that doubled would report a flattering fraction of the churn it
 * actually had.
 */

import prisma from "../../config/prisma"
import { officeToday } from "../attendance/attendance.time"

export interface Attrition {
  /** Null when the average headcount is zero — there is no rate to report. */
  rate: number | null
  leavers: number
  averageHeadcount: number
  from: Date
  to: Date
}

export async function rollingAttrition(months = 12): Promise<Attrition> {
  const to = officeToday()
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - months, to.getUTCDate()))

  const employees = await prisma.employee.findMany({
    select: { joiningDate: true, lastWorkingDay: true, employmentStatus: true },
  })

  const leavers = employees.filter(
    (e) =>
      (e.employmentStatus === "RESIGNED" || e.employmentStatus === "TERMINATED") &&
      // A null exit date is **excluded**, and deliberately: status can be set
      // without one, and counting those against a *window* attributes them to
      // whichever window happens to be open when somebody looks.
      e.lastWorkingDay !== null &&
      e.lastWorkingDay >= from &&
      e.lastWorkingDay <= to
  ).length

  const headcountAt = (at: Date) =>
    employees.filter(
      (e) => e.joiningDate <= at && (e.lastWorkingDay === null || e.lastWorkingDay >= at)
    ).length

  const averageHeadcount = (headcountAt(from) + headcountAt(to)) / 2

  return {
    // Null rather than NaN or Infinity. A company with no staff has no
    // attrition rate, and "0%" would read as a perfect one.
    rate: averageHeadcount > 0 ? (leavers / averageHeadcount) * 100 : null,
    leavers,
    averageHeadcount,
    from,
    to,
  }
}
