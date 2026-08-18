/**
 * Where this account is signed in, and how to end any one of them.
 *
 * Reads the `RefreshToken` table, which since the sessions migration carries
 * a `sessionId` that survives rotation. Before that, refreshing replaced the
 * row every fifteen minutes and there was nothing durable to list or revoke.
 *
 * Everything here is scoped to the caller's own token. There is no id in any
 * path that could aim it at somebody else's sessions: signing another person
 * out already happens through deactivation and demotion, where it belongs.
 */

import prisma from "../../config/prisma"
import { AppError } from "../../middleware/errorHandler"
import { hashToken } from "./auth.utils"

export interface SessionView {
  sessionId: string
  /** "Chrome on Windows", or "Unknown device" when nothing said. */
  device: string
  ipAddress: string | null
  startedAt: string
  lastUsedAt: string
  /** The session making this request. Cannot be revoked from the list. */
  current: boolean
}

/**
 * A user agent, as a person would name the thing in front of them.
 *
 * Hand-rolled rather than a parser dependency, and deliberately shallow: the
 * question this answers is "do I recognise this device", which needs the
 * browser and the platform and nothing else. Version numbers would only make
 * two entries for the same laptop look like two laptops.
 *
 * Order matters in both lists. Edge and Opera put "Chrome" in their own user
 * agents, and every browser on iOS puts "Safari" in its; testing the more
 * specific token first is what keeps Edge from reporting itself as Chrome.
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device"

  const browsers: [RegExp, string][] = [
    [/\bEdgA?\//, "Edge"],
    [/\bOPR\/|\bOpera\//, "Opera"],
    [/\bSamsungBrowser\//, "Samsung Internet"],
    [/\bFirefox\/|\bFxiOS\//, "Firefox"],
    [/\bCriOS\//, "Chrome"],
    [/\bChrome\//, "Chrome"],
    [/\bSafari\//, "Safari"],
  ]
  const platforms: [RegExp, string][] = [
    // Before "Mac": an iPad reports "like Mac OS X".
    [/\biPhone\b|\biPad\b|\biPod\b/, "iOS"],
    [/\bAndroid\b/, "Android"],
    [/\bWindows\b/, "Windows"],
    [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
    [/\bCrOS\b/, "ChromeOS"],
    [/\bLinux\b/, "Linux"],
  ]

  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1]
  const platform = platforms.find(([pattern]) => pattern.test(userAgent))?.[1]

  if (browser && platform) return `${browser} on ${platform}`
  if (browser) return browser
  if (platform) return platform
  return "Unknown device"
}

/**
 * Every live session on the account, most recently used first.
 *
 * `currentRawToken` is the caller's own refresh cookie, hashed here to mark
 * one row as theirs. Passed as the raw value rather than a session id because
 * the cookie is the only thing the browser holds — it does not know its own
 * session id, and giving it one would be handing out a revocation handle.
 */
export async function listSessions(
  userId: string,
  currentRawToken: string | undefined
): Promise<SessionView[]> {
  const currentHash = currentRawToken ? hashToken(currentRawToken) : null

  const rows = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: {
      sessionId: true,
      tokenHash: true,
      userAgent: true,
      ipAddress: true,
      startedAt: true,
      lastUsedAt: true,
    },
  })

  return rows.map((row) => ({
    sessionId: row.sessionId,
    device: describeDevice(row.userAgent),
    ipAddress: row.ipAddress,
    startedAt: row.startedAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    current: currentHash !== null && row.tokenHash === currentHash,
  }))
}

/**
 * Ends one session.
 *
 * Scoped by `userId` in the `where` and not merely checked afterwards: a
 * session id belonging to somebody else matches nothing and 404s, which is
 * also the right answer for one that never existed.
 *
 * Revoking your own current session is refused rather than silently allowed.
 * It would work — but it logs you out from a control that reads as "sign out
 * that other device", and the button for signing yourself out is elsewhere on
 * the same page.
 */
export async function revokeSession(
  userId: string,
  sessionId: string,
  currentRawToken: string | undefined
): Promise<void> {
  const rows = await prisma.refreshToken.findMany({
    where: { userId, sessionId, revokedAt: null },
    select: { id: true, tokenHash: true },
  })
  if (rows.length === 0) throw new AppError(404, "Session not found")

  if (currentRawToken) {
    const currentHash = hashToken(currentRawToken)
    if (rows.some((row) => row.tokenHash === currentHash)) {
      throw new AppError(409, "This is the session you are using. Sign out instead.")
    }
  }

  await prisma.refreshToken.updateMany({
    where: { userId, sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
