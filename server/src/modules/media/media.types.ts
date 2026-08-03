export type MediaKind = "AVATAR" | "DOCUMENT"

export interface UploadSignature {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
  publicId: string
  /** Always "authenticated". Public assets are never issued by this API. */
  type: "authenticated"
  uploadUrl: string
  maxBytes: number
  allowedFormats: string[]
}

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
