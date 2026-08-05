/**
 * Receipt attachments over the shared media service.
 *
 * `CostAttachment` has a single owner — `costId` — so unlike
 * `AssetAttachment` there is no `CHECK` constraint and no `kind` field to
 * police: a receipt is a receipt.
 *
 * The parent bill is validated before `uploadBuffer` is ever called:
 * uploading first would leave an orphan blob in Cloudinary that nothing
 * points at. On delete, `destroyAsset` runs before the transaction opens —
 * a transaction held across a Cloudinary round-trip pins a connection-pool
 * slot. Both rules copied from `asset.media.ts`, the precedent this module
 * follows.
 *
 * Stored value is `publicId`, never a URL — delivery URLs are signed per
 * request via `signedDocumentUrl` and expire after `DOCUMENT_URL_TTL_SECONDS`
 * (300s), so a stored URL would be a dead link within minutes.
 */

import prisma from "../../config/prisma"
import type { CostAttachment } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { costPublicId, destroyAsset, signedDocumentUrl, uploadBuffer } from "../media/media.service"

/** The slice of Express.Multer.File this module needs. */
export interface UploadedFile {
  buffer: Buffer
  originalname: string
}

export interface ReceiptItem {
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
}): ReceiptItem {
  return {
    id: row.id,
    fileName: row.fileName,
    bytes: row.bytes,
    format: row.format,
    uploadedAt: row.uploadedAt.toISOString(),
  }
}

export async function uploadReceipt(
  costId: string,
  file: UploadedFile,
  actor: AccessTokenPayload
): Promise<CostAttachment> {
  const cost = await prisma.operatingCost.findUnique({ where: { id: costId }, select: { id: true } })
  if (!cost) throw new AppError(404, "Cost not found")

  const uploaded = await uploadBuffer(file.buffer, costPublicId(costId))

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.costAttachment.create({
        data: {
          costId,
          publicId: uploaded.publicId,
          fileName: file.originalname,
          bytes: uploaded.bytes,
          format: uploaded.format,
          uploadedBy: actor.sub,
        },
      })
      await writeAudit(tx, {
        entity: "COST",
        entityId: costId,
        action: "CREATE",
        changedBy: actor.sub,
        after: { fileName: file.originalname },
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

export async function listReceipts(costId: string): Promise<ReceiptItem[]> {
  const rows = await prisma.costAttachment.findMany({
    where: { costId },
    orderBy: { uploadedAt: "desc" },
  })
  return rows.map(toItem)
}

export async function getReceiptUrl(receiptId: string): Promise<{ url: string; expiresAt: string }> {
  const receipt = await prisma.costAttachment.findUnique({ where: { id: receiptId } })
  if (!receipt) throw new AppError(404, "Receipt not found")
  return signedDocumentUrl(receipt.publicId, receipt.format)
}

export async function deleteReceipt(receiptId: string, actor: AccessTokenPayload): Promise<void> {
  const receipt = await prisma.costAttachment.findUnique({ where: { id: receiptId } })
  if (!receipt) throw new AppError(404, "Receipt not found")

  // Destroy the Cloudinary blob before the row is deleted, and before the
  // transaction opens: the reverse order can orphan a blob nothing points
  // at, while this order can at worst leave a row pointing at an
  // already-destroyed asset, which the URL endpoint surfaces as a clean 404
  // rather than an invisible leak. It also keeps the transaction to DB-only
  // work — a slow or hanging Cloudinary call must not pin a
  // connection-pool slot.
  await destroyAsset(receipt.publicId)

  await prisma.$transaction(async (tx) => {
    await tx.costAttachment.delete({ where: { id: receiptId } })

    await writeAudit(tx, {
      entity: "COST",
      entityId: receipt.costId,
      action: "DELETE",
      changedBy: actor.sub,
      before: { fileName: receipt.fileName },
    })
  })
}
