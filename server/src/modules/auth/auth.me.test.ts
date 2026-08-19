import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

vi.mock("../media/media.service", () => ({
  uploadBuffer: vi.fn(async () => ({ publicId: "hr/avatars/users/u-1", version: 42 })),
  destroyAsset: vi.fn(async () => undefined),
  signedAvatarUrl: vi.fn((publicId: string, version?: number) => `signed:${publicId}:${version}`),
}))

import prisma from "../../config/prisma"
import { destroyAsset, uploadBuffer } from "../media/media.service"
import { clearOwnAvatar, setDisplayName, uploadOwnAvatar } from "./auth.me"

const adminAccount = { role: "SUPER_ADMIN", employee: null }
const staffAccount = { role: "EMPLOYEE", employee: { id: "emp-1" } }
const file = { buffer: Buffer.from("png"), originalname: "me.png" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("who may set a name and a photo", () => {
  it("refuses a staff account, naming where its name comes from", async () => {
    // Their name is Employee.fullName and HR owns it. Writing a second name
    // onto the User row would give two answers to what they are called.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(staffAccount as never)

    await expect(setDisplayName("u-2", "Karim")).rejects.toMatchObject({ statusCode: 409 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it("refuses a staff account the avatar upload too, before touching Cloudinary", async () => {
    // The check has to come first: a refusal after the upload leaves an asset
    // nothing points at.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(staffAccount as never)

    await expect(uploadOwnAvatar("u-2", file)).rejects.toMatchObject({ statusCode: 409 })
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it("allows an account with no employee record", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminAccount as never)
    vi.mocked(prisma.user.update).mockResolvedValue({
      displayName: "Nadia Rahman",
      avatarUrl: null,
    } as never)

    const result = await setDisplayName("u-1", "Nadia Rahman")

    expect(result.displayName).toBe("Nadia Rahman")
  })
})

describe("setDisplayName", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminAccount as never)
    vi.mocked(prisma.user.update).mockResolvedValue({
      displayName: null,
      avatarUrl: null,
    } as never)
  })

  it("stores an empty name as null, so the email shows again", async () => {
    // Clearing the name is a real choice, and "" would render as a blank
    // heading rather than falling back.
    await setDisplayName("u-1", "   ")

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { displayName: null } })
    )
  })

  it("trims what it stores", async () => {
    await setDisplayName("u-1", "  Nadia Rahman  ")

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { displayName: "Nadia Rahman" } })
    )
  })
})

describe("uploadOwnAvatar", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminAccount as never)
  })

  it("writes to its own folder, apart from employee avatars", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "u-1" } as never)

    await uploadOwnAvatar("u-1", file)

    expect(uploadBuffer).toHaveBeenCalledWith(file.buffer, "hr/avatars/users/u-1")
  })

  it("destroys the asset when the row will not take it", async () => {
    // The upload has already happened by then, so without this the asset is
    // stranded in Cloudinary with nothing pointing at it.
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("db down"))

    await expect(uploadOwnAvatar("u-1", file)).rejects.toThrow("db down")
    expect(destroyAsset).toHaveBeenCalledWith("hr/avatars/users/u-1")
  })
})

describe("clearOwnAvatar", () => {
  it("is idempotent when there is no photo", async () => {
    // Only reachable by clicking twice. A 404 for that would be theatre.
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(adminAccount as never)
      .mockResolvedValueOnce({ avatarUrl: null } as never)

    await expect(clearOwnAvatar("u-1")).resolves.toEqual({ avatarUrl: null })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it("clears the row even when Cloudinary refuses the delete", async () => {
    // The row is authoritative. A failed cleanup must not leave the account
    // showing a photo the database says is gone.
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(adminAccount as never)
      .mockResolvedValueOnce({ avatarUrl: "hr/avatars/users/u-1#42" } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ id: "u-1" } as never)
    vi.mocked(destroyAsset).mockRejectedValue(new Error("cloudinary down"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(clearOwnAvatar("u-1")).resolves.toEqual({ avatarUrl: null })
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avatarUrl: null } })
    )
  })
})
