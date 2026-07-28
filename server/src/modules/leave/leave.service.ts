import prisma from "../../config/prisma"
import type { Employee } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { AccessTokenPayload } from "../auth/auth.types"
import { countLeaveDays, formatDateOnly, todayUtc } from "./leave.dates"
import type {
  DecidedBy,
  LeaveBalanceItem,
  LeaveRequestItem,
  LeaveTypeItem,
  TeamMemberStatus,
  TeamStatus,
} from "./leave.types"

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

const REQUEST_INCLUDE = {
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  leaveType: { select: { id: true, name: true, isPaid: true } },
} as const

/**
 * `approvedBy` holds a user id. Resolve it to something displayable — a raw
 * UUID in an "Approver" column is useless. HR/Finance/Admin users have no
 * Employee row, so fullName is null for them and the UI falls back to email.
 */
async function resolveDeciders(userIds: string[]) {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map<string, DecidedBy>()
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  })
  return new Map<string, DecidedBy>(
    users.map((u) => [u.id, { id: u.id, email: u.email, fullName: u.employee?.fullName ?? null }])
  )
}

export async function listLeaveRequests(actor: AccessTokenPayload): Promise<LeaveRequestItem[]> {
  let where: Record<string, unknown> = {}

  if (actor.role === "EMPLOYEE") {
    const self = await requireEmployeeForUser(actor.sub)
    where = { employeeId: self.id }
  } else if (actor.role === "REPORTING_MANAGER") {
    const self = await requireEmployeeForUser(actor.sub)
    where = { OR: [{ employeeId: self.id }, { employee: { reportingManagerId: self.id } }] }
  }
  // HR_ADMIN / SUPER_ADMIN / FINANCE_OFFICER see everything.

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  })

  const deciders = await resolveDeciders(
    requests.map((r) => r.approvedBy).filter((id): id is string => !!id)
  )

  return requests.map((r) => ({
    id: r.id,
    employee: r.employee,
    leaveType: r.leaveType,
    startDate: formatDateOnly(r.startDate),
    endDate: formatDateOnly(r.endDate),
    days: countLeaveDays(r.startDate, r.endDate),
    reason: r.reason,
    status: r.status,
    decidedBy: r.approvedBy ? (deciders.get(r.approvedBy) ?? null) : null,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function getTeamStatus(userId: string): Promise<TeamMemberStatus[]> {
  const manager = await requireEmployeeForUser(userId)
  const today = todayUtc()

  const reports = await prisma.employee.findMany({
    where: { reportingManagerId: manager.id },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      designation: true,
      employmentStatus: true,
      leaveRequests: {
        where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
        select: { startDate: true, endDate: true, leaveType: { select: { name: true } } },
        take: 1,
      },
    },
  })

  return reports.map((r) => {
    const active = r.leaveRequests[0]
    // Precedence: left > on leave > active. A pending request is deliberately
    // not a status — applying says nothing about where someone is today.
    let status: TeamStatus = "ACTIVE"
    if (r.employmentStatus === "RESIGNED" || r.employmentStatus === "TERMINATED") {
      status = "LEFT"
    } else if (active) {
      status = "ON_LEAVE"
    }

    return {
      id: r.id,
      fullName: r.fullName,
      employeeCode: r.employeeCode,
      designation: r.designation,
      status,
      currentLeave:
        status === "ON_LEAVE" && active
          ? {
              leaveTypeName: active.leaveType.name,
              startDate: formatDateOnly(active.startDate),
              endDate: formatDateOnly(active.endDate),
            }
          : null,
    }
  })
}
