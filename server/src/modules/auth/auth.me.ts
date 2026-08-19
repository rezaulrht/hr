/**
 * The account's own identity: the name it shows under, and the face beside it.
 *
 * Only meaningful for an account with no `Employee` row — Super Admin, HR
 * Admin and Finance Officer, who until now had neither. They appeared
 * throughout the product as a raw email address with two letters in a grey
 * square, and there was no screen anywhere that would let them change either.
 *
 * Staff are deliberately excluded. Their name is `Employee.fullName` and
 * their photo is `Employee.profilePicture`, both owned by HR — that is the
 * existing rule, and writing a second name onto the `User` row for them would
 * create two answers to "what is this person called".
 */

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { packAvatar, unpackAvatar, type UploadedFile } from "../employee/employee.media"
import { destroyAsset, signedAvatarUrl, uploadBuffer } from "../media/media.service"
import { Role } from "../../generated/prisma/client"

/** Distinct from the employee folder, so the two can never collide on an id. */
function userAvatarPublicId(userId: string): string {
  return `hr/avatars/users/${userId}`
}

const STAFF_ROLES: Role[] = [Role.EMPLOYEE, Role.REPORTING_MANAGER]

export interface AccountIdentity {
  displayName: string | null
  avatarUrl: string | null
}

/**
 * Refuses on a staff account rather than quietly writing a field nothing
 * reads. A 409 naming the reason is the difference between "this is not for
 * you" and "the save button is broken".
 */
async function assertHasNoEmployeeRecord(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) throw new AppError(404, "Account not found")
  if (user.employee !== null || STAFF_ROLES.includes(user.role)) {
    throw new AppError(
      409,
      "Your name and photo come from your employee record. HR maintains them."
    )
  }
}

export function projectAvatar(stored: string | null): string | null {
  if (!stored) return null
  const { publicId, version } = unpackAvatar(stored)
  return signedAvatarUrl(publicId, version)
}

export async function getIdentity(userId: string): Promise<AccountIdentity> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, avatarUrl: true },
  })
  if (!user) throw new AppError(404, "Account not found")
  return { displayName: user.displayName, avatarUrl: projectAvatar(user.avatarUrl) }
}

export async function setDisplayName(
  userId: string,
  displayName: string | null
): Promise<AccountIdentity> {
  await assertHasNoEmployeeRecord(userId)

  const trimmed = displayName?.trim() ?? ""
  const updated = await prisma.user.update({
    where: { id: userId },
    // Empty means "go back to showing my email", which is a real choice and
    // not the same as sending nothing.
    data: { displayName: trimmed === "" ? null : trimmed },
    select: { displayName: true, avatarUrl: true },
  })

  return { displayName: updated.displayName, avatarUrl: projectAvatar(updated.avatarUrl) }
}

export async function uploadOwnAvatar(
  userId: string,
  file: UploadedFile
): Promise<{ avatarUrl: string }> {
  await assertHasNoEmployeeRecord(userId)

  const asset = await uploadBuffer(file.buffer, userAvatarPublicId(userId))

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: packAvatar(asset.publicId, asset.version) },
      select: { id: true },
    })
  } catch (err) {
    // The same compensating cleanup the employee avatar path does: the asset
    // is already in Cloudinary, so a failure here must not strand it.
    await destroyAsset(asset.publicId)
    throw err
  }

  return { avatarUrl: signedAvatarUrl(asset.publicId, asset.version) }
}

export async function clearOwnAvatar(userId: string): Promise<{ avatarUrl: null }> {
  await assertHasNoEmployeeRecord(userId)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })
  // Already clear. Not an error — the button is idempotent by design, and a
  // 404 here would only be reachable by clicking twice.
  if (!user?.avatarUrl) return { avatarUrl: null }

  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
    select: { id: true },
  })

  // The row is authoritative, so this is cleanup rather than the change
  // itself: a Cloudinary failure must not leave the account showing a photo
  // the database says is gone.
  await destroyAsset(unpackAvatar(user.avatarUrl).publicId).catch((err) => {
    console.error("Failed to destroy account avatar asset", err)
  })

  return { avatarUrl: null }
}
