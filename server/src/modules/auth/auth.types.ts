import type { Role } from "../../generated/prisma/client"

export interface AccessTokenPayload {
  sub: string
  role: Role
  email: string
  mustChangePassword: boolean
}

export interface PublicUser {
  id: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  employeeCode?: string
}
