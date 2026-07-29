import type {
  EmploymentType,
  LeaveAccrualBasis,
  LeaveStatus,
} from "../../generated/prisma/client"

export type TeamStatus = "ACTIVE" | "ON_LEAVE" | "LEFT"

export interface LeaveTypeItem {
  id: string
  code: string
  name: string
  isPaid: boolean
  annualQuota: number
  carryForwardPct: number
  maxConsecutive: number | null
  allowsBackdating: boolean
  eligibleFor: EmploymentType[]
  statutory: boolean
  /** When true the client must charge calendar days, not working days. */
  countsHolidays: boolean
  accrualBasis: LeaveAccrualBasis
  minServiceMonths: number
  maxAccrual: number | null
}

export interface DecidedBy {
  id: string
  email: string
  fullName: string | null
}

export interface LeaveRequestItem {
  id: string
  employee: { id: string; fullName: string; employeeCode: string }
  leaveType: { id: string; name: string; isPaid: boolean }
  startDate: string
  endDate: string
  days: number
  reason: string | null
  status: LeaveStatus
  decidedBy: DecidedBy | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
}

/**
 * Where an earned-leave entitlement came from. Present only on EARNED types.
 *
 * Accrual is derived, so the number changes without anyone touching it — an
 * employee asking "why is my earned leave three days?" deserves the working,
 * not a bare figure.
 */
export interface AccrualDetail {
  daysWorked: number
  perDaysWorked: number
  windowStart: string
  windowEnd: string
  untrackedDays: number
  eligible: boolean
  minServiceMonths: number
}

export interface LeaveBalanceItem {
  leaveTypeId: string
  code: string
  name: string
  isPaid: boolean
  annualQuota: number
  entitlement: number
  used: number
  pending: number
  balance: number
  accrual: AccrualDetail | null
}

export interface TeamMemberStatus {
  id: string
  fullName: string
  employeeCode: string
  designation: string
  status: TeamStatus
  currentLeave: { leaveTypeName: string; startDate: string; endDate: string } | null
}

export interface ApplyLeaveInput {
  leaveTypeId: string
  startDate: string
  endDate: string
  reason?: string
}
