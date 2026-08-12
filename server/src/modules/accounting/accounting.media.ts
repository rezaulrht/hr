/**
 * Supporting documents on a journal, over the shared media service.
 *
 * Deliberately allowed on a POSTED journal (Decision 10): a receipt that
 * arrives a week after the entry is normal, and attaching a file changes no
 * accounting figure. Both directions are audited against the journal, so
 * "who added this evidence, and when" is answerable.
 *
 * The two ordering rules are copied from cost.media.ts, which took them from
 * asset.media.ts: validate the parent *before* uploadBuffer, so a bad id
 * cannot leave an orphan blob in Cloudinary; and destroyAsset *before* the
 * transaction opens, so a slow Cloudinary round-trip cannot pin a
 * connection-pool slot.
 */

import prisma from "../../config/prisma"
import type { JournalAttachment } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import {
  destroyAsset,
  journalPublicId,
  signedDocumentUrl,
  uploadBuffer,
} from "../media/media.service"

/** The slice of Express.Multer.File this module needs. */
export interface UploadedFile {
  buffer: Buffer
  originalname: string
}

export interface AttachmentItem {
  id: string
  fileName: string
  bytes: number
  format: string
  uploadedAt: string
}

function toItem(row: {
  id: string
  fileName: string
  bytes: number
  format: string
  uploadedAt: Date
}): AttachmentItem {
  return {
    id: row.id,
    fileName: row.fileName,
    bytes: row.bytes,
    format: row.format,
    uploadedAt: row.uploadedAt.toISOString(),
  }
}

export async function uploadJournalAttachment(
  journalId: string,
  file: UploadedFile,
  actor: AccessTokenPayload
): Promise<JournalAttachment> {
  const journal = await prisma.journal.findUnique({
    where: { id: journalId },
    select: { id: true },
  })
  if (!journal) throw new AppError(404, "Journal not found")

  const uploaded = await uploadBuffer(file.buffer, journalPublicId(journalId))

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.journalAttachment.create({
        data: {
          journalId,
          publicId: uploaded.publicId,
          fileName: file.originalname,
          bytes: uploaded.bytes,
          format: uploaded.format,
          uploadedBy: actor.sub,
        },
      })

      await writeAudit(tx, {
        entity: "JOURNAL",
        entityId: journalId,
        action: "CREATE",
        changedBy: actor.sub,
        after: { fileName: file.originalname },
        note: "Attachment added",
      })

      return created
    })
  } catch (err) {
    // The blob exists in Cloudinary by now; a persist failure must not leave
    // it dangling with no row pointing at it.
    await destroyAsset(uploaded.publicId)
    throw err
  }
}

export async function listJournalAttachments(journalId: string): Promise<AttachmentItem[]> {
  const rows = await prisma.journalAttachment.findMany({
    where: { journalId },
    orderBy: { uploadedAt: "desc" },
  })
  return rows.map(toItem)
}

export async function getJournalAttachmentUrl(
  attachmentId: string
): Promise<{ url: string; expiresAt: string }> {
  const attachment = await prisma.journalAttachment.findUnique({ where: { id: attachmentId } })
  if (!attachment) throw new AppError(404, "Attachment not found")
  return signedDocumentUrl(attachment.publicId, attachment.format)
}

export async function deleteJournalAttachment(
  attachmentId: string,
  actor: AccessTokenPayload
): Promise<void> {
  const attachment = await prisma.journalAttachment.findUnique({ where: { id: attachmentId } })
  if (!attachment) throw new AppError(404, "Attachment not found")

  await destroyAsset(attachment.publicId)

  await prisma.$transaction(async (tx) => {
    await tx.journalAttachment.delete({ where: { id: attachmentId } })

    await writeAudit(tx, {
      entity: "JOURNAL",
      entityId: attachment.journalId,
      action: "DELETE",
      changedBy: actor.sub,
      before: { fileName: attachment.fileName },
      note: "Attachment removed",
    })
  })
}
