export interface CreateStaffAccountInput {
  fullName: string
  email: string
  role: "EMPLOYEE" | "REPORTING_MANAGER"
  designation: string
  departmentId: string
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN"
  joiningDate: string
  reportingManagerId?: string
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
}
