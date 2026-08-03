import { beforeEach, describe, expect, it, vi } from "vitest"

const txMock = {
  document: { create: vi.fn(), delete: vi.fn() },
  employee: { update: vi.fn() },
  payrollAudit: { create: vi.fn() },
}

vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn((fn: any) => fn(txMock)),
    document: { findMany: vi.fn(), findFirst: vi.fn() },
    employee: { findUnique: vi.fn() },
  },
}))

vi.mock("../media/media.service", () => ({
  uploadBuffer: vi.fn(),
  destroyAsset: vi.fn(() => Promise.resolve()),
  signedDocumentUrl: vi.fn(() => ({ url: "https://dl/x", expiresAt: "2026-08-03T10:05:00.000Z" })),
  signedAvatarUrl: vi.fn(() => "https://res/avatar.jpg"),
  avatarPublicId: (id: string) => `hr/avatars/${id}`,
  documentPublicId: (id: string) => `hr/documents/${id}/generated-uuid`,
  documentFolderPrefix: (id: string) => `hr/documents/${id}/`,
}))

import prisma from "../../config/prisma"
import { destroyAsset, signedDocumentUrl, uploadBuffer } from "../media/media.service"
import {
  clearAvatar,
  deleteDocument,
  getDocumentUrl,
  listDocuments,
  uploadAvatar,
  uploadDocument,
} from "./employee.media"

const file = { buffer: Buffer.from("pdf-bytes"), originalname: "contract.pdf" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("uploadDocument", () => {
  it("uploads to a public id scoped to the employee", async () => {
    vi.mocked(uploadBuffer).mockResolvedValue({
      publicId: "hr/documents/emp-1/generated-uuid",
      version: 3,
      bytes: 9,
      format: "pdf",
    })
    txMock.document.create.mockResolvedValue({
      id: "doc-1",
      type: "CONTRACT",
      fileName: "contract.pdf",
      bytes: 9,
      format: "pdf",
      uploadedAt: new Date("2026-08-03T09:00:00.000Z"),
    })

    await uploadDocument("emp-1", "u-hr", file, "CONTRACT")

    expect(uploadBuffer).toHaveBeenCalledWith(file.buffer, "hr/documents/emp-1/generated-uuid")
  })

  it("stores Cloudinary's bytes and format, not the client's claim", async () => {
    // The client's multipart headers are not evidence. The server performed
    // the upload, so its result is authoritative.
    vi.mocked(uploadBuffer).mockResolvedValue({
      publicId: "hr/documents/emp-1/generated-uuid",
      version: 1,
      bytes: 40_000_000,
      format: "png",
    })
    txMock.document.create.mockResolvedValue({
      id: "doc-1",
      type: "OTHER",
      fileName: "x.pdf",
      bytes: 40_000_000,
      format: "png",
      uploadedAt: new Date(),
    })

    await uploadDocument("emp-1", "u-hr", { buffer: Buffer.from("x"), originalname: "x.pdf" }, "OTHER")

    expect(txMock.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bytes: 40_000_000, format: "png" }),
      })
    )
  })

  it("keeps the uploader's file name, because a UUID is unreadable in a list", async () => {
    vi.mocked(uploadBuffer).mockResolvedValue({
      publicId: "hr/documents/emp-1/generated-uuid",
      version: 1,
      bytes: 9,
      format: "pdf",
    })
    txMock.document.create.mockResolvedValue({
      id: "doc-1",
      type: "CONTRACT",
      fileName: "contract.pdf",
      bytes: 9,
      format: "pdf",
      uploadedAt: new Date(),
    })

    await uploadDocument("emp-1", "u-hr", file, "CONTRACT")

    expect(txMock.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fileName: "contract.pdf" }) })
    )
  })

  it("audits the upload", async () => {
    vi.mocked(uploadBuffer).mockResolvedValue({
      publicId: "hr/documents/emp-1/generated-uuid",
      version: 1,
      bytes: 1,
      format: "pdf",
    })
    txMock.document.create.mockResolvedValue({
      id: "doc-1",
      type: "NID",
      fileName: "nid.pdf",
      bytes: 1,
      format: "pdf",
      uploadedAt: new Date(),
    })

    await uploadDocument("emp-1", "u-hr", { buffer: Buffer.from("x"), originalname: "nid.pdf" }, "NID")

    expect(txMock.payrollAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: "EMPLOYEE_DOCUMENT",
        entityId: "doc-1",
        action: "CREATE",
        changedBy: "u-hr",
      }),
    })
  })
})

describe("getDocumentUrl", () => {
  it("scopes the lookup to the employee, so another person's id 404s", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue(null)
    await expect(getDocumentUrl("emp-1", "doc-of-emp-2")).rejects.toThrowError("Document not found")
  })

  it("returns a short-lived signed url", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue({
      id: "doc-1",
      publicId: "hr/documents/emp-1/abc",
      format: "pdf",
    } as any)

    const result = await getDocumentUrl("emp-1", "doc-1")

    expect(signedDocumentUrl).toHaveBeenCalledWith("hr/documents/emp-1/abc", "pdf")
    expect(result.expiresAt).toBe("2026-08-03T10:05:00.000Z")
  })
})

describe("deleteDocument", () => {
  it("destroys the cloudinary asset BEFORE deleting the row", async () => {
    const order: string[] = []
    vi.mocked(prisma.document.findFirst).mockResolvedValue({
      id: "doc-1",
      publicId: "hr/documents/emp-1/abc",
      type: "CONTRACT",
      fileName: "c.pdf",
    } as any)
    vi.mocked(destroyAsset).mockImplementation(async () => {
      order.push("destroy")
    })
    txMock.document.delete.mockImplementation(async () => {
      order.push("delete")
      return {}
    })

    await deleteDocument("emp-1", "doc-1", "u-hr")

    expect(order).toEqual(["destroy", "delete"])
  })

  it("still removes the row when Cloudinary reports the asset missing", async () => {
    vi.mocked(prisma.document.findFirst).mockResolvedValue({
      id: "doc-1",
      publicId: "hr/documents/emp-1/gone",
      type: "OTHER",
      fileName: "g.pdf",
    } as any)
    vi.mocked(destroyAsset).mockResolvedValue(undefined)
    txMock.document.delete.mockResolvedValue({})

    await deleteDocument("emp-1", "doc-1", "u-hr")

    expect(txMock.document.delete).toHaveBeenCalledWith({ where: { id: "doc-1" } })
  })
})

describe("uploadAvatar", () => {
  it("uses the stable avatar public id so re-upload replaces", async () => {
    vi.mocked(uploadBuffer).mockResolvedValue({
      publicId: "hr/avatars/emp-1",
      version: 9,
      bytes: 100,
      format: "jpg",
    })
    txMock.employee.update.mockResolvedValue({ profilePicture: "hr/avatars/emp-1#9" })

    await uploadAvatar("emp-1", "u-1", { buffer: Buffer.from("img"), originalname: "me.jpg" })

    expect(uploadBuffer).toHaveBeenCalledWith(expect.any(Buffer), "hr/avatars/emp-1")
  })

  it("stores publicId#version so a CDN cache can be busted", async () => {
    vi.mocked(uploadBuffer).mockResolvedValue({
      publicId: "hr/avatars/emp-1",
      version: 9,
      bytes: 100,
      format: "jpg",
    })
    txMock.employee.update.mockResolvedValue({ profilePicture: "hr/avatars/emp-1#9" })

    await uploadAvatar("emp-1", "u-1", { buffer: Buffer.from("img"), originalname: "me.jpg" })

    expect(txMock.employee.update).toHaveBeenCalledWith({
      where: { id: "emp-1" },
      data: { profilePicture: "hr/avatars/emp-1#9" },
      select: { profilePicture: true },
    })
  })
})

describe("clearAvatar", () => {
  it("nulls the column and destroys the asset", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      profilePicture: "hr/avatars/emp-1#9",
    } as any)
    txMock.employee.update.mockResolvedValue({ profilePicture: null })

    const result = await clearAvatar("emp-1", "u-1")

    expect(destroyAsset).toHaveBeenCalledWith("hr/avatars/emp-1")
    expect(result.avatarUrl).toBeNull()
  })

  it("is a no-op when there is no avatar", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ profilePicture: null } as any)
    txMock.employee.update.mockResolvedValue({ profilePicture: null })

    await clearAvatar("emp-1", "u-1")

    expect(destroyAsset).not.toHaveBeenCalled()
  })
})
