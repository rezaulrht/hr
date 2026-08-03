export interface CreateStaffAccountInput {
  fullName: string
  email: string
  role: "EMPLOYEE" | "REPORTING_MANAGER"
  designation: string
  departmentId: string
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN"
  joiningDate: string
  reportingManagerId?: string
  shiftId?: string
}

export interface CreateStaffAccountResult {
  employeeCode: string
  temporaryPassword: string
  fullName: string
  email: string
}

export interface EmployeeListItem {
  id: string
  employeeCode: string
  fullName: string
  email: string
  designation: string
  department: { id: string; name: string }
  employmentType: CreateStaffAccountInput["employmentType"]
  employmentStatus: "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED"
  joiningDate: string
  /**
   * `null` reads as preflight blocker 3 waiting to happen, so the directory
   * shows it rather than making HR discover it when a run refuses to process.
   */
  salaryStructure: { id: string; name: string; currency: "BDT" | "USD" } | null
}

import type {
  EmploymentStatus,
  EmploymentType,
  ExitReason,
} from "../../generated/prisma/client"
import type { DocumentItem } from "./employee.media"

export interface WorkIdentity {
  fullName: string
  designation: string
  department: { id: string; name: string }
  reportingManager: { id: string; fullName: string } | null
  email: string
  phone: string | null
  avatarUrl: string | null
}

export interface PersonalIdentity {
  dateOfBirth: string | null
  gender: string | null
  nationalId: string | null
  bloodGroup: string | null
  maritalStatus: string | null
}

export interface ContactDetails {
  presentAddress: string | null
  permanentAddress: string | null
  emergencyContact: string | null
}

export interface EmploymentDetails {
  employeeCode: string
  employmentType: EmploymentType
  employmentStatus: EmploymentStatus
  joiningDate: string
  officeLocation: string | null
  shift: { id: string; name: string } | null
  /** FULL only. A biometric enrolment id the employee cannot act on. */
  deviceUserId?: string | null
}

export interface PayrollDetails {
  salaryStructure: { id: string; name: string; currency: "BDT" | "USD" } | null
  bankAccountNumber: string | null
  bankName: string | null
  bankRoutingNumber: string | null
}

export interface ExitDetailsView {
  lastWorkingDay: string
  exitReason: ExitReason
  exitNote: string | null
}

export interface Blocker {
  field: string
  blocks: string
}

/**
 * Every group key is optional on purpose.
 *
 * A COLLEAGUE payload genuinely does not contain a `personal` key, and making
 * that structural means a component reading `employee.payroll.bankName`
 * without a guard fails `tsc` rather than crashing at runtime for a viewer
 * whose tier never had it.
 */
export interface EmployeeView {
  id: string
  work: WorkIdentity
  personal?: PersonalIdentity
  contact?: ContactDetails
  employment?: EmploymentDetails
  payroll?: PayrollDetails
  exit?: ExitDetailsView | null
  documents?: DocumentItem[]
  blockers?: Blocker[]
  /** From `writableFieldsFor(tier)`. The client renders controls from this. */
  editableFields: string[]
}

export interface MyProfileResponse {
  account: { email: string; role: string; mustChangePassword: boolean }
  employee: EmployeeView | null
}
