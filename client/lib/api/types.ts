// `export *` at the foot of this file re-exports payroll-types but does not
// bring its names into local scope, so Employee's structure ref imports it.
import type { Currency } from "./payroll-types"

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
  /** `null` is preflight blocker 3 waiting to happen — the directory says so. */
  salaryStructure: { id: string; name: string; currency: Currency } | null
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

export type LeaveAccrualBasis = "PRO_RATED" | "PER_EVENT" | "EARNED" | "NONE"

/** Which half of a working day. Mirrors the server's LeaveSession enum. */
export type LeaveSession = "FIRST_HALF" | "SECOND_HALF"

/**
 * The shift window a half day is measured against, for one date.
 *
 * Per date rather than per employee: a dated shift override (Ramadan hours)
 * moves the midpoint, so a window cached at login would be wrong for a leave
 * filed into that window.
 */
export interface HalfDayWindow {
  startTime: string
  midpoint: string
  endTime: string
}

export interface LeaveType {
  id: string
  /** Stable machine key (CASUAL, SICK, EARNED, MATERNITY, LWP, …). */
  code: string
  name: string
  isPaid: boolean
  annualQuota: number
  carryForwardPct: number
  maxConsecutive: number | null
  allowsBackdating: boolean
  eligibleFor: EmploymentType[]
  /** Granted by the Bangladesh Labour Act rather than by company policy. */
  statutory: boolean
  /**
   * §117(3): holidays inside an earned-leave period are part of the leave, so
   * the day-count preview must charge calendar days for these types and
   * working days for every other one.
   */
  countsHolidays: boolean
  accrualBasis: LeaveAccrualBasis
  minServiceMonths: number
  maxAccrual: number | null
  /** Whether a request against this type may be a half day. */
  allowsHalfDay: boolean
}

export interface DecidedBy {
  id: string
  email: string
  fullName: string | null
}

export interface LeaveRequestItem {
  id: string
  employee: { id: string; fullName: string; employeeCode: string }
  leaveType: { id: string; code: string; name: string; isPaid: boolean }
  startDate: string
  endDate: string
  startSession: LeaveSession
  endSession: LeaveSession
  days: number
  reason: string | null
  status: LeaveStatus
  decidedBy: DecidedBy | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
}

/** Where an earned-leave entitlement came from. Only on EARNED types. */
export interface AccrualDetail {
  daysWorked: number
  perDaysWorked: number
  windowStart: string
  windowEnd: string
  /** Days in the window that predate attendance tracking, so are unknown. */
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
  /** Defaulted server-side, so these are only optional to callers. */
  startSession?: LeaveSession
  endSession?: LeaveSession
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

export type AttendanceApproval = "PENDING" | "APPROVED" | "REJECTED"

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
  /**
   * How much of this day is leave: 0, 0.5 or 1. Emitted regardless of
   * status — a half-day is PRESENT *and* partly leave at the same time.
   */
  leaveFraction: number
  /**
   * What the unworked portion of a partial-leave day counts as, when nobody
   * punched. Null when there is no partial leave or an attendance row exists.
   */
  unservedStatus: "ABSENT" | "NOT_CHECKED_IN" | null
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
  approved: number
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

// ── EVENT LOG ─────────────────────────────────
// Hand-mirrored from server/src/modules/event/event.types.ts.

export type EventSeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR"

export interface EventItem {
  id: string
  type: string
  severity: EventSeverity
  entity: string
  entityId: string
  title: string
  meta: string | null
  /**
   * **Role-agnostic** — `"/leave"`, not `"/employee/leave"`. One event row is
   * read by an employee, their manager and HR, so the client prefixes it with
   * its own route group.
   */
  href: string | null
  createdAt: string
}

export interface EventPage {
  items: EventItem[]
  nextCursor: string | null
}

// ── ANNOUNCEMENTS ─────────────────────────────

export type AnnouncementAudience = "ALL" | "DEPARTMENT" | "ROLE"

export interface AnnouncementItem {
  id: string
  title: string
  body: string
  audience: AnnouncementAudience
  departmentId: string | null
  departmentName: string | null
  targetRole: Role | null
  publishedBy: string
  /** Null is a draft; a future instant is scheduled. */
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateAnnouncementInput {
  title: string
  body: string
  audience: AnnouncementAudience
  departmentId?: string
  targetRole?: Role
  /** Omit to publish now; explicit `null` keeps it a draft. */
  publishedAt?: string | null
}

export type UpdateAnnouncementInput = Partial<CreateAnnouncementInput>

// ── DASHBOARD ─────────────────────────────────
// Hand-mirrored from server/src/modules/dashboard/dashboard.types.ts.

export type Tone = "green" | "yellow" | "red" | "neutral"

export interface DashboardStat {
  label: string
  /** Pre-formatted, money included. Never a raw number. */
  value: string
  sub: string
  tag: string
  tone: Tone
  /** Absent when the stat has no stored history, which is most of them. */
  trend?: number[]
  hotBar?: number
  href?: string
  failed?: boolean
}

export interface ChartBar {
  label: string
  display: string
  height: number
}

export interface DashboardTableCell {
  text?: string
  sub?: string
  weight?: number
  tag?: string
  tone?: Tone
}

export interface DashboardActivityItem {
  initial: string
  tone: Tone
  title: string
  meta: string
  status?: string
  statusTone?: Tone
  time: string
}

export interface TimeClockState {
  checkedIn: boolean
  /** The server's instant. Never re-seed a ticking clock from `new Date()`. */
  serverNow: string
  shift: string
  checkIn: string | null
  checkOut: string | null
  hoursToday: number | null
  canCheckIn: boolean
  canCheckOut: boolean
  detail: string | null
}

export interface DashboardPayload {
  role: Role
  greeting: {
    kicker: string
    heading: string
    sub: string
    cta: { label: string; href: string }
  }
  stats: DashboardStat[]
  chart?: { title: string; sub: string; bars: ChartBar[] }
  table?: {
    title: string
    headers: string[]
    rows: DashboardTableCell[][]
    href: string
  }
  feed?: DashboardActivityItem[]
  timeClock?: TimeClockState
  /** Nav badge counts keyed by nav href. */
  badges: Record<string, number>
}

// Payroll, expense and settlement types live in their own file; re-exported
// here so importers see a single module.
export * from "./payroll-types"

// ── DOCUMENTS & AVATAR ────────────────────────
// Hand-mirrored from server/src/modules/employee/employee.media.ts and the
// Prisma DocumentType enum.

export type DocumentType =
  | "CONTRACT"
  | "NID"
  | "CERTIFICATE"
  | "OFFER_LETTER"
  | "RESIGNATION"
  | "OTHER"

export interface DocumentItem {
  id: string
  type: DocumentType
  fileName: string
  bytes: number
  format: string
  uploadedAt: string
}

export interface SignedDocumentUrl {
  url: string
  expiresAt: string
}
