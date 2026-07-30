/**
 * Exchange-rate resolution.
 *
 * The pure selection rule (`pickRate`) is kept separate from the database read
 * (`resolveRateOrThrow`) so the rule that actually decides what somebody gets
 * paid is testable without a mock.
 */

import prisma from "../../config/prisma"
import type { Currency, ExchangeRate } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { formatDateOnly } from "../../utils/dates"
import { dec, type Money, ONE, REPORTING_CURRENCY } from "./payroll.money"

/** The columns the selection rule reads. Narrow, so tests can fake a row. */
export type RateRow = Pick<ExchangeRate, "rate" | "effectiveFrom" | "createdAt">

/**
 * The latest rate effective on or before `asOf`. Null when none exists.
 *
 * Rates accumulate rather than being edited in place, so "the rate in force
 * then" is a question about history and must not be answered with today's row.
 *
 * Ties on `effectiveFrom` break by `createdAt`, newest first. The unique
 * constraint on (base, quote, effectiveFrom) means a tie should not reach
 * here, but a selection rule that returns a different answer depending on row
 * order is one that produces a different payslip on a retry.
 */
export function pickRate<T extends RateRow>(rows: T[], asOf: Date): T | null {
  const eligible = rows.filter((row) => row.effectiveFrom.getTime() <= asOf.getTime())
  if (eligible.length === 0) return null

  return eligible.reduce((best, row) => {
    const byEffective = row.effectiveFrom.getTime() - best.effectiveFrom.getTime()
    if (byEffective !== 0) return byEffective > 0 ? row : best
    return row.createdAt.getTime() > best.createdAt.getTime() ? row : best
  })
}

/**
 * How many BDT one unit of `currency` bought on `asOf`.
 *
 * **Throws rather than defaulting.** A missing rate treated as 1.0 pays a
 * USD-salaried employee about 122 times too little, on a payslip that looks
 * entirely ordinary — the single most expensive bug available in this module.
 * The only safe handling is to stop.
 */
export async function resolveRateOrThrow(currency: Currency, asOf: Date): Promise<Money> {
  // BDT to BDT needs no rate, and requiring one would make an all-BDT payroll
  // depend on a row nobody has a reason to create. Returns without touching
  // the database at all.
  if (currency === REPORTING_CURRENCY) return ONE

  const rows = await prisma.exchangeRate.findMany({
    where: {
      base: currency,
      quote: REPORTING_CURRENCY,
      effectiveFrom: { lte: asOf },
    },
    select: { rate: true, effectiveFrom: true, createdAt: true },
  })

  const picked = pickRate(rows, asOf)
  if (!picked) {
    throw new AppError(
      409,
      `No ${currency}→${REPORTING_CURRENCY} exchange rate is effective on or before ` +
        `${formatDateOnly(asOf)}. Add one before processing — payroll will not assume a rate.`
    )
  }

  return dec(picked.rate)
}
