import prisma from "../../config/prisma"
import type { Employee } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { countLeaveDays } from "./leave.dates"
import type { LeaveBalanceItem, LeaveTypeItem } from "./leave.types"

/**
 * Annual entitlement, pro-rated across the joining year. A November hire
 * shouldn't receive a full year's quota on their first day.
 */
export function computeEntitlement(annualQuota: number, joiningDate: Date, year: number): number {
  const joinYear = joiningDate.getUTCFullYear()
  if (joinYear > year) return 0
  if (joinYear < year) return annualQuota
  const monthsRemaining = 12 - joiningDate.getUTCMonth()
  return Math.max(0, Math.round((annualQuota * monthsRemaining) / 12))
}

/**
 * Unpaid leave is modelled as a zero-quota unpaid type rather than a schema
 * flag — these skip balance checks entirely, so an employee whose annual
 * allowance is spent still has a way to take time off.
 */
export function isUnpaidType(leaveType: { isPaid: boolean; annualQuota: number }): boolean {
  return !leaveType.isPaid && leaveType.annualQuota === 0
}

export async function getBalancesForEmployee(
  employee: Pick<Employee, "id" | "employmentType" | "joiningDate">,
  year: number
): Promise<LeaveBalanceItem[]> {
  const [leaveTypes, requests] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { name: "asc" } }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31)),
        },
      },
      select: { leaveTypeId: true, status: true, startDate: true, endDate: true },
    }),
  ])

  return leaveTypes
    .filter((lt) => lt.eligibleFor.includes(employee.employmentType))
    .map((lt) => {
      const mine = requests.filter((r) => r.leaveTypeId === lt.id)
      const sum = (status: string) =>
        mine
          .filter((r) => r.status === status)
          .reduce((total, r) => total + countLeaveDays(r.startDate, r.endDate), 0)

      const used = sum("APPROVED")
      const pending = sum("PENDING")
      const entitlement = computeEntitlement(lt.annualQuota, employee.joiningDate, year)

      return {
        leaveTypeId: lt.id,
        name: lt.name,
        isPaid: lt.isPaid,
        annualQuota: lt.annualQuota,
        entitlement,
        used,
        pending,
        balance: entitlement - used - pending,
      }
    })
}

export async function listLeaveTypes(): Promise<LeaveTypeItem[]> {
  const types = await prisma.leaveType.findMany({ orderBy: { name: "asc" } })
  return types.map((t) => ({
    id: t.id,
    name: t.name,
    isPaid: t.isPaid,
    annualQuota: t.annualQuota,
    carryForwardPct: t.carryForwardPct,
    maxConsecutive: t.maxConsecutive,
    allowsBackdating: t.allowsBackdating,
    eligibleFor: t.eligibleFor,
  }))
}

/** Resolves the caller's Employee row, or explains why they don't have one. */
export async function requireEmployeeForUser(userId: string) {
  const employee = await prisma.employee.findUnique({ where: { userId } })
  if (!employee) {
    throw new AppError(403, "This account has no employee profile, so it cannot hold leave")
  }
  return employee
}

export async function getMyBalances(userId: string): Promise<LeaveBalanceItem[]> {
  const employee = await requireEmployeeForUser(userId)
  return getBalancesForEmployee(employee, new Date().getUTCFullYear())
}
