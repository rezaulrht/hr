import type {
  AttendanceApproval,
  AttendanceSource,
  EmploymentStatus,
  HolidayType,
} from "../../generated/prisma/client"

/**
 * Derived on read, never stored — hence a TS union rather than a Prisma
 * enum, since most of these values are never written to the database. Same
 * reasoning as `TeamStatus` in `leave.types.ts`.
 *
 * `NOT_CHECKED_IN` is deliberately not called PENDING: `AttendanceApproval`
 * already has a PENDING that means something entirely different (a decision
 * nobody has made, versus a punch nobody has made).
 */
export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKLY_OFF"
  | "NOT_CHECKED_IN"
  | "NOT_TRACKED"

export interface ShiftInfo {
  id: string
  name: string
  startTime: string
  endTime: string
  breakMinutes: number
  graceMinutes: number
  weeklyOffDays: number[]
  /**
   * Elapsed hours from start to end. The lunch/break sits *inside* this
   * span, so it is never subtracted anywhere — the expectation and the
   * measurement are both elapsed time and compare directly.
   */
  expectedHours: number
}

export interface AttendanceDay {
  /** YYYY-MM-DD, office-local. */
  date: string
  status: AttendanceStatus
  /**
   * A scheduled working day: not a holiday, not a weekly off, and tracked.
   * Independent of whether anybody turned up, so a check-in on a holiday is
   * PRESENT with `isWorkingDay: false` — that day is `workedOnOffDays`, not
   * a working day the roster expected.
   */
  isWorkingDay: boolean
  /** A holiday or weekly off, regardless of whether it was worked. */
  isOffDay: boolean
  /**
   * Why it is an off day. Kept explicit rather than inferred from `detail`,
   * which also carries leave-type names — leave taken on a Friday would
   * otherwise be miscounted as a holiday.
   */
  isHoliday: boolean
  isWeeklyOff: boolean
  /** ISO instants, or null when nobody punched. */
  checkIn: string | null
  checkOut: string | null
  /** Elapsed hours. Null when the check-out is missing — never guessed. */
  workedHours: number | null
  /** The shift span for this day; 0 when it is not a working day. */
  expectedHours: number
  isLate: boolean
  isEarlyOut: boolean
  approval: AttendanceApproval | null
  source: AttendanceSource | null
  /** Leave type or holiday name, so a status can explain itself. */
  detail: string | null
  regularised: boolean
  corrected: boolean
  attendanceId: string | null
}

/** The employee fields the grid needs. Kept narrow so tests can fake it. */
export interface GridEmployee {
  id: string
  joiningDate: Date
  employmentStatus: EmploymentStatus
  shiftId: string | null
}

export interface EmployeeRef {
  id: string
  fullName: string
  employeeCode: string
  designation: string
}

export interface HolidayItem {
  id: string
  name: string
  date: string
  type: HolidayType
}

export interface TodayAttendance {
  /**
   * Anchors the client's ticking clock. Without it every punch card is only
   * as accurate as the laptop it runs on — a machine three minutes fast
   * shows "09:14, you're on time" while the server records 09:17 and flags
   * a late arrival that the UI said would not happen.
   */
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
  /** Set when today is a holiday, a weekly off, or covered by approved leave. */
  detail: string | null
}

/**
 * A punch, plus the derived context the card needs to explain itself —
 * "you're working a holiday", "you have approved leave today" — without a
 * second round trip.
 */
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

export interface DailySummaryRow {
  employee: EmployeeRef
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
  /**
   * Checking in while on approved leave is allowed, not blocked — a 409
   * would leave someone who genuinely came in unable to record real work.
   * It surfaces here instead, for a human to resolve.
   */
  conflicts: Array<{
    employeeId: string
    fullName: string
    reason: "CHECKED_IN_WHILE_ON_LEAVE"
  }>
}

/**
 * The payroll contract. Payroll imports `getMonthlySummary` rather than
 * re-deriving from `Attendance` rows: status is computed, so that function
 * *is* the source of truth, and a second implementation of the day grid
 * would drift with the untested one living in payroll.
 */
export interface MonthlyAttendanceSummary {
  employee: EmployeeRef
  month: number
  year: number
  /** Scheduled working days: range minus weekly offs and holidays, plus
   *  WORKING_DAY overrides, clipped to employment and go-live. */
  workingDays: number
  present: number
  absent: number
  onLeave: number
  /** Working days that have not happened yet (today or later). */
  notCheckedIn: number
  late: number
  earlyOut: number
  holidays: number
  weeklyOffs: number
  /** Check-ins on a holiday or weekly off. Outside the working-day identity. */
  workedOnOffDays: number
  workedHours: number
  expectedHours: number
  shortfallHours: number
  missingCheckOut: number
  /** Payroll gate: a month with any of these must not be run. */
  pendingApproval: number
  autoApproved: number
  regularised: number
  rejected: number
}
