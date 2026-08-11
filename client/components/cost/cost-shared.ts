import type { CostStatus, Role } from "@/lib/api/types"

/**
 * Status tone/labels and the role predicates every cost component branches
 * on — kept in one place so no component re-derives them. Mirrors
 * `asset-shared.ts`.
 */
export const STATUS_TONE: Record<CostStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
}

export const STATUS_LABEL: Record<CostStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
}

/** Finance and Super Admin write; HR reads everything they write. */
export const canManageCosts = (role: Role) => role === "FINANCE_OFFICER" || role === "SUPER_ADMIN"
export const canReadCosts = (role: Role) => canManageCosts(role) || role === "HR_ADMIN"

/**
 * "Aug 10, 2026", matching asset-shared's formatAssetDate.
 *
 * Blank rather than a dash when there is no date. A dash is a mark the reader
 * has to decode, and in a money table it reads as a value; an empty cell reads
 * as nothing recorded, which is what it means. Same rule as attendance's
 * formatClock.
 */
export function formatCostDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** Bare month name — the missing-bill prompt reads "No rent recorded for March.", not "for March 2026." */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month)
}

/**
 * This month, as a { year, month } pair, in the viewer's own calendar. Local
 * rather than UTC for the same reason as `todayLocalDate`: in Dhaka the UTC
 * month is the previous one for the first six hours of every 1st, which would
 * open the page on the wrong month.
 */
export function currentPeriod(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/**
 * Where the month being viewed sits relative to today.
 *
 * The page needs this because a commitment with no bill against it means three
 * different things. In a past month nobody recorded it and somebody should. In
 * the current month it may simply not be due yet. In a future month it is not
 * a lapse at all, it is a forecast. Reporting all three as "not recorded" put
 * a chase notice on a month that has not happened.
 */
export type PeriodRelation = "past" | "current" | "future"

export function relateToNow(year: number, month: number): PeriodRelation {
  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  if (year < nowYear || (year === nowYear && month < nowMonth)) return "past"
  if (year === nowYear && month === nowMonth) return "current"
  return "future"
}

/** "5th", "12th", "23rd" — for "due the 5th" in the expectation lists. */
export function ordinalDay(day: number): string {
  // 11th, 12th and 13th are the exceptions that a bare last-digit rule gets
  // wrong, which is why they are tested before it.
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th"
  return `${day}${suffix}`
}

/**
 * Today as "YYYY-MM-DD" in the viewer's own calendar.
 *
 * `new Date().toISOString().slice(0, 10)` is the tempting one-liner and it is
 * wrong east of Greenwich: toISOString converts to UTC first, so in Dhaka
 * (UTC+6) every moment before 6am local yields yesterday's date.
 */
export function todayLocalDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/**
 * `startedOn` is a UTC-midnight ISO timestamp; "on or before the selected
 * month" compares calendar year/month, not the instant, so a commitment that
 * started on the 28th still counts for that same month.
 */
export function startedOnOrBefore(startedOn: string, year: number, month: number): boolean {
  const d = new Date(startedOn)
  const cy = d.getUTCFullYear()
  const cm = d.getUTCMonth() + 1
  return cy < year || (cy === year && cm <= month)
}
