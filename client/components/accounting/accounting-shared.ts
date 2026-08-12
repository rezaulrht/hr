import type { JournalStatus, JournalType, PeriodStatus, Role } from "@/lib/api/types"

/**
 * Money arrives from the API as a decimal string and stays one. Formatting
 * goes through Number only at the last moment, for grouping; arithmetic never
 * does — see toPaisa below.
 */
export function formatAmount(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return "—"
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Always prints a figure, including zero. For totals rows. */
export function formatTotal(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "0.00"
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * A negative reads as (256,935.00) — the convention the company's audited
 * statements use for a loss, and what an accountant expects to see.
 */
export function formatSigned(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "0.00"
  const body = Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `(${body})` : body
}

/**
 * Integer paisa. The journal editor's live balance must agree exactly with
 * the server's Decimal check, and 0.1 + 0.2 does not. Parsing to integer
 * paisa and summing there makes the two agree by construction.
 *
 * Returns NaN for anything that is not a plain decimal, so a half-typed
 * amount reads as "not yet a number" rather than as zero.
 */
export function toPaisa(input: string): number {
  const trimmed = input.trim()
  if (trimmed === "") return 0
  if (!/^\d{0,12}(\.\d{0,2})?$/.test(trimmed)) return Number.NaN
  const [whole, frac = ""] = trimmed.split(".")
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"))
}

export function fromPaisa(paisa: number): string {
  const sign = paisa < 0 ? "-" : ""
  const abs = Math.abs(paisa)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

export function sumPaisa(values: string[]): number {
  return values.reduce((total, v) => total + toPaisa(v), 0)
}

export const JOURNAL_STATUS_LABEL: Record<JournalStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  POSTED: "Posted",
  REVERSED: "Reversed",
}

export const JOURNAL_STATUS_TONE: Record<JournalStatus, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  POSTED: "success",
  // Not an error — a reversed journal is a correct journal that was
  // superseded. Amber rather than red would read as "needs attention",
  // which it does not.
  REVERSED: "danger",
}

export const JOURNAL_TYPE_LABEL: Record<JournalType, string> = {
  OPENING: "Opening",
  MANUAL: "Manual",
  SYSTEM: "System",
  REVERSAL: "Reversal",
  CLOSING: "Year-end",
}

export const PERIOD_STATUS_TONE: Record<PeriodStatus, "success" | "neutral" | "danger"> = {
  OPEN: "success",
  CLOSED: "neutral",
  LOCKED: "danger",
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`
}

/** "31 Jul 2026". Parsed as UTC, since every ledger date is UTC midnight. */
export function formatLedgerDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** For a date input's value. */
export function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

export function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const first = new Date(Date.UTC(y, m, 1))
  const last = new Date(Date.UTC(y, m + 1, 0))
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

/**
 * Server-side requireRole is the enforcement; these hide actions the user
 * cannot take, so nobody is offered a button that will 403.
 */
export function canAccessAccounting(role: Role | undefined): boolean {
  return role === "FINANCE_OFFICER" || role === "SUPER_ADMIN"
}

export function canApprove(role: Role | undefined): boolean {
  return role === "SUPER_ADMIN"
}
