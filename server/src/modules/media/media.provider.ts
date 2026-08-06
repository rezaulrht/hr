/**
 * The configured Cloudinary client, and the only file in the codebase that
 * imports `cloudinary`.
 *
 * Isolated deliberately, in the same spirit as `payroll.storage.ts`'s module
 * comment: swapping Cloudinary for S3 should be one file, not a grep across
 * the modules.
 */

import { v2 as cloudinary } from "cloudinary"

import { env } from "../../config/env"
import { AppError } from "../../middleware/errorHandler"

export function isMediaConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
  )
}

/**
 * A 503 with this sentence is diagnosable. The alternative — letting an
 * undefined API key reach the SDK — surfaces as a 500 from somewhere deep
 * inside a third-party library.
 */
export function assertMediaConfigured(): void {
  if (!isMediaConfigured()) {
    throw new AppError(503, "File storage is not configured on this server")
  }
}

export function getCloudinary() {
  assertMediaConfigured()
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  return cloudinary
}
