import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    refreshToken: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { hashToken } from "./auth.utils"
import { describeDevice, listSessions, revokeSession } from "./auth.sessions"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.refreshToken.findMany).mockResolvedValue([] as never)
})

describe("describeDevice", () => {
  it("names the browser and the platform", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
      )
    ).toBe("Chrome on Windows")
  })

  it("does not report Edge as Chrome", () => {
    // Edge puts "Chrome/" in its own user agent, so a naive check in the
    // wrong order reports every Edge session as Chrome.
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0"
      )
    ).toBe("Edge on Windows")
  })

  it("does not report an iPad as a Mac", () => {
    // An iPad's user agent contains "like Mac OS X".
    expect(
      describeDevice(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1"
      )
    ).toBe("Safari on iOS")
  })

  it("reports Chrome on iOS rather than Safari", () => {
    // Every iOS browser carries "Safari/" — CriOS is the distinguishing part.
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Chrome on iOS")
  })

  it("says so rather than guessing when nothing was sent", () => {
    expect(describeDevice(null)).toBe("Unknown device")
    expect(describeDevice("curl/8.4.0")).toBe("Unknown device")
  })
})

describe("listSessions", () => {
  const row = {
    sessionId: "s-1",
    tokenHash: hashToken("raw-token-1"),
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/128.0.0.0 Safari/537.36",
    ipAddress: "103.230.104.22",
    startedAt: new Date("2026-08-14T09:00:00.000Z"),
    lastUsedAt: new Date("2026-08-18T10:30:00.000Z"),
  }

  it("excludes revoked and expired tokens", async () => {
    // A revoked session has ended. Listing it offers a sign-out button for
    // something that is already signed out.
    await listSessions("u-1", undefined)

    const args = vi.mocked(prisma.refreshToken.findMany).mock.calls[0]![0]!
    expect(args.where).toMatchObject({
      userId: "u-1",
      revokedAt: null,
      expiresAt: { gt: expect.any(Date) },
    })
  })

  it("marks the caller's own session as current", async () => {
    vi.mocked(prisma.refreshToken.findMany).mockResolvedValue([
      row,
      { ...row, sessionId: "s-2", tokenHash: hashToken("raw-token-2") },
    ] as never)

    const sessions = await listSessions("u-1", "raw-token-1")

    expect(sessions[0]!.current).toBe(true)
    expect(sessions[1]!.current).toBe(false)
  })

  it("marks nothing current when the caller sent no cookie", async () => {
    // Reachable through a bearer-only client. Every row reading "this device"
    // would be worse than none doing so.
    vi.mocked(prisma.refreshToken.findMany).mockResolvedValue([row] as never)

    const sessions = await listSessions("u-1", undefined)

    expect(sessions[0]!.current).toBe(false)
  })

  it("never returns the token hash", async () => {
    // It is the secret's only stored form. It is read here to match the
    // caller's own cookie and must not leave the function.
    vi.mocked(prisma.refreshToken.findMany).mockResolvedValue([row] as never)

    const sessions = await listSessions("u-1", "raw-token-1")

    expect(JSON.stringify(sessions)).not.toContain(row.tokenHash)
    expect(sessions[0]).not.toHaveProperty("tokenHash")
  })
})

describe("revokeSession", () => {
  it("scopes the delete by user, so another account's id is a 404", async () => {
    // The scope is in the `where`, not a check afterwards: an id belonging to
    // somebody else matches nothing, which is the same answer as one that
    // never existed.
    vi.mocked(prisma.refreshToken.findMany).mockResolvedValue([] as never)

    await expect(revokeSession("u-1", "someone-elses-session", undefined)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
  })

  it("refuses to revoke the session making the request", async () => {
    // It would work, but from a control that reads as "sign out that other
    // device". Signing yourself out lives elsewhere on the same page.
    vi.mocked(prisma.refreshToken.findMany).mockResolvedValue([
      { id: "t-1", tokenHash: hashToken("mine") },
    ] as never)

    await expect(revokeSession("u-1", "s-1", "mine")).rejects.toMatchObject({ statusCode: 409 })
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
  })

  it("revokes another device", async () => {
    vi.mocked(prisma.refreshToken.findMany).mockResolvedValue([
      { id: "t-2", tokenHash: hashToken("theirs") },
    ] as never)

    await revokeSession("u-1", "s-2", "mine")

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u-1", sessionId: "s-2", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
  })
})
