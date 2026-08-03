import { describe, expect, it } from "vitest"

import { AVATAR_LIMITS, DOCUMENT_LIMITS, extensionOf } from "./media.upload"

describe("extensionOf", () => {
  it("lowercases the extension", () => {
    expect(extensionOf("Scan.PDF")).toBe("pdf")
  })

  it("takes the LAST dot, so a dotted name does not smuggle a format", () => {
    expect(extensionOf("contract.pdf.exe")).toBe("exe")
  })

  it("returns an empty string when there is no extension", () => {
    expect(extensionOf("noextension")).toBe("")
  })
})

describe("limits", () => {
  it("caps avatars at 5 MB and documents at 15 MB", () => {
    expect(AVATAR_LIMITS.maxBytes).toBe(5 * 1024 * 1024)
    expect(DOCUMENT_LIMITS.maxBytes).toBe(15 * 1024 * 1024)
  })

  it("allows only image formats for avatars", () => {
    expect(AVATAR_LIMITS.allowedFormats).toEqual(["jpg", "jpeg", "png", "webp"])
  })

  it("allows pdf for documents but not webp", () => {
    expect(DOCUMENT_LIMITS.allowedFormats).toContain("pdf")
    expect(DOCUMENT_LIMITS.allowedFormats).not.toContain("webp")
  })
})
