import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    assetAttachment: { create: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      assetAttachment: { findMany: vi.fn(), findUnique: vi.fn() },
      asset: { findUnique: vi.fn() },
      assetAssignment: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

vi.mock("../media/media.service", () => ({
  DOCUMENT_URL_TTL_SECONDS: 300,
  assetPublicId: vi.fn(() => "assets/ast-1/uuid"),
  uploadBuffer: vi.fn(async () => ({ publicId: "assets/ast-1/uuid", version: 1, bytes: 100, format: "jpg" })),
  signedDocumentUrl: vi.fn(() => "https://signed/url"),
  destroyAsset: vi.fn(async () => undefined),
}))

import prisma from "../../config/prisma"
import { destroyAsset, uploadBuffer } from "../media/media.service"
import { deleteAttachment, uploadAssetAttachment, uploadAssignmentAttachment } from "./asset.media"

const tx = (prisma as unknown as { __tx: any }).__tx
const hr = { sub: "user-hr", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as never
const file = { buffer: Buffer.from("x"), originalname: "lid.jpg", mimetype: "image/jpeg" }

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
})

describe("uploadAssetAttachment", () => {
  it("sets assetId and leaves assignmentId null", async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({ id: "ast-1" } as never)
    tx.assetAttachment.create.mockResolvedValue({ id: "att-1" })

    await uploadAssetAttachment("ast-1", "INVOICE", file as never, hr)

    expect(tx.assetAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assetId: "ast-1", assignmentId: null, kind: "INVOICE" }),
      })
    )
  })

  it("404s on an unknown asset before uploading anything to Cloudinary", async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue(null as never)

    await expect(uploadAssetAttachment("nope", "PHOTO", file as never, hr)).rejects.toMatchObject({
      statusCode: 404,
    })

    // Uploading first would leave an orphan blob nothing points at.
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it("rejects a handover-only kind on an asset", async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({ id: "ast-1" } as never)

    await expect(
      uploadAssetAttachment("ast-1", "CONDITION_OUT", file as never, hr)
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe("uploadAssignmentAttachment", () => {
  it("sets assignmentId and leaves assetId null", async () => {
    vi.mocked(prisma.assetAssignment.findUnique).mockResolvedValue({ id: "asg-1", assetId: "ast-1" } as never)
    tx.assetAttachment.create.mockResolvedValue({ id: "att-2" })

    await uploadAssignmentAttachment("asg-1", "CONDITION_IN", file as never, hr)

    expect(tx.assetAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignmentId: "asg-1", assetId: null, kind: "CONDITION_IN" }),
      })
    )
  })
})

describe("deleteAttachment", () => {
  it("removes the row and the Cloudinary blob", async () => {
    vi.mocked(prisma.assetAttachment.findUnique).mockResolvedValue({
      id: "att-1",
      publicId: "assets/ast-1/uuid",
      assetId: "ast-1",
    } as never)
    tx.assetAttachment.delete.mockResolvedValue({ id: "att-1" })

    await deleteAttachment("att-1", hr)

    expect(tx.assetAttachment.delete).toHaveBeenCalledWith({ where: { id: "att-1" } })
    expect(destroyAsset).toHaveBeenCalledWith("assets/ast-1/uuid")
  })

  it("destroys the Cloudinary blob before opening the transaction", async () => {
    vi.mocked(prisma.assetAttachment.findUnique).mockResolvedValue({
      id: "att-1",
      publicId: "assets/ast-1/uuid",
      assetId: "ast-1",
    } as never)
    tx.assetAttachment.delete.mockResolvedValue({ id: "att-1" })

    // A hanging Cloudinary call must not pin a DB connection-pool slot: the
    // transaction must not even be open yet when destroyAsset resolves.
    tx.assetAttachment.delete.mockImplementation(() => {
      expect(destroyAsset).toHaveBeenCalled()
      return Promise.resolve({ id: "att-1" })
    })

    await deleteAttachment("att-1", hr)

    expect(destroyAsset).toHaveBeenCalledWith("assets/ast-1/uuid")
    expect(tx.assetAttachment.delete).toHaveBeenCalledWith({ where: { id: "att-1" } })
  })
})
