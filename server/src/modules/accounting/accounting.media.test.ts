import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    journalAttachment: { create: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      journal: { findUnique: vi.fn() },
      journalAttachment: { findUnique: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

vi.mock("../media/media.service", () => ({
  uploadBuffer: vi.fn(async () => ({ publicId: "journals/j-1/abc", bytes: 1024, format: "pdf" })),
  destroyAsset: vi.fn(async () => undefined),
  signedDocumentUrl: vi.fn(async () => ({ url: "https://signed/url", expiresAt: "2026-08-12T00:05:00.000Z" })),
  journalPublicId: vi.fn(() => "journals/j-1/abc"),
}))

import prisma from "../../config/prisma"
import { destroyAsset, uploadBuffer } from "../media/media.service"
import { deleteJournalAttachment, uploadJournalAttachment } from "./accounting.media"

const tx = (prisma as unknown as { __tx: any }).__tx

const finance = { sub: "user-finance", role: "FINANCE_OFFICER", email: "f@d.com", mustChangePassword: false } as never
const file = { buffer: Buffer.from("pdf"), originalname: "rent-receipt.pdf" }

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.journalAttachment.create.mockResolvedValue({ id: "att-1" })
  ;(prisma.journal.findUnique as any).mockResolvedValue({ id: "j-1", status: "DRAFT" })
})

describe("uploadJournalAttachment", () => {
  it("validates the journal before uploading, so a bad id leaves no orphan blob", async () => {
    ;(prisma.journal.findUnique as any).mockResolvedValue(null)

    await expect(uploadJournalAttachment("ghost", file, finance)).rejects.toMatchObject({
      statusCode: 404,
    })

    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it("accepts an attachment on a POSTED journal — evidence often arrives late", async () => {
    ;(prisma.journal.findUnique as any).mockResolvedValue({ id: "j-1", status: "POSTED" })

    await expect(uploadJournalAttachment("j-1", file, finance)).resolves.toMatchObject({ id: "att-1" })
  })

  it("destroys the uploaded blob when the row fails to persist", async () => {
    tx.journalAttachment.create.mockRejectedValue(new Error("db down"))

    await expect(uploadJournalAttachment("j-1", file, finance)).rejects.toThrow("db down")

    expect(destroyAsset).toHaveBeenCalledWith("journals/j-1/abc")
  })

  it("audits the upload against the journal", async () => {
    await uploadJournalAttachment("j-1", file, finance)

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "JOURNAL", entityId: "j-1", action: "CREATE" }),
      })
    )
  })
})

describe("deleteJournalAttachment", () => {
  it("destroys the blob before opening the transaction", async () => {
    ;(prisma.journalAttachment.findUnique as any).mockResolvedValue({
      id: "att-1",
      journalId: "j-1",
      publicId: "journals/j-1/abc",
      fileName: "rent-receipt.pdf",
    })

    await deleteJournalAttachment("att-1", finance)

    expect(destroyAsset).toHaveBeenCalledWith("journals/j-1/abc")
    expect(tx.journalAttachment.delete).toHaveBeenCalledWith({ where: { id: "att-1" } })
  })

  it("404s an unknown attachment", async () => {
    ;(prisma.journalAttachment.findUnique as any).mockResolvedValue(null)

    await expect(deleteJournalAttachment("ghost", finance)).rejects.toMatchObject({ statusCode: 404 })
  })
})
