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
