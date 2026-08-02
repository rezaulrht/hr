/**
 * Display formatting for dashboard cards.
 *
 * **Lakh and crore, not millions.** This is a Bangladesh payroll: `৳1.92M` is
 * not how anyone here reads a payroll total, and the millions in the original
 * mock were a transcription artefact from a dollar template.
 *
 * Formatting happens server-side, into the `value` string, because a
 * threshold or a unit belongs next to the query that produced the number
 * rather than in a React component where it has no test. A `Decimal` is never
 * sent to the client as a number.
 */

import { Prisma } from "../../generated/prisma/client"

const LAKH = 100_000
const CRORE = 10_000_000

const CURRENCY_SYMBOL: Record<string, string> = { BDT: "৳", USD: "$" }

type Amount = number | Prisma.Decimal

function toNumber(amount: Amount): number {
  return amount instanceof Prisma.Decimal ? amount.toNumber() : amount
}

/** Trims a trailing ".00" / ".10" → "1.1", so "৳19.20L" reads "৳19.2L". */
const trim = (n: number, dp: number) => String(Number(n.toFixed(dp)))

/**
 * `1_920_000` → `৳19.2L`, `12_600_000` → `৳1.26Cr`, `4820` → `৳4,820`.
 *
 * The sign goes **before** the symbol — `-৳4,820`, not `৳-4,820` — because
 * the second reads as a currency called "-৳" for the half-second that
 * matters.
 */
export function bdt(amount: Amount): string {
  return money(amount, "BDT")
}

export function money(amount: Amount, currency: string): string {
  const value = toNumber(amount)
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)

  if (abs >= CRORE) return `${sign}${symbol}${trim(abs / CRORE, 2)}Cr`
  if (abs >= LAKH) return `${sign}${symbol}${trim(abs / LAKH, 2)}L`
  return `${sign}${symbol}${Math.round(abs).toLocaleString("en-US")}`
}

/** "3 days", "1 day", "today". */
export function days(count: number): string {
  if (count <= 0) return "today"
  return `${count} day${count === 1 ? "" : "s"}`
}

/** "14 of 16". */
export const ofTotal = (part: number, total: number) => `${part} of ${total}`

/**
 * A percentage, or `"—"` when the denominator is zero.
 *
 * `"—"` rather than `"0%"`: a roster with no working days has no attendance
 * rate, and reporting 0% would say every single person was absent.
 */
export function percent(part: number, total: number, dp = 0): string {
  if (total <= 0) return "—"
  return `${((part / total) * 100).toFixed(dp)}%`
}

/** Whole days between two date-only values, never negative. */
export function ageInDays(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000))
}
