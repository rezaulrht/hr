import { env } from "../../config/env"
import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { Role } from "../../generated/prisma"
import { generateOpaqueToken, hashToken, signAccessToken, toPublicUser, verifyPassword } from "./auth.utils"
import type { PublicUser } from "./auth.types"

export interface SessionResult {
  accessToken: string
  refreshToken: string
  user: PublicUser
}

type UserRow = {
  id: string
  email: string
  passwordHash: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
}

const STAFF_ROLES: Role[] = [Role.EMPLOYEE, Role.REPORTING_MANAGER]

function refreshExpiryDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_EXPIRY)
  const amount = match ? Number(match[1]) : 7
  const unit = match ? match[2] : "d"
  const msPerUnit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000
  return new Date(Date.now() + amount * msPerUnit)
}

async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateOpaqueToken()
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt: refreshExpiryDate() },
  })
  return raw
}

async function issueSession(user: UserRow, employeeCode?: string): Promise<SessionResult> {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
  })
  const refreshToken = await issueRefreshToken(user.id)
  return { accessToken, refreshToken, user: toPublicUser(user, employeeCode) }
}

export async function loginAdmin(email: string, password: string): Promise<SessionResult> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new AppError(401, "Invalid email or password")
  }
  if (STAFF_ROLES.includes(user.role)) {
    throw new AppError(401, "Invalid email or password")
  }
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw new AppError(401, "Invalid email or password")
  }
  if (!user.isActive) {
    throw new AppError(403, "This account has been deactivated")
  }
  return issueSession(user)
}

export async function loginStaff(employeeId: string, password: string): Promise<SessionResult> {
  const employee = await prisma.employee.findUnique({
    where: { employeeCode: employeeId },
    include: { user: true },
  })
  if (!employee) {
    throw new AppError(401, "Invalid ID or password")
  }
  const user = employee.user
  if (!STAFF_ROLES.includes(user.role)) {
    throw new AppError(401, "Invalid ID or password")
  }
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw new AppError(401, "Invalid ID or password")
  }
  if (!user.isActive) {
    throw new AppError(403, "This account has been deactivated")
  }
  return issueSession(user, employee.employeeCode)
}

export async function refresh(rawRefreshToken: string): Promise<SessionResult> {
  const tokenHash = hashToken(rawRefreshToken)
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })
  if (!stored) {
    throw new AppError(401, "Invalid refresh token")
  }
  if (stored.revokedAt) {
    throw new AppError(401, "Refresh token has been revoked")
  }
  if (stored.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, "Refresh token has expired")
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })

  let employeeCode: string | undefined
  if (STAFF_ROLES.includes(stored.user.role)) {
    const employee = await prisma.employee.findUnique({ where: { userId: stored.user.id } })
    employeeCode = employee?.employeeCode
  }

  const newRefreshToken = await issueRefreshToken(stored.user.id)
  const accessToken = signAccessToken({
    sub: stored.user.id,
    role: stored.user.role,
    email: stored.user.email,
    mustChangePassword: stored.user.mustChangePassword,
  })
  return { accessToken, refreshToken: newRefreshToken, user: toPublicUser(stored.user, employeeCode) }
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken)
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } })
  if (!stored) {
    return
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })
}
