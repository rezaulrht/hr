/**
 * Multer middleware for the two upload kinds.
 *
 * Memory storage rather than disk: `diskStorage` would cap memory but writes
 * temp files to an ephemeral filesystem — the limitation already documented on
 * `PAYSLIP_STORAGE_DIR` — and adds cleanup that must survive a crashed
 * request. At a 15 MB ceiling with one file per request, holding the buffer is
 * the simpler correct choice.
 */

import multer, { MulterError } from "multer"
import type { RequestHandler } from "express"

import { AppError } from "../../middleware/errorHandler"
import type { MediaLimits } from "./media.types"

export const AVATAR_LIMITS: MediaLimits = {
  maxBytes: 5 * 1024 * 1024,
  allowedFormats: ["jpg", "jpeg", "png", "webp"],
}

export const DOCUMENT_LIMITS: MediaLimits = {
  maxBytes: 15 * 1024 * 1024,
  allowedFormats: ["pdf", "jpg", "jpeg", "png"],
}

/** Last dot wins, so `contract.pdf.exe` reads as `exe` rather than `pdf`. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase()
}

function build(limits: MediaLimits): RequestHandler {
  return multer({
    storage: multer.memoryStorage(),
    // `files: 1` matters as much as `fileSize`: without it one request can
    // carry an unbounded number of file parts, and memory storage holds every
    // one of them in the dyno's RAM.
    limits: { fileSize: limits.maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (limits.allowedFormats.includes(extensionOf(file.originalname))) {
        return cb(null, true)
      }
      cb(new AppError(400, `Only ${limits.allowedFormats.join(", ")} files are accepted`))
    },
  }).single("file")
}

/**
 * Translates multer's failures into AppErrors.
 *
 * Multer's default behaviour is to pass a `MulterError` to `next`, which the
 * central error handler does not recognise and renders as a 500. A 413 naming
 * the ceiling is what tells the user what to do about it.
 */
function withErrorTranslation(handler: RequestHandler, limits: MediaLimits): RequestHandler {
  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          const mb = Math.round(limits.maxBytes / 1024 / 1024)
          return next(new AppError(413, `That file is larger than ${mb} MB`))
        }
        if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(new AppError(400, "Send exactly one file, in a `file` field"))
        }
        return next(new AppError(400, err.message))
      }
      return next(err)
    })
  }
}

export const avatarUpload = withErrorTranslation(build(AVATAR_LIMITS), AVATAR_LIMITS)
export const documentUpload = withErrorTranslation(build(DOCUMENT_LIMITS), DOCUMENT_LIMITS)
// An asset photo is the same size class as a scanned contract, and a second
// limit constant is a second thing to keep in step.
export const assetUpload = withErrorTranslation(build(DOCUMENT_LIMITS), DOCUMENT_LIMITS)
// A receipt is the same size class too — no third limit constant.
export const costUpload = withErrorTranslation(build(DOCUMENT_LIMITS), DOCUMENT_LIMITS)
