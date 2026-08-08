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
import { AppError } from "../../middleware/errorHandler"
import type { Role } from "../../generated/prisma/client"
import { generateTemporaryPassword, hashPassword } from "./auth.utils"
import { revokeAllUserTokens } from "./auth.service"

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

/**
 * An administrative account with no Employee record.
 *
 * The role is narrowed by `createUserSchema` to the three roles that have no
 * employment side. EMPLOYEE and REPORTING_MANAGER go through
 * POST /api/employees/staff, which collects the department, designation,
 * employment type and joining date an Employee row requires.
 *
 * The temporary password is returned exactly once, in this response. It is
 * never stored in plaintext and never retrievable afterwards — the same
 * contract createStaffAccount has.
 */
export async function createUser(input: {
  email: string
  role: Role
}): Promise<{ id: string; email: string; role: Role; temporaryPassword: string }> {
  const email = input.email.trim().toLowerCase()

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new AppError(409, "An account with that email already exists")

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)

  const user = await prisma.user.create({
    data: { email, passwordHash, role: input.role, mustChangePassword: true },
    select: { id: true, email: true, role: true },
  })

  return { id: user.id, email: user.email, role: user.role, temporaryPassword }
}

/**
 * Refuses to leave the system with nobody who can administer it.
 *
 * Counts ACTIVE super admins, not all of them: three super admins where two
 * are already deactivated is still one step from a locked system.
 *
 * Only checked when deactivating or demoting. Reactivating the second-to-last
 * admin is always safe, and running the count there would be a query that can
 * only ever pass.
 */
async function assertNotLastActiveSuperAdmin(user: { id: string; role: Role }): Promise<void> {
  if (user.role !== "SUPER_ADMIN") return
  const activeAdmins = await prisma.user.count({
    where: { role: "SUPER_ADMIN", isActive: true },
  })
  if (activeAdmins <= 1) {
    throw new AppError(409, "This is the last active super admin. Promote another one first.")
  }
}

/**
 * The soft delete. `isActive = false` locks the account out — auth.service
 * refuses login, refresh and rotation on it — while the row and every foreign
 * key to it survive, and the change is reversible.
 */
export async function setUserStatus(
  actorUserId: string,
  targetUserId: string,
  isActive: boolean
): Promise<UserAccount> {
  // Before the lookup: the caller does not need to exist for this to be wrong.
  if (!isActive && actorUserId === targetUserId) {
    throw new AppError(409, "You cannot deactivate your own account")
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: USER_ACCOUNT_SELECT,
  })
  if (!target) throw new AppError(404, "User not found")

  if (!isActive) await assertNotLastActiveSuperAdmin(target)

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive },
    select: USER_ACCOUNT_SELECT,
  })

  // The access token survives until it expires and the refresh cookie keeps
  // minting new ones, so without this the lockout does not take effect for
  // the length of a session.
  if (!isActive) await revokeAllUserTokens(targetUserId)

  return toAccount(updated as UserRow)
}
