/**
 * Account administration: the User row, not the Employee record.
 *
 * The split matters. `/admin/employees` owns employment — department,
 * designation, salary, exit. This owns the login: email, role, and whether
 * the account works at all. The three administrative roles have no Employee
 * row, so this is the only place they can be managed from.
 *
 * Nothing here hard-deletes. Deactivation (`isActive = false`) is the delete:
 * `auth.service` already refuses login, refresh and rotation on it, the row
 * and every foreign key to it survive, and it is reversible.
 */

import prisma from "../../config/prisma"
import type { Role } from "../../generated/prisma/client"

export interface UserAccount {
  id: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
  employee: { id: string; employeeCode: string; fullName: string } | null
}

/**
 * One select, every handler. `passwordHash` is absent by construction rather
 * than deleted afterwards — a shape built by spreading the row would ship it
 * the first time somebody adds a field.
 */
export const USER_ACCOUNT_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  employee: { select: { id: true, employeeCode: true, fullName: true } },
} as const

type UserRow = {
  id: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  createdAt: Date
  employee: { id: string; employeeCode: string; fullName: string } | null
}

function toAccount(row: UserRow): UserAccount {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
    employee: row.employee,
  }
}

export async function listUsers(): Promise<UserAccount[]> {
  const rows = await prisma.user.findMany({
    select: USER_ACCOUNT_SELECT,
    orderBy: { createdAt: "desc" },
  })
  return (rows as UserRow[]).map(toAccount)
}
