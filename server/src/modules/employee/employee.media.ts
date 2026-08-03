import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { auditPayroll } from "../payroll/payroll.audit"
import {
  avatarPublicId,
  destroyAsset,
  documentPublicId,
  signedAvatarUrl,
  signedDocumentUrl,
  uploadBuffer,
} from "../media/media.service"
import type { DocumentType } from "../../generated/prisma/client"

/** The slice of Express.Multer.File this module needs. */
export interface UploadedFile {
  buffer: Buffer
  originalname: string
}

export interface DocumentItem {
  id: string
  type: DocumentType
  fileName: string
  bytes: number
  format: string
  uploadedAt: string
}

/**
 * `profilePicture` stores `publicId#version`, not a URL.
 *
 * The version is needed because the avatar public id is stable per employee: a
 * re-upload replaces the asset behind an unchanged URL and a CDN keeps serving
 * the old image. Packing it into one column avoids a migration for a second.
 */
export function packAvatar(publicId: string, version: number): string {
  return `${publicId}#${version}`
}

export function unpackAvatar(stored: string): { publicId: string; version?: number } {
  const hash = stored.lastIndexOf("#")
  if (hash === -1) return { publicId: stored }
  const version = Number(stored.slice(hash + 1))
  // `Number("")` is `0`, which is finite — a trailing `#` with nothing after
  // it must not be read as a real version 0.
  if (!Number.isInteger(version) || version <= 0) return { publicId: stored }
  return { publicId: stored.slice(0, hash), version }
}

export async function listDocuments(employeeId: string): Promise<DocumentItem[]> {
  const rows = await prisma.document.findMany({
    where: { employeeId },
    orderBy: { uploadedAt: "desc" },
  })
  return rows.map((d) => ({
    id: d.id,
    type: d.type,
    fileName: d.fileName,
    bytes: d.bytes,
    format: d.format,
    uploadedAt: d.uploadedAt.toISOString(),
  }))
}

/**
 * Uploads then persists.
 *
 * No verification step: the server performed the upload, so Cloudinary's
 * response is the authoritative source of `bytes` and `format`. The client's
 * multipart headers are never consulted for either.
 */
export async function uploadDocument(
  employeeId: string,
  actorUserId: string,
  file: UploadedFile,
  type: DocumentType
): Promise<DocumentItem> {
  // Before the upload, not just before the write: a stale employee id (the
  // record was deleted between page load and submit) should cost no upload
  // at all, not an upload followed by a foreign-key-violation 500.
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  })
  if (!employee) throw new AppError(404, "Employee not found")

  const asset = await uploadBuffer(file.buffer, documentPublicId(employeeId))

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          employeeId,
          type,
          publicId: asset.publicId,
          // What the uploader called it: the public id is a UUID and HR needs to
          // tell two certificates apart in a list.
          fileName: file.originalname,
          bytes: asset.bytes,
          format: asset.format,
          uploadedBy: actorUserId,
        },
      })
      await auditPayroll(tx, {
        entity: "EMPLOYEE_DOCUMENT",
        entityId: created.id,
        action: "CREATE",
        changedBy: actorUserId,
        after: { type, fileName: file.originalname },
      })
      return {
        id: created.id,
        type: created.type,
        fileName: created.fileName,
        bytes: created.bytes,
        format: created.format,
        uploadedAt: created.uploadedAt.toISOString(),
      }
    })
  } catch (err) {
    // The asset already exists in Cloudinary at this point; a persist
    // failure here must not leave it dangling with no row pointing at it.
    // Mirrors the rule `destroyAsset` states for deletion: a dangling row is
    // recoverable, a dangling asset is invisible.
    await destroyAsset(asset.publicId)
    throw err
  }
}

export async function getDocumentUrl(
  employeeId: string,
  documentId: string
): Promise<{ url: string; expiresAt: string }> {
  // Scoped to the employee, not looked up by id alone: otherwise a document id
  // belonging to somebody else would resolve for a caller authorised for THIS
  // employee.
  const doc = await prisma.document.findFirst({ where: { id: documentId, employeeId } })
  if (!doc) throw new AppError(404, "Document not found")
  return signedDocumentUrl(doc.publicId, doc.format)
}

export async function deleteDocument(
  employeeId: string,
  documentId: string,
  actorUserId: string
): Promise<void> {
  const doc = await prisma.document.findFirst({ where: { id: documentId, employeeId } })
  if (!doc) throw new AppError(404, "Document not found")

  // Asset first. The reverse order can orphan a paid asset with no record that
  // it exists; this order can at worst leave a row pointing at a destroyed
  // asset, which the URL endpoint surfaces as a clean 404.
  await destroyAsset(doc.publicId)

  await prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: documentId } })
    await auditPayroll(tx, {
      entity: "EMPLOYEE_DOCUMENT",
      entityId: documentId,
      action: "DELETE",
      changedBy: actorUserId,
      before: { type: doc.type, fileName: doc.fileName },
    })
  })
}

export async function uploadAvatar(
  employeeId: string,
  actorUserId: string,
  file: UploadedFile
): Promise<{ avatarUrl: string | null }> {
  // Same existence check `clearAvatar` already does, and for the same
  // reason: a bad id should 404 before any upload happens, not after.
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  })
  if (!employee) throw new AppError(404, "Employee not found")

  const asset = await uploadBuffer(file.buffer, avatarPublicId(employeeId))

  try {
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: { profilePicture: packAvatar(asset.publicId, asset.version) },
        select: { profilePicture: true },
      })
      await auditPayroll(tx, {
        entity: "EMPLOYEE_PROFILE",
        entityId: employeeId,
        action: "UPDATE",
        changedBy: actorUserId,
        after: { profilePicture: "updated" },
      })
    })
  } catch (err) {
    // Same compensating cleanup as uploadDocument: the asset is already in
    // Cloudinary, so a persist failure here must not leave it dangling.
    await destroyAsset(asset.publicId)
    throw err
  }

  return { avatarUrl: signedAvatarUrl(asset.publicId, asset.version) }
}

export async function clearAvatar(
  employeeId: string,
  actorUserId: string
): Promise<{ avatarUrl: null }> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { profilePicture: true },
  })
  if (!employee) throw new AppError(404, "Employee not found")

  if (employee.profilePicture !== null) {
    await destroyAsset(unpackAvatar(employee.profilePicture).publicId)
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId },
      data: { profilePicture: null },
      select: { profilePicture: true },
    })
    await auditPayroll(tx, {
      entity: "EMPLOYEE_PROFILE",
      entityId: employeeId,
      action: "UPDATE",
      changedBy: actorUserId,
      after: { profilePicture: "cleared" },
    })
  })

  return { avatarUrl: null }
}
