// Hand-mirrored from server/src/generated/prisma's Role enum. No shared
// types package (client and server are separate projects) — if the
// server's Role enum changes, update this by hand.
export type Role = "SUPER_ADMIN" | "HR_ADMIN" | "FINANCE_OFFICER" | "REPORTING_MANAGER" | "EMPLOYEE"

export interface PublicUser {
  id: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  employeeCode?: string
}

export interface LoginResponse {
  accessToken: string
  user: PublicUser
}

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN"
export type EmploymentStatus = "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED"

export interface Department {
  id: string
  name: string
}

export interface Employee {
  id: string
  employeeCode: string
  fullName: string
  email: string
  designation: string
  department: Department
  employmentType: EmploymentType
  employmentStatus: EmploymentStatus
  joiningDate: string
}

export interface CreateStaffAccountInput {
  fullName: string
  email: string
  role: "EMPLOYEE" | "REPORTING_MANAGER"
  designation: string
  departmentId: string
  employmentType: EmploymentType
  joiningDate: string
}

export interface CreateStaffAccountResult {
  employeeCode: string
  temporaryPassword: string
  fullName: string
  email: string
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
export type TeamStatus = "ACTIVE" | "ON_LEAVE" | "LEFT"

export interface LeaveType {
  id: string
  name: string
  isPaid: boolean
  annualQuota: number
  carryForwardPct: number
  maxConsecutive: number | null
  allowsBackdating: boolean
  eligibleFor: EmploymentType[]
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

export interface LeaveBalanceItem {
  leaveTypeId: string
  name: string
  isPaid: boolean
  annualQuota: number
  entitlement: number
  used: number
  pending: number
  balance: number
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

// ── ATTENDANCE ────────────────────────────────
// Hand-mirrored from server/src/modules/attendance/attendance.types.ts.
// No shared package between client and server by design — keep in sync.

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKLY_OFF"
  | "NOT_CHECKED_IN"
  | "NOT_TRACKED"

export type AttendanceApproval = "PENDING" | "APPROVED" | "AUTO_APPROVED" | "REJECTED"

export type AttendanceSource = "WEB" | "MANUAL" | "RFID" | "FACE" | "FINGERPRINT"

export type HolidayType = "GENERAL" | "EXECUTIVE_ORDER" | "OPTIONAL" | "WORKING_DAY"

export type ExceptionCode =
  | "LATE"
  | "EARLY_OUT"
  | "MISSING_CHECKOUT"
  | "SHORTFALL"
  | "LEAVE_CONFLICT"
  | "WORKED_OFF_DAY"
  | "REGULARISED"
  | "MANUAL_ENTRY"

export interface ShiftInfo {
  id: string
  name: string
  startTime: string
  endTime: string
  breakMinutes: number
  graceMinutes: number
  weeklyOffDays: number[]
  expectedHours: number
}

export interface AttendanceDay {
  date: string
  status: AttendanceStatus
  isWorkingDay: boolean
  isOffDay: boolean
  isHoliday: boolean
  isWeeklyOff: boolean
  checkIn: string | null
  checkOut: string | null
  workedHours: number | null
  expectedHours: number
  isLate: boolean
  isEarlyOut: boolean
  approval: AttendanceApproval | null
  source: AttendanceSource | null
  detail: string | null
  regularised: boolean
  corrected: boolean
  attendanceId: string | null
}

export interface TodayAttendance {
  /** Anchors the client clock; never trust the browser's own. */
  serverTime: string
  date: string
  status: AttendanceStatus
  checkIn: string | null
  checkOut: string | null
  workedHours: number | null
  isLate: boolean
  isEarlyOut: boolean
  approval: AttendanceApproval | null
  shift: ShiftInfo
  canCheckIn: boolean
  canCheckOut: boolean
  detail: string | null
}

export interface PunchResult {
  attendanceId: string
  date: string
  checkIn: string | null
  checkOut: string | null
  workedHours: number | null
  isLate: boolean
  isEarlyOut: boolean
  approval: AttendanceApproval
  status: AttendanceStatus
  isHoliday: boolean
  holidayName: string | null
  isWeeklyOff: boolean
  onApprovedLeave: boolean
  leaveTypeName: string | null
  shift: ShiftInfo
}

export interface AttendanceEmployeeRef {
  id: string
  fullName: string
  employeeCode: string
  designation: string
}

export interface ApprovalItem {
  id: string
  employee: AttendanceEmployeeRef
  date: string
  checkIn: string | null
  checkOut: string | null
  workedHours: number | null
  isLate: boolean
  isEarlyOut: boolean
  approval: AttendanceApproval
  regularised: boolean
  regularisedNote: string | null
  exceptions: ExceptionCode[]
  agingDays: number
  stalled: boolean
}

export interface DailySummaryRow {
  employee: AttendanceEmployeeRef
  status: AttendanceStatus
  checkIn: string | null
  checkOut: string | null
  workedHours: number | null
  isLate: boolean
  isEarlyOut: boolean
  approval: AttendanceApproval | null
  detail: string | null
}

export interface DailySummary {
  date: string
  totals: {
    present: number
    late: number
    absent: number
    onLeave: number
    holiday: number
    weeklyOff: number
    notCheckedIn: number
    pendingApproval: number
  }
  rows: DailySummaryRow[]
  conflicts: Array<{
    employeeId: string
    fullName: string
    reason: "CHECKED_IN_WHILE_ON_LEAVE"
  }>
}

/** The payroll contract. Shape is frozen — see the attendance design doc. */
export interface MonthlyAttendanceSummary {
  employee: AttendanceEmployeeRef
  month: number
  year: number
  workingDays: number
  present: number
  absent: number
  onLeave: number
  notCheckedIn: number
  late: number
  earlyOut: number
  holidays: number
  weeklyOffs: number
  workedOnOffDays: number
  workedHours: number
  expectedHours: number
  shortfallHours: number
  missingCheckOut: number
  pendingApproval: number
  autoApproved: number
  regularised: number
  rejected: number
}

export interface HolidayItem {
  id: string
  name: string
  date: string
  type: HolidayType
}

export interface ImpactBlock {
  affectedEmployees: number
  affectedDates: string[]
  monthsTouched: string[]
}

export interface HolidayWriteResult {
  holiday: HolidayItem
  impact?: ImpactBlock
}

export interface AuditEntry {
  id: string
  action: string
  changedBy: string | null
  changedAt: string
  before: unknown
  after: unknown
  note: string | null
}

export interface BulkDecisionResult {
  id: string
  ok: boolean
  error?: string
}
