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

/** "Aug 10, 2026" — matches asset-shared's formatAssetDate. */
export function formatCostDate(iso: string | null): string {
  if (!iso) return "—"
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

/** This month, as a { year, month } pair — the default the picker opens on. */
export function currentPeriod(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
}

/** { year, month } <-> "2026-08", the shape <input type="month"> speaks. */
export function periodToInputValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

export function inputValueToPeriod(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) }
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
