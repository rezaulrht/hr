/**
 * Photo and document attachments over the shared media service.
 *
 * `AssetAttachment` rows carry exactly one of `assetId` / `assignmentId` — an
 * asset-level file (photo, invoice, warranty) or a handover-level one
 * (condition-in/out photos). The database enforces that with a `CHECK`
 * constraint; this module enforces the matching rule that the *kind* agrees
 * with which column is set, because the CHECK alone would happily accept a
 * `CONDITION_OUT` row hanging off an asset.
 *
 * Condition photos upload into the **asset's** Cloudinary folder even though
 * the row is assignment-scoped — an assignment is a moment and the asset is
 * the thing, so grouping by asset keeps every photograph of one laptop
 * together (see `assetFolderPrefix` in `media.service.ts`).
 *
 * The parent row (asset or assignment) is validated before `uploadBuffer` is
 * ever called: uploading first would leave an orphan blob in Cloudinary that
 * nothing points at, exactly the failure `employee.media.ts`'s
 * `uploadDocument` avoids for the same reason.
 *
 * Stored value is `publicId`, never a URL — delivery URLs are signed per
 * request via `signedDocumentUrl` and expire after `DOCUMENT_URL_TTL_SECONDS`
 * (300s), so a stored URL would be a dead link within minutes.
 */

import prisma from "../../config/prisma"
import type { AssetAttachment, AssetAttachmentKind } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { assetPublicId, destroyAsset, signedDocumentUrl, uploadBuffer } from "../media/media.service"

/** The slice of Express.Multer.File this module needs. */
export interface UploadedFile {
  buffer: Buffer
  originalname: string
}

export interface AttachmentItem {
  id: string
  kind: AssetAttachmentKind
  fileName: string
  bytes: number
  format: string
  uploadedAt: string
}

const ASSET_LEVEL_KINDS: AssetAttachmentKind[] = ["PHOTO", "INVOICE", "WARRANTY"]
const ASSIGNMENT_LEVEL_KINDS: AssetAttachmentKind[] = ["CONDITION_OUT", "CONDITION_IN"]

function toItem(row: {
  id: string
  kind: AssetAttachmentKind
  fileName: string
  bytes: number
  format: string
  uploadedAt: Date
}): AttachmentItem {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.fileName,
    bytes: row.bytes,
    format: row.format,
    uploadedAt: row.uploadedAt.toISOString(),
  }
}

export async function uploadAssetAttachment(
  assetId: string,
  kind: AssetAttachmentKind,
  file: UploadedFile,
  actor: AccessTokenPayload
): Promise<AssetAttachment> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } })
  if (!asset) throw new AppError(404, "Asset not found")
  if (!ASSET_LEVEL_KINDS.includes(kind)) {
    throw new AppError(400, `${kind} is a handover attachment and cannot be uploaded to an asset`)
  }

  const uploaded = await uploadBuffer(file.buffer, assetPublicId(assetId))

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.assetAttachment.create({
        data: {
          assetId,
          assignmentId: null,
          kind,
          publicId: uploaded.publicId,
          fileName: file.originalname,
          bytes: uploaded.bytes,
          format: uploaded.format,
          uploadedBy: actor.sub,
        },
      })
      await writeAudit(tx, {
        entity: "ASSET",
        entityId: assetId,
        action: "CREATE",
        changedBy: actor.sub,
        after: { kind, fileName: file.originalname },
      })
      return created
    })
  } catch (err) {
    // The blob already exists in Cloudinary at this point; a persist failure
    // here must not leave it dangling with no row pointing at it.
    await destroyAsset(uploaded.publicId)
    throw err
  }
}

export async function uploadAssignmentAttachment(
  assignmentId: string,
  kind: AssetAttachmentKind,
  file: UploadedFile,
  actor: AccessTokenPayload
): Promise<AssetAttachment> {
  const assignment = await prisma.assetAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, assetId: true },
  })
  if (!assignment) throw new AppError(404, "Assignment not found")
  if (!ASSIGNMENT_LEVEL_KINDS.includes(kind)) {
    throw new AppError(400, `${kind} is an asset attachment and cannot be uploaded to a handover`)
  }

  const uploaded = await uploadBuffer(file.buffer, assetPublicId(assignment.assetId))

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.assetAttachment.create({
        data: {
          assetId: null,
          assignmentId,
          kind,
          publicId: uploaded.publicId,
          fileName: file.originalname,
          bytes: uploaded.bytes,
          format: uploaded.format,
          uploadedBy: actor.sub,
        },
      })
      await writeAudit(tx, {
        entity: "ASSET_ASSIGNMENT",
        entityId: assignmentId,
        action: "CREATE",
        changedBy: actor.sub,
        after: { kind, fileName: file.originalname },
      })
      return created
    })
  } catch (err) {
    await destroyAsset(uploaded.publicId)
    throw err
  }
}

export async function listAttachments(
  filter: { assetId: string } | { assignmentId: string }
): Promise<AttachmentItem[]> {
  const rows = await prisma.assetAttachment.findMany({
    where: "assetId" in filter ? { assetId: filter.assetId } : { assignmentId: filter.assignmentId },
    orderBy: { uploadedAt: "desc" },
  })
  return rows.map(toItem)
}

export async function getAttachmentUrl(
  attachmentId: string
): Promise<{ url: string; expiresAt: string }> {
  const attachment = await prisma.assetAttachment.findUnique({ where: { id: attachmentId } })
  if (!attachment) throw new AppError(404, "Attachment not found")
  return signedDocumentUrl(attachment.publicId, attachment.format)
}

export async function deleteAttachment(attachmentId: string, actor: AccessTokenPayload): Promise<void> {
  const attachment = await prisma.assetAttachment.findUnique({ where: { id: attachmentId } })
  if (!attachment) throw new AppError(404, "Attachment not found")

  // Destroy the Cloudinary blob before the row is deleted, and before the
  // transaction opens: the reverse order can orphan a blob nothing points
  // at, while this order can at worst leave a row pointing at an
  // already-destroyed asset, which the URL endpoint surfaces as a clean 404
  // rather than an invisible leak. It also keeps the transaction to DB-only
  // work, matching `employee.media.ts`'s `deleteDocument` — a slow or
  // hanging Cloudinary call must not pin a connection-pool slot.
  await destroyAsset(attachment.publicId)

  await prisma.$transaction(async (tx) => {
    await tx.assetAttachment.delete({ where: { id: attachmentId } })

    await writeAudit(tx, {
      entity: attachment.assetId ? "ASSET" : "ASSET_ASSIGNMENT",
      entityId: (attachment.assetId ?? attachment.assignmentId) as string,
      action: "DELETE",
      changedBy: actor.sub,
      before: { kind: attachment.kind, fileName: attachment.fileName },
    })
  })
}
