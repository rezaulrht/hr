import { beforeEach, describe, expect, it, vi } from "vitest"

const cloudinaryMock = {
  utils: {
    api_sign_request: vi.fn(() => "deadbeef"),
    private_download_url: vi.fn(() => "https://api.cloudinary.com/download?sig=x"),
  },
  url: vi.fn(() => "https://res.cloudinary.com/demo/signed.jpg"),
  api: { resource: vi.fn() },
  uploader: { destroy: vi.fn() },
}

vi.mock("./media.provider", () => ({
  getCloudinary: () => cloudinaryMock,
  assertMediaConfigured: vi.fn(),
  isMediaConfigured: () => true,
}))

vi.mock("../../config/env", () => ({
  env: {
    CLOUDINARY_CLOUD_NAME: "demo",
    CLOUDINARY_API_KEY: "123456",
    CLOUDINARY_API_SECRET: "secret",
  },
}))

import { createUploadSignature } from "./media.service"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createUploadSignature", () => {
  it("puts type=authenticated in the SIGNED parameter set", () => {
    createUploadSignature("DOCUMENT", "emp-1")

    const [paramsToSign] = cloudinaryMock.utils.api_sign_request.mock.calls[0] as unknown as [Record<string, unknown>]
    // The single omission that makes every HR document world-readable. The
    // SDK sets no default for `type`, so it must be signed explicitly.
    expect(paramsToSign.type).toBe("authenticated")
  })

  it("returns type=authenticated to the client too", () => {
    expect(createUploadSignature("DOCUMENT", "emp-1").type).toBe("authenticated")
  })

  it("scopes an avatar to a stable public id so re-upload replaces", () => {
    const a = createUploadSignature("AVATAR", "emp-1")
    const b = createUploadSignature("AVATAR", "emp-1")
    expect(a.publicId).toBe("hr/avatars/emp-1")
    expect(b.publicId).toBe(a.publicId)
  })

  it("gives each document a unique public id under the employee's folder", () => {
    const a = createUploadSignature("DOCUMENT", "emp-1")
    const b = createUploadSignature("DOCUMENT", "emp-1")
    expect(a.folder).toBe("hr/documents/emp-1")
    expect(a.publicId.startsWith("hr/documents/emp-1/")).toBe(true)
    expect(a.publicId).not.toBe(b.publicId)
  })

  it("signs the folder and public id, so a client cannot redirect the upload", () => {
    createUploadSignature("DOCUMENT", "emp-1")
    const [paramsToSign] = cloudinaryMock.utils.api_sign_request.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(paramsToSign.folder).toBe("hr/documents/emp-1")
    expect(paramsToSign.public_id).toMatch(/^hr\/documents\/emp-1\//)
  })

  it("carries the kind's limits so the client can reject before uploading", () => {
    expect(createUploadSignature("AVATAR", "emp-1")).toMatchObject({
      maxBytes: 5 * 1024 * 1024,
      allowedFormats: ["jpg", "jpeg", "png", "webp"],
    })
    expect(createUploadSignature("DOCUMENT", "emp-1")).toMatchObject({
      maxBytes: 15 * 1024 * 1024,
      allowedFormats: ["pdf", "jpg", "jpeg", "png"],
    })
  })

  it("returns the cloud name and upload url so the client needs no env of its own", () => {
    const sig = createUploadSignature("AVATAR", "emp-1")
    expect(sig.cloudName).toBe("demo")
    expect(sig.apiKey).toBe("123456")
    expect(sig.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/auto/upload")
  })
})
