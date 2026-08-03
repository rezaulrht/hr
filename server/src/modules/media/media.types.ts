export type MediaKind = "AVATAR" | "DOCUMENT"

export interface MediaLimits {
  maxBytes: number
  allowedFormats: string[]
}

/** What Cloudinary tells us after a successful upload. Authoritative. */
export interface UploadedAsset {
  publicId: string
  version: number
  bytes: number
  format: string
}
