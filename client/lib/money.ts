import type { Currency } from "@/lib/api/types"

/**
 * Formats a money string for display.
 *
 * **Never parses it for arithmetic.** The client does no money maths; it
 * displays what the server computed. `Number("72258.06")` is a float again,
 * which is the whole reason the server uses Decimal and sends strings.
 *
 * A figure is always shown with its currency. A bare "2,910.00" in a
 * two-currency system is one screenshot away from a serious misunderstanding.
 */
export function formatMoney(amount: string, currency: Currency): string {
  const locale = currency === "BDT" ? "en-BD" : "en-US"
  // Number() here is for presentation only, and never feeds a stored value.
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount))
}

/** A rate is a ratio, not money — 6dp, and never a currency symbol. */
export function formatRate(rate: string): string {
  return Number(rate).toFixed(6)
}

export function formatMonth(month: number, year: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** True when a money string is negative, so the UI can flag it. */
export const isNegativeMoney = (amount: string): boolean => amount.trimStart().startsWith("-")
