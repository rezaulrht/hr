import type { Tone } from "@/components/dashboard/types"
import type { LeaveStatus, TeamStatus } from "@/lib/api/types"
import { parseDateString } from "@/lib/utils"

export const STATUS_TONE: Record<LeaveStatus, Tone> = {
  PENDING: "yellow",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "neutral",
}

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

export const TEAM_STATUS_TONE: Record<TeamStatus, Tone> = {
  ACTIVE: "green",
  ON_LEAVE: "yellow",
  LEFT: "red",
}

export const TEAM_STATUS_LABEL: Record<TeamStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  LEFT: "Left",
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }

/** "Aug 10 – Aug 14", or just "Aug 10" for a single day. */
export function formatRange(startDate: string, endDate: string): string {
  const start = parseDateString(startDate)
  const end = parseDateString(endDate)
  const startText = start.toLocaleDateString("en-US", SHORT_DATE)
  if (startDate === endDate) return startText
  return `${startText} – ${end.toLocaleDateString("en-US", SHORT_DATE)}`
}

export function decidedByLabel(
  decidedBy: { email: string; fullName: string | null } | null
): string {
  if (!decidedBy) return "—"
  return decidedBy.fullName ?? (decidedBy.email.split("@")[0] ?? decidedBy.email)
}

export function isFutureDated(startDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return parseDateString(startDate).getTime() > today.getTime()
}

/** True when a request's approved range covers today — used for on-leave counts. */
export function coversToday(startDate: string, endDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const t = today.getTime()
  return parseDateString(startDate).getTime() <= t && parseDateString(endDate).getTime() >= t
}
