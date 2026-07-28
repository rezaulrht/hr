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
