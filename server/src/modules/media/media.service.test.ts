import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `upload_stream(callback, options)` returns a writable. The stub captures the
 * options and the buffer, then invokes the callback with a canned result — so
 * these tests assert what the server SENDS rather than reaching the network.
 */
let lastUploadOptions: Record<string, unknown> | null = null
let lastUploadedBuffer: Buffer | null = null
let uploadShouldFail = false

const cloudinaryMock = {
  uploader: {
    upload_stream: vi.fn((options: Record<string, unknown>, cb: (e: unknown, r: unknown) => void) => {
      lastUploadOptions = options
      return {
        end: (buf: Buffer) => {
          lastUploadedBuffer = buf
          if (uploadShouldFail) return cb(new Error("network"), null)
          cb(null, {
            public_id: options.public_id,
            version: 42,
            bytes: buf.length,
            format: "pdf",
          })
        },
      }
    }),
    destroy: vi.fn(),
  },
  utils: {
    private_download_url: vi.fn(() => "https://api.cloudinary.com/download?sig=x"),
  },
  url: vi.fn(() => "https://res.cloudinary.com/demo/signed.jpg"),
}

vi.mock("./media.provider", () => ({
  getCloudinary: () => cloudinaryMock,
  assertMediaConfigured: vi.fn(),
  isMediaConfigured: () => true,
}))

import {
  DOCUMENT_URL_TTL_SECONDS,
  avatarPublicId,
  destroyAsset,
  documentFolderPrefix,
  documentPublicId,
  signedAvatarUrl,
  signedDocumentUrl,
  uploadBuffer,
} from "./media.service"

beforeEach(() => {
  vi.clearAllMocks()
  lastUploadOptions = null
  lastUploadedBuffer = null
  uploadShouldFail = false
})

describe("public id scheme", () => {
  it("gives an avatar a STABLE id so re-upload replaces", () => {
    expect(avatarPublicId("emp-1")).toBe("hr/avatars/emp-1")
    expect(avatarPublicId("emp-1")).toBe(avatarPublicId("emp-1"))
  })

  it("gives each document a unique id under the employee's prefix", () => {
    const a = documentPublicId("emp-1")
    const b = documentPublicId("emp-1")
    expect(a.startsWith("hr/documents/emp-1/")).toBe(true)
    expect(a).not.toBe(b)
  })

  it("exposes the document prefix for scoping checks", () => {
    expect(documentFolderPrefix("emp-1")).toBe("hr/documents/emp-1/")
  })
})

describe("uploadBuffer", () => {
  it("passes type=authenticated on every upload", async () => {
    // The single omission that makes every HR document world-readable. The
    // SDK applies no default for `type` even on a server-side upload.
    await uploadBuffer(Buffer.from("x"), "hr/documents/emp-1/abc")
    expect(lastUploadOptions?.type).toBe("authenticated")
  })

  it("sends the full path as public_id and does NOT also send a folder", async () => {
    // Cloudinary concatenates them: passing both would yield
    // hr/documents/emp-1/hr/documents/emp-1/abc.
    await uploadBuffer(Buffer.from("x"), "hr/documents/emp-1/abc")
    expect(lastUploadOptions?.public_id).toBe("hr/documents/emp-1/abc")
    expect(lastUploadOptions?.folder).toBeUndefined()
  })

  it("pins resource_type to image so PDFs and photos deliver the same way", async () => {
    await uploadBuffer(Buffer.from("x"), "hr/documents/emp-1/abc")
    expect(lastUploadOptions?.resource_type).toBe("image")
  })

  it("overwrites, so an avatar re-upload replaces rather than accumulating", async () => {
    await uploadBuffer(Buffer.from("x"), "hr/avatars/emp-1")
    expect(lastUploadOptions?.overwrite).toBe(true)
    expect(lastUploadOptions?.invalidate).toBe(true)
  })

  it("writes the buffer to the stream", async () => {
    await uploadBuffer(Buffer.from("hello"), "hr/avatars/emp-1")
    expect(lastUploadedBuffer?.toString()).toBe("hello")
  })

  it("returns Cloudinary's own bytes, format and version", async () => {
    const result = await uploadBuffer(Buffer.from("hello"), "hr/avatars/emp-1")
    expect(result).toEqual({
      publicId: "hr/avatars/emp-1",
      version: 42,
      bytes: 5,
      format: "pdf",
    })
  })

  it("turns an upload failure into a 502, not an unhandled rejection", async () => {
    uploadShouldFail = true
    await expect(uploadBuffer(Buffer.from("x"), "hr/avatars/emp-1")).rejects.toThrowError(
      "Upload to the file store failed"
    )
  })
})

describe("signedAvatarUrl", () => {
  it("signs the url and requests authenticated delivery", () => {
    signedAvatarUrl("hr/avatars/emp-1", 42)
    expect(cloudinaryMock.url).toHaveBeenCalledWith(
      "hr/avatars/emp-1",
      expect.objectContaining({ type: "authenticated", sign_url: true, version: 42 })
    )
  })

  it("omits version when there is none rather than sending undefined", () => {
    signedAvatarUrl("hr/avatars/emp-1")
    const [, options] = (cloudinaryMock.url.mock.calls as any[])[0]
    expect("version" in (options as object)).toBe(false)
  })
})

describe("signedDocumentUrl", () => {
  it("returns a download url that expires in five minutes", () => {
    const before = Math.floor(Date.now() / 1000)
    const result = signedDocumentUrl("hr/documents/emp-1/abc", "pdf")

    const [, format, options] = (cloudinaryMock.utils.private_download_url.mock.calls as any[])[0]
    expect(format).toBe("pdf")
    expect((options as any).type).toBe("authenticated")
    // The specific failure the spec calls out: a mismatch between upload and
    // delivery resource_type produces a download URL that 404s against a
    // stored asset.
    expect((options as any).resource_type).toBe("image")
    expect((options as any).expires_at).toBeGreaterThanOrEqual(before + DOCUMENT_URL_TTL_SECONDS)

    expect(result.url).toBe("https://api.cloudinary.com/download?sig=x")
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})

describe("destroyAsset", () => {
  it("destroys the authenticated asset", async () => {
    cloudinaryMock.uploader.destroy.mockResolvedValue({ result: "ok" })
    await destroyAsset("hr/documents/emp-1/abc")
    expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith("hr/documents/emp-1/abc", {
      type: "authenticated",
      resource_type: "image",
      invalidate: true,
    })
  })

  it("tolerates an asset that is already gone", async () => {
    // A dangling row is recoverable and surfaces as a clean 404. Throwing here
    // would leave the row behind forever.
    cloudinaryMock.uploader.destroy.mockRejectedValue(new Error("not found"))
    await expect(destroyAsset("hr/documents/emp-1/ghost")).resolves.toBeUndefined()
  })
})
