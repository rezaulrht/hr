import { randomUUID } from "node:crypto"

import { env } from "../../config/env"
import { getCloudinary } from "./media.provider"
import type { MediaKind, MediaLimits, UploadSignature } from "./media.types"

export const AVATAR_LIMITS: MediaLimits = {
  maxBytes: 5 * 1024 * 1024,
  allowedFormats: ["jpg", "jpeg", "png", "webp"],
}

export const DOCUMENT_LIMITS: MediaLimits = {
  maxBytes: 15 * 1024 * 1024,
  allowedFormats: ["pdf", "jpg", "jpeg", "png"],
}

export function avatarFolder(): string {
  return "hr/avatars"
}

export function documentFolder(employeeId: string): string {
  return `hr/documents/${employeeId}`
}

/**
 * Issues a signature for a direct browser upload.
 *
 * **The server chooses `folder` and `public_id`, and both are inside the
 * signature.** This is the load-bearing security property, not a detail:
 * `api_sign_request` signs whatever it is handed, so if the client supplied
 * the public id, anyone who can obtain a signature could sign an upload that
 * overwrites another employee's signed contract.
 *
 * `type: "authenticated"` is likewise signed. The SDK's `build_upload_params`
 * passes `type` through with no default, so omitting it yields a permanently
 * public CDN URL.
 */
export function createUploadSignature(kind: MediaKind, employeeId: string): UploadSignature {
  const cloudinary = getCloudinary()
  const timestamp = Math.floor(Date.now() / 1000)

  // Avatars use a stable id keyed on the employee, so a new photo replaces the
  // old one and no orphaned assets accumulate. Documents use a random id
  // because two contracts for the same person are two documents.
  const folder = kind === "AVATAR" ? avatarFolder() : documentFolder(employeeId)
  const publicId =
    kind === "AVATAR" ? `${folder}/${employeeId}` : `${folder}/${randomUUID()}`

  const paramsToSign = {
    timestamp,
    folder,
    public_id: publicId,
    type: "authenticated",
  }

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    env.CLOUDINARY_API_SECRET as string
  )

  const limits = kind === "AVATAR" ? AVATAR_LIMITS : DOCUMENT_LIMITS

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    apiKey: env.CLOUDINARY_API_KEY as string,
    timestamp,
    signature,
    folder,
    publicId,
    type: "authenticated",
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    maxBytes: limits.maxBytes,
    allowedFormats: limits.allowedFormats,
  }
}
