import { env } from "../../config/env"
import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { Role } from "../../generated/prisma"
import { generateOpaqueToken, hashPassword, hashToken, signAccessToken, toPublicUser, verifyPassword } from "./auth.utils"
import { sendPasswordResetEmail } from "./mailer"
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

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
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
  if (!stored.user.isActive) {
    throw new AppError(403, "This account has been deactivated")
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

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return // don't reveal whether the email exists
  }
  const raw = generateOpaqueToken()
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  })
  const resetLink = `${env.CLIENT_ORIGIN}/reset-password?token=${raw}`
  await sendPasswordResetEmail(email, resetLink)
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken)
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!stored) {
    throw new AppError(400, "Invalid or expired reset token")
  }
  if (stored.usedAt) {
    throw new AppError(400, "This reset token has already been used")
  }
  if (stored.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, "This reset token has expired")
  }

  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: stored.userId },
    data: { passwordHash, mustChangePassword: false },
  })
  await prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } })
  await revokeAllUserTokens(stored.userId)
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new AppError(404, "User not found")
  }
  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    throw new AppError(401, "Current password is incorrect")
  }
  const passwordHash = await hashPassword(newPassword)
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  })
  // Revoke every existing session (e.g. one stolen alongside the old password), then
  // issue a fresh refresh token so the caller's own session survives the revocation.
  await revokeAllUserTokens(userId)
  const refreshToken = await issueRefreshToken(userId)
  const accessToken = signAccessToken({
    sub: updated.id,
    role: updated.role,
    email: updated.email,
    mustChangePassword: false,
  })
  return { accessToken, refreshToken, user: toPublicUser(updated) }
}
