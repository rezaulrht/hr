import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The seam is mocked at `media.service`, not at the Cloudinary SDK: these
 * tests assert what payroll storage ASKS the media layer for, which is the
 * part that can regress. How the media layer talks to Cloudinary is already
 * covered by media.service.test.ts.
 */
const uploadBuffer = vi.fn()
const signedDocumentUrl = vi.fn()
const isMediaConfigured = vi.fn(() => true)

vi.mock("../media/media.service", () => ({
  uploadBuffer: (...args: unknown[]) => uploadBuffer(...args),
  signedDocumentUrl: (...args: unknown[]) => signedDocumentUrl(...args),
}))

vi.mock("../media/media.provider", () => ({
  isMediaConfigured: () => isMediaConfigured(),
}))

import { getPdf, publicIdFor, putPdf, storageKey } from "./payroll.storage"

beforeEach(() => {
  vi.clearAllMocks()
  isMediaConfigured.mockReturnValue(true)
  vi.unstubAllGlobals()
})

describe("publicIdFor", () => {
  it("files the asset under the payslips folder", () => {
    expect(publicIdFor("payslip-abc123.pdf")).toBe("hr/payslips/payslip-abc123")
  })

  it("strips the .pdf suffix so Cloudinary does not deliver a doubled extension", () => {
    expect(publicIdFor("settlement-deadbeef.pdf")).not.toContain(".pdf")
  })
})

describe("putPdf", () => {
  it("uploads the bytes under the derived public id", async () => {
    uploadBuffer.mockResolvedValue({ publicId: "hr/payslips/payslip-abc123", version: 1, bytes: 3, format: "pdf" })

    const result = await putPdf("payslip-abc123.pdf", new Uint8Array([1, 2, 3]))

    expect(uploadBuffer).toHaveBeenCalledTimes(1)
    const [buffer, publicId] = uploadBuffer.mock.calls[0]
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(Array.from(buffer as Buffer)).toEqual([1, 2, 3])
    expect(publicId).toBe("hr/payslips/payslip-abc123")
    expect(result).toBe("hr/payslips/payslip-abc123")
  })

  // Caching is an optimisation. The bytes are already rendered and on their
  // way to the caller, so a failed upload must never fail the download.
  it("returns null instead of throwing when the upload fails", async () => {
    uploadBuffer.mockRejectedValue(new Error("cloudinary down"))
    await expect(putPdf("payslip-abc123.pdf", new Uint8Array([1]))).resolves.toBeNull()
  })

  it("skips the upload entirely when media is not configured", async () => {
    isMediaConfigured.mockReturnValue(false)

    await expect(putPdf("payslip-abc123.pdf", new Uint8Array([1]))).resolves.toBeNull()
    expect(uploadBuffer).not.toHaveBeenCalled()
  })
})

describe("getPdf", () => {
  it("returns the bytes behind the signed URL", async () => {
    signedDocumentUrl.mockReturnValue({ url: "https://signed.example/x.pdf", expiresAt: "" })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([9, 8]).buffer })
    )

    const result = await getPdf("payslip-abc123.pdf")

    expect(signedDocumentUrl).toHaveBeenCalledWith("hr/payslips/payslip-abc123", "pdf")
    expect(result).toEqual(Buffer.from([9, 8]))
  })

  // A miss and a failure are the same answer to the caller: re-render it.
  it("returns null when the asset is absent", async () => {
    signedDocumentUrl.mockReturnValue({ url: "https://signed.example/x.pdf", expiresAt: "" })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    await expect(getPdf("payslip-abc123.pdf")).resolves.toBeNull()
  })

  it("returns null when the fetch throws", async () => {
    signedDocumentUrl.mockReturnValue({ url: "https://signed.example/x.pdf", expiresAt: "" })
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")))

    await expect(getPdf("payslip-abc123.pdf")).resolves.toBeNull()
  })

  // A hung Cloudinary must not hold the request open behind Heroku's 30s
  // router timeout — the fetch has to carry its own, much shorter, deadline.
  it("passes an abort signal so a hung request cannot outlast Heroku's router timeout", async () => {
    signedDocumentUrl.mockReturnValue({ url: "https://signed.example/x.pdf", expiresAt: "" })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer })
    vi.stubGlobal("fetch", fetchMock)

    await getPdf("payslip-abc123.pdf")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  // The abort itself throws (DOMException / AbortError) and must land in the
  // same catch as any other unreachable-store failure, degrading to null
  // rather than surfacing as a failed download.
  it("returns null when the fetch aborts on timeout", async () => {
    signedDocumentUrl.mockReturnValue({ url: "https://signed.example/x.pdf", expiresAt: "" })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"))
    )

    await expect(getPdf("payslip-abc123.pdf")).resolves.toBeNull()
  })

  it("warns rather than silently discarding a non-ok response", async () => {
    signedDocumentUrl.mockReturnValue({ url: "https://signed.example/x.pdf", expiresAt: "" })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await getPdf("payslip-abc123.pdf")

    expect(warn).toHaveBeenCalledWith("Payslip cache miss", "payslip-abc123.pdf", 404)
    warn.mockRestore()
  })

  it("warns rather than silently discarding a fetch failure", async () => {
    signedDocumentUrl.mockReturnValue({ url: "https://signed.example/x.pdf", expiresAt: "" })
    const err = new Error("network")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await getPdf("payslip-abc123.pdf")

    expect(warn).toHaveBeenCalledWith("Payslip cache read failed", "payslip-abc123.pdf", err)
    warn.mockRestore()
  })

  it("returns null rather than throwing when media is not configured", async () => {
    signedDocumentUrl.mockImplementation(() => {
      throw new Error("File storage is not configured on this server")
    })

    await expect(getPdf("payslip-abc123.pdf")).resolves.toBeNull()
  })
})

describe("storageKey", () => {
  it("still namespaces by kind", () => {
    expect(storageKey("payslip", "X")).not.toBe(storageKey("settlement", "X"))
  })
})
