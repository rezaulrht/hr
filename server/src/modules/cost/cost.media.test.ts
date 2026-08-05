import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    costAttachment: { create: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      costAttachment: { findMany: vi.fn(), findUnique: vi.fn() },
      operatingCost: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

vi.mock("../media/media.service", () => ({
  DOCUMENT_URL_TTL_SECONDS: 300,
  costPublicId: vi.fn(() => "hr/costs/cost-1/uuid"),
  uploadBuffer: vi.fn(async () => ({ publicId: "hr/costs/cost-1/uuid", version: 1, bytes: 100, format: "pdf" })),
  signedDocumentUrl: vi.fn(() => "https://signed/url"),
  destroyAsset: vi.fn(async () => undefined),
}))

import prisma from "../../config/prisma"
import { destroyAsset, uploadBuffer } from "../media/media.service"
import { deleteReceipt, getReceiptUrl, listReceipts, uploadReceipt } from "./cost.media"

const tx = (prisma as unknown as { __tx: any }).__tx
const finance = { sub: "user-fin", role: "FINANCE_OFFICER", email: "fin@demo.com", mustChangePassword: false } as never
const file = { buffer: Buffer.from("x"), originalname: "receipt.pdf" }

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
})

describe("uploadReceipt", () => {
  it("404s on an unknown cost id before uploading anything to Cloudinary", async () => {
    vi.mocked(prisma.operatingCost.findUnique).mockResolvedValue(null as never)

    await expect(uploadReceipt("nope", file as never, finance)).rejects.toMatchObject({
      statusCode: 404,
    })

    // Uploading first would leave an orphan blob nothing points at.
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it("creates the attachment row with the cost id", async () => {
    vi.mocked(prisma.operatingCost.findUnique).mockResolvedValue({ id: "cost-1" } as never)
    tx.costAttachment.create.mockResolvedValue({ id: "att-1" })

    await uploadReceipt("cost-1", file as never, finance)

    expect(tx.costAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costId: "cost-1", publicId: "hr/costs/cost-1/uuid" }),
      })
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entity: "COST", entityId: "cost-1" }) })
    )
  })
})

describe("listReceipts", () => {
  it("lists attachments for the cost", async () => {
    vi.mocked(prisma.costAttachment.findMany).mockResolvedValue([
      { id: "att-1", fileName: "r.pdf", bytes: 10, format: "pdf", uploadedAt: new Date("2026-01-01") },
    ] as never)

    const result = await listReceipts("cost-1")

    expect(result).toEqual([
      { id: "att-1", fileName: "r.pdf", bytes: 10, format: "pdf", uploadedAt: "2026-01-01T00:00:00.000Z" },
    ])
  })
})

describe("getReceiptUrl", () => {
  it("404s on an unknown receipt", async () => {
    vi.mocked(prisma.costAttachment.findUnique).mockResolvedValue(null as never)

    await expect(getReceiptUrl("nope")).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("deleteReceipt", () => {
  it("removes the row and destroys the Cloudinary blob", async () => {
    vi.mocked(prisma.costAttachment.findUnique).mockResolvedValue({
      id: "att-1",
      costId: "cost-1",
      publicId: "hr/costs/cost-1/uuid",
      fileName: "r.pdf",
    } as never)
    tx.costAttachment.delete.mockResolvedValue({ id: "att-1" })

    await deleteReceipt("att-1", finance)

    expect(tx.costAttachment.delete).toHaveBeenCalledWith({ where: { id: "att-1" } })
    expect(destroyAsset).toHaveBeenCalledWith("hr/costs/cost-1/uuid")
  })

  it("destroys the Cloudinary blob before opening the transaction", async () => {
    vi.mocked(prisma.costAttachment.findUnique).mockResolvedValue({
      id: "att-1",
      costId: "cost-1",
      publicId: "hr/costs/cost-1/uuid",
      fileName: "r.pdf",
    } as never)

    // A hanging Cloudinary call must not pin a DB connection-pool slot: the
    // transaction must not even be open yet when destroyAsset resolves.
    tx.costAttachment.delete.mockImplementation(() => {
      expect(destroyAsset).toHaveBeenCalled()
      return Promise.resolve({ id: "att-1" })
    })

    await deleteReceipt("att-1", finance)

    expect(destroyAsset).toHaveBeenCalledWith("hr/costs/cost-1/uuid")
    expect(tx.costAttachment.delete).toHaveBeenCalledWith({ where: { id: "att-1" } })
  })
})
