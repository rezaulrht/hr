/**
 * Reducing balance, at a rate per asset class, charged from the month of
 * acquisition — spec Decisions 1 and 6, which reverse asset phase 1's
 * straight-line-over-usefulLifeMonths.
 *
 * Deliberately pure and Prisma-free. Every rule that decides how much comes
 * off somebody's balance sheet is arithmetic, and arithmetic tested through a
 * mocked Prisma client is arithmetic tested badly.
 *
 * The monthly charge is one twelfth of the *annual* reducing-balance charge,
 * not a monthly compounding of it. Compounding monthly gives an annual total
 * that does not equal the filed figure, so Annexure-A would not tie to the
 * method note 2.11.3 describes.
 */

import { Prisma } from "../../generated/prisma/client"
import { dec, round2, ZERO } from "../payroll/payroll.money"
import type { ComputedCharge, DepreciableAsset, PriorCharge } from "./depreciation.types"

export type { ComputedCharge, DepreciableAsset, PriorCharge }

const HUNDRED = dec(100)
const TWELVE = dec(12)

const indexOf = (year: number, month: number) => year * 12 + (month - 1)
const indexOfDate = (d: Date) => indexOf(d.getUTCFullYear(), d.getUTCMonth() + 1)

/** The index of the first month of the financial year containing `index`. */
function fyStartIndex(index: number, fyStartMonth: number): number {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return month >= fyStartMonth
    ? indexOf(year, fyStartMonth)
    : indexOf(year - 1, fyStartMonth)
}

export function computeCharges(
  assets: DepreciableAsset[],
  prior: PriorCharge[],
  target: { year: number; month: number },
  fyStartMonth: number
): ComputedCharge[] {
  const targetIndex = indexOf(target.year, target.month)
  const byAsset = new Map<string, PriorCharge[]>()
  for (const p of prior) {
    const list = byAsset.get(p.assetId) ?? []
    list.push(p)
    byAsset.set(p.assetId, list)
  }

  const charges: ComputedCharge[] = []

  for (const asset of assets) {
    if (!asset.capitalisedAt) continue

    const priors = byAsset.get(asset.id) ?? []
    const priorTotal = priors.reduce((t, p) => t.plus(p.amount), ZERO)
    const remaining = asset.purchaseCostBdt.minus(priorTotal)
    if (remaining.lessThanOrEqualTo(ZERO)) continue

    const lastCharged = priors.length
      ? Math.max(...priors.map((p) => indexOf(p.year, p.month)))
      : null
    const startIndex = lastCharged !== null ? lastCharged + 1 : indexOfDate(asset.purchaseDate)
    const endIndex = asset.stoppedAt
      ? Math.min(targetIndex, indexOfDate(asset.stoppedAt))
      : targetIndex
    if (startIndex > endIndex) continue

    // Walk month by month so a catch-up spanning a year-end picks up the new
    // opening value at the boundary rather than charging the whole span at
    // the old one.
    let total = ZERO
    let currentFy: number | null = null
    let monthly = ZERO
    let months = 0
    let openingForRun: Prisma.Decimal | null = null

    for (let i = startIndex; i <= endIndex; i++) {
      const fy = fyStartIndex(i, fyStartMonth)
      if (fy !== currentFy) {
        currentFy = fy
        const chargedBeforeThisFy = priors
          .filter((p) => indexOf(p.year, p.month) < fy)
          .reduce((t, p) => t.plus(p.amount), ZERO)
          .plus(i > startIndex ? total : ZERO)
        const opening = asset.purchaseCostBdt.minus(chargedBeforeThisFy)
        openingForRun ??= opening
        monthly = round2(opening.times(asset.rate).dividedBy(HUNDRED).dividedBy(TWELVE))
      }
      total = total.plus(monthly)
      months += 1
    }

    const amount = total.greaterThan(remaining) ? remaining : total
    if (amount.lessThanOrEqualTo(ZERO)) continue

    charges.push({
      assetId: asset.id,
      amount: round2(amount),
      openingBookValue: openingForRun ?? remaining,
      rate: asset.rate,
      months,
      classAccountCode: asset.classAccountCode,
      costNature: asset.costNature,
    })
  }

  return charges
}
