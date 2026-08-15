/**
 * Book value per asset and the register-wide report.
 *
 * Reads `AssetDepreciation` rows — book value is defined as cost minus the
 * charges, and nothing here re-derives it from a formula. The BDT figure for
 * a USD asset is the one frozen at capitalisation, never a live conversion
 * (spec Decision 7).
 */

import prisma from "../../config/prisma"
import type { Currency } from "../../generated/prisma/client"
import { dec, sum } from "../payroll/payroll.money"

export interface AssetValueRow {
  assetId: string
  assetTag: string
  name: string
  categoryName: string
  currency: Currency
  /** Null, rendered as "unknown", when the cost, the date or the rate is missing. */
  purchaseCost: string | null
  accumulated: string | null
  bookValue: string | null
  status: "VALUED" | "UNKNOWN" | "NOT_CAPITALISED"
}

export interface AssetValueReport {
  rows: AssetValueRow[]
  /** Per currency, never summed across. */
  totals: Array<{ currency: Currency; purchaseCost: string; accumulated: string; bookValue: string }>
  asOf: string
}

export async function assetValueReport(query: {
  asOf?: string
  categoryId?: string
}): Promise<AssetValueReport> {
  const assets = await prisma.asset.findMany({
    where: query.categoryId ? { categoryId: query.categoryId } : undefined,
    orderBy: { assetTag: "asc" },
    select: {
      id: true, assetTag: true, name: true, currency: true,
      purchaseCostBdt: true, fxRateToBdt: true, capitalisedAt: true,
      category: { select: { name: true } },
    },
  })

  const charges = assets.length
    ? await prisma.assetDepreciation.findMany({
        where: { assetId: { in: assets.map((a) => a.id) } },
        select: { assetId: true, amount: true },
      })
    : []
  const accumulatedByAsset = new Map<string, ReturnType<typeof dec>>()
  for (const c of charges) {
    const current = accumulatedByAsset.get(c.assetId) ?? dec(0)
    accumulatedByAsset.set(c.assetId, current.plus(c.amount))
  }

  const rows: AssetValueRow[] = assets.map((a) => {
    if (!a.capitalisedAt) {
      return {
        assetId: a.id,
        assetTag: a.assetTag,
        name: a.name,
        categoryName: a.category.name,
        currency: a.currency,
        purchaseCost: null,
        accumulated: null,
        bookValue: null,
        status: "NOT_CAPITALISED",
      }
    }
    if (a.purchaseCostBdt === null || a.fxRateToBdt === null) {
      return {
        assetId: a.id,
        assetTag: a.assetTag,
        name: a.name,
        categoryName: a.category.name,
        currency: a.currency,
        purchaseCost: null,
        accumulated: null,
        bookValue: null,
        status: "UNKNOWN",
      }
    }

    const cost = dec(a.purchaseCostBdt)
    const accumulated = accumulatedByAsset.get(a.id) ?? dec(0)
    return {
      assetId: a.id,
      assetTag: a.assetTag,
      name: a.name,
      categoryName: a.category.name,
      currency: a.currency,
      purchaseCost: cost.toFixed(2),
      accumulated: accumulated.toFixed(2),
      bookValue: cost.minus(accumulated).toFixed(2),
      status: "VALUED",
    }
  })

  // Unknown rows are excluded from the totals, not counted as zero — zero and
  // "we do not know" are different answers, and conflating them makes the
  // total wrong.
  const byCurrency = new Map<Currency, Array<AssetValueRow & { purchaseCost: string; accumulated: string; bookValue: string }>>()
  for (const row of rows) {
    if (row.status !== "VALUED") continue
    const list = byCurrency.get(row.currency) ?? []
    list.push(row as AssetValueRow & { purchaseCost: string; accumulated: string; bookValue: string })
    byCurrency.set(row.currency, list)
  }

  const totals = [...byCurrency.entries()]
    .map(([currency, list]) => ({
      currency,
      purchaseCost: sum(list.map((r) => dec(r.purchaseCost))).toFixed(2),
      accumulated: sum(list.map((r) => dec(r.accumulated))).toFixed(2),
      bookValue: sum(list.map((r) => dec(r.bookValue))).toFixed(2),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency))

  return { rows, totals, asOf: query.asOf ?? new Date().toISOString().slice(0, 10) }
}
