import prisma from "../../config/prisma"
import type { Employee } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { AccessTokenPayload } from "../auth/auth.types"
import {
  addDays,
  calendarSpan,
  countLeaveDays,
  formatDateOnly,
  MAX_BACKDATE_DAYS,
  parseDateOnly,
  todayUtc,
} from "./leave.dates"
import type {
  ApplyLeaveInput,
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

export async function applyForLeave(
  userId: string,
  input: ApplyLeaveInput
): Promise<LeaveRequestItem> {
  const employee = await requireEmployeeForUser(userId)

  let start: Date
  let end: Date
  try {
    start = parseDateOnly(input.startDate)
    end = parseDateOnly(input.endDate)
  } catch (err) {
    throw new AppError(400, (err as Error).message)
  }

  // 1. Ordering
  if (end.getTime() < start.getTime()) {
    throw new AppError(400, "The end date cannot be before the start date")
  }

  // 2. Single leave year — a range crossing Dec 31 makes the balance ambiguous
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    throw new AppError(
      400,
      "A request cannot span two years. Please split it into one request per year."
    )
  }

  const leaveType = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } })
  if (!leaveType) {
    throw new AppError(400, "That leave type no longer exists")
  }

  // 3. Backdating
  const today = todayUtc()
  if (start.getTime() < today.getTime()) {
    if (!leaveType.allowsBackdating) {
      throw new AppError(400, `${leaveType.name} leave cannot start in the past`)
    }
    if (start.getTime() < addDays(today, -MAX_BACKDATE_DAYS).getTime()) {
      throw new AppError(400, `Backdated leave cannot start more than ${MAX_BACKDATE_DAYS} days ago`)
    }
  }

  // 4. Must contain at least one working day
  const days = countLeaveDays(start, end)
  if (days === 0) {
    throw new AppError(400, "That range contains no working days (Fridays are a weekly holiday)")
  }

  // 5. Overlap with anything already live
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  })
  if (clash) {
    throw new AppError(400, "You already have a pending or approved request overlapping those dates")
  }

  // 6. Eligibility
  if (!leaveType.eligibleFor.includes(employee.employmentType)) {
    throw new AppError(
      400,
      `${employee.employmentType} employees are not eligible for ${leaveType.name} leave`
    )
  }

  // 7. Max consecutive absence — measured in calendar days, because the policy
  // caps how long someone is away, not how much balance they burn.
  if (leaveType.maxConsecutive !== null && calendarSpan(start, end) > leaveType.maxConsecutive) {
    throw new AppError(
      400,
      `${leaveType.name} leave is limited to ${leaveType.maxConsecutive} consecutive days`
    )
  }

  // 8. Balance — pending counts here so requests can't be stacked past quota
  if (!isUnpaidType(leaveType)) {
    const balances = await getBalancesForEmployee(employee, start.getUTCFullYear())
    const balance = balances.find((b) => b.leaveTypeId === leaveType.id)
    if (!balance || balance.balance < days) {
      throw new AppError(
        400,
        `That request needs ${days} day(s) but only ${balance?.balance ?? 0} remain. Consider applying for Leave Without Pay instead.`
      )
    }
  }

  const created = await prisma.leaveRequest.create({
    data: {
      employeeId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: start,
      endDate: end,
      reason: input.reason ?? null,
      status: "PENDING",
    },
    include: REQUEST_INCLUDE,
  })

  return {
    id: created.id,
    employee: created.employee,
    leaveType: created.leaveType,
    startDate: formatDateOnly(created.startDate),
    endDate: formatDateOnly(created.endDate),
    days,
    reason: created.reason,
    status: created.status,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: created.createdAt.toISOString(),
  }
}

async function loadRequestOr404(id: string) {
  const found = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: true, leaveType: true },
  })
  if (!found) throw new AppError(404, "Leave request not found")
  return found
}

/** Re-reads the row after a decision so the response reflects what was stored. */
async function finishDecision(id: string): Promise<LeaveRequestItem> {
  const updated = await prisma.leaveRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE })
  if (!updated) throw new AppError(404, "Leave request not found")

  const deciders = await resolveDeciders(updated.approvedBy ? [updated.approvedBy] : [])
  return {
    id: updated.id,
    employee: updated.employee,
    leaveType: updated.leaveType,
    startDate: formatDateOnly(updated.startDate),
    endDate: formatDateOnly(updated.endDate),
    days: countLeaveDays(updated.startDate, updated.endDate),
    reason: updated.reason,
    status: updated.status,
    decidedBy: updated.approvedBy ? (deciders.get(updated.approvedBy) ?? null) : null,
    decidedAt: updated.decidedAt ? updated.decidedAt.toISOString() : null,
    decisionNote: updated.decisionNote,
    createdAt: updated.createdAt.toISOString(),
  }
}

export async function approveLeaveRequest(
  id: string,
  actorUserId: string
): Promise<LeaveRequestItem> {
  const found = await loadRequestOr404(id)
  if (found.status !== "PENDING") {
    throw new AppError(409, `This request is already ${found.status.toLowerCase()}`)
  }

  const days = countLeaveDays(found.startDate, found.endDate)

  // Re-check against APPROVED requests only. State moves between filing and
  // approval — without this, two 5-day requests against a 5-day balance both
  // pass at apply time and approving both grants 10.
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      id: { not: id },
      employeeId: found.employeeId,
      status: "APPROVED",
      startDate: { lte: found.endDate },
      endDate: { gte: found.startDate },
    },
  })
  if (clash) {
    throw new AppError(409, "Another approved request now overlaps these dates")
  }

  if (!isUnpaidType(found.leaveType)) {
    const year = found.startDate.getUTCFullYear()
    const balances = await getBalancesForEmployee(found.employee, year)
    const balance = balances.find((b) => b.leaveTypeId === found.leaveTypeId)
    const entitlement = balance?.entitlement ?? 0
    const alreadyApproved = balance?.used ?? 0
    if (alreadyApproved + days > entitlement) {
      throw new AppError(409, "Balance is no longer sufficient — another request was approved first")
    }
  }

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "APPROVED", approvedBy: actorUserId, decidedAt: new Date(), decisionNote: null },
  })
  return finishDecision(id)
}

export async function rejectLeaveRequest(
  id: string,
  actorUserId: string,
  note: string
): Promise<LeaveRequestItem> {
  const found = await loadRequestOr404(id)
  if (found.status !== "PENDING") {
    throw new AppError(409, `This request is already ${found.status.toLowerCase()}`)
  }
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedBy: actorUserId, decidedAt: new Date(), decisionNote: note },
  })
  return finishDecision(id)
}

export async function cancelLeaveRequest(
  id: string,
  actorUserId: string
): Promise<LeaveRequestItem> {
  const found = await loadRequestOr404(id)
  const self = await requireEmployeeForUser(actorUserId)
  if (found.employeeId !== self.id) {
    throw new AppError(403, "You can only cancel your own leave requests")
  }

  const notStarted = found.startDate.getTime() > todayUtc().getTime()
  const cancellable = found.status === "PENDING" || (found.status === "APPROVED" && notStarted)
  if (!cancellable) {
    throw new AppError(
      409,
      found.status === "APPROVED"
        ? "Leave that has already started cannot be cancelled"
        : `This request is already ${found.status.toLowerCase()}`
    )
  }

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED", decidedAt: new Date() },
  })
  return finishDecision(id)
}

export async function revertLeaveRequest(
  id: string,
  actorUserId: string,
  note: string
): Promise<LeaveRequestItem> {
  const found = await loadRequestOr404(id)
  if (found.status !== "APPROVED") {
    throw new AppError(409, "Only an approved request can be reverted")
  }
  if (found.startDate.getTime() <= todayUtc().getTime()) {
    throw new AppError(409, "Leave that has already started cannot be reverted")
  }
  await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: "CANCELLED",
      approvedBy: actorUserId,
      decidedAt: new Date(),
      decisionNote: note,
    },
  })
  return finishDecision(id)
}
