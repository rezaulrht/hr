import type { FinancialYear } from "@/lib/api/types"

export type Preset = "MONTH" | "QUARTER" | "HALF_YEAR" | "YEAR" | "CUSTOM"

export interface Range {
  from: string
  to: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0))
}

/** A span of `count` months beginning at year/month, inclusive. */
function span(year: number, month: number, count: number): Range {
  const endAbsolute = month - 1 + count - 1
  const endYear = year + Math.floor(endAbsolute / 12)
  const endMonth = (endAbsolute % 12) + 1
  return { from: iso(utc(year, month, 1)), to: iso(monthEnd(endYear, endMonth)) }
}

/**
 * Quarters and half-years are relative to the financial year's start month,
 * not to the calendar. For a July–June year, Q1 is Jul–Sep. That is why this
 * takes the financial year rather than a bare date.
 */
export function presetRange(preset: Preset, fy: FinancialYear, index: number): Range {
  const start = new Date(fy.startDate)
  const startYear = start.getUTCFullYear()
  const startMonth = start.getUTCMonth() + 1

  const offsetMonths = (n: number) => {
    const absolute = startMonth - 1 + n
    return { year: startYear + Math.floor(absolute / 12), month: (absolute % 12) + 1 }
  }

  if (preset === "YEAR") {
    return { from: iso(start), to: iso(new Date(fy.endDate)) }
  }
  if (preset === "MONTH") {
    const { year, month } = offsetMonths(index)
    return span(year, month, 1)
  }
  if (preset === "QUARTER") {
    const { year, month } = offsetMonths(index * 3)
    return span(year, month, 3)
  }
  if (preset === "HALF_YEAR") {
    const { year, month } = offsetMonths(index * 6)
    return span(year, month, 6)
  }
  return { from: iso(start), to: iso(new Date(fy.endDate)) }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** The options inside a preset — twelve months, four quarters, two halves. */
export function presetOptions(preset: Preset, fy: FinancialYear): Array<{ index: number; label: string }> {
  const start = new Date(fy.startDate)
  const startYear = start.getUTCFullYear()
  const startMonth = start.getUTCMonth() + 1

  const at = (n: number) => {
    const absolute = startMonth - 1 + n
    return { year: startYear + Math.floor(absolute / 12), month: (absolute % 12) + 1 }
  }

  if (preset === "MONTH") {
    return Array.from({ length: 12 }, (_, i) => {
      const { year, month } = at(i)
      return { index: i, label: `${MONTHS[month - 1]} ${year}` }
    })
  }
  if (preset === "QUARTER") {
    return Array.from({ length: 4 }, (_, i) => ({ index: i, label: `Q${i + 1}` }))
  }
  if (preset === "HALF_YEAR") {
    return [
      { index: 0, label: "First half" },
      { index: 1, label: "Second half" },
    ]
  }
  return []
}

/**
 * Whole Taka, grouped Indian-style. A zero renders as an em dash, matching
 * the filed statements — a column of "0" reads as a measurement, a column of
 * dashes reads as nothing happened.
 */
export function taka(value: string): string {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n === 0) return "—"
  const body = Math.abs(n).toLocaleString("en-IN")
  return n < 0 ? `(${body})` : body
}

/** Always prints, including zero. For totals and subtotals. */
export function takaTotal(value: string): string {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return "0"
  const body = Math.abs(n).toLocaleString("en-IN")
  return n < 0 ? `(${body})` : body
}
