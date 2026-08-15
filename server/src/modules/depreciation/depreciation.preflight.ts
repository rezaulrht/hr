/**
 * The preflight — refuse at post, but warn at preflight, so a period closing
 * on the 3rd is discovered before somebody assembles a run (spec Decision 9).
 *
 * Blockers refuse a draft; warnings do not. The catch-up warning matters
 * because Decision 6 makes a late catch-up arbitrarily large, and the number
 * should never be a surprise.
 */

import prisma from "../../config/prisma"
import { periodStatusFor } from "../posting/posting.preflight"
import { loadRules, resolveAccountCode } from "../posting/posting.rules"

export interface PreflightItem {
  code: string
  message: string
}

export interface PreflightResult {
  blockers: PreflightItem[]
  warnings: PreflightItem[]
  ok: boolean
}

const monthEnd = (year: number, month: number) => new Date(Date.UTC(year, month, 0))
const monthIndexOf = (year: number, month: number) => year * 12 + (month - 1)
const DAY_MS = 24 * 60 * 60 * 1000

export async function depreciationPreflight(query: {
  year: number
  month: number
}): Promise<PreflightResult> {
  const blockers: PreflightItem[] = []
  const warnings: PreflightItem[] = []

  const date = monthEnd(query.year, query.month)
  const period = await periodStatusFor(prisma, date)
  if (!period.ok) {
    blockers.push({
      code: "PERIOD",
      message: `${period.label} is ${period.status.toLowerCase()} — depreciation for it cannot be posted.`,
    })
  }

  const [rules, assets, fy] = await Promise.all([
    loadRules(prisma, "ASSET_ACQUISITION"),
    prisma.asset.findMany({
      where: { capitalisedAt: { not: null } },
      select: {
        id: true, assetTag: true, purchaseDate: true, purchaseCostBdt: true,
        capitalisedAt: true,
        category: { select: { code: true, isConsumable: true } },
      },
    }),
    prisma.accountingPeriod.findFirst({
      where: { year: query.year, month: query.month },
      include: { financialYear: { select: { startDate: true } } },
    }),
  ])
  const fyStartMonth = fy?.financialYear?.startDate.getUTCMonth() ?? 7

  // Consumables were expensed, not capitalised; they are neither a blocker
  // nor a warning.
  const capitalised = assets.filter((a) => !a.category.isConsumable)

  // A category that maps to no account stops at draft; say so before the
  // draft is assembled. A class with no rate does the same.
  const classCodes: string[] = []
  for (const asset of capitalised) {
    try {
      classCodes.push(resolveAccountCode(rules, asset.category.code))
    } catch {
      blockers.push({
        code: "UNMAPPED_CATEGORY",
        message: `${asset.assetTag} is a ${asset.category.code} and no posting rule maps that category to an account.`,
      })
    }
  }
  const chart = await prisma.account.findMany({
    where: { code: { in: [...new Set(classCodes)] } },
    select: { code: true, depreciationRate: true, contraAccountId: true },
  })
  const rateByCode = new Map(chart.map((c) => [c.code, c.depreciationRate]))
  const contraByCode = new Map(chart.map((c) => [c.code, c.contraAccountId]))
  for (const code of new Set(classCodes)) {
    if (!rateByCode.get(code)) {
      blockers.push({
        code: "NO_RATE",
        message: `${code} has no depreciation rate. Choose one before drafting — depreciation will not file a nil charge.`,
      })
    }
    if (!contraByCode.get(code)) {
      blockers.push({
        code: "NO_CONTRA",
        message: `${code} has no linked accumulated-depreciation contra account.`,
      })
    }
  }

  const now = Date.now()
  for (const asset of capitalised) {
    if (asset.purchaseDate && asset.purchaseCostBdt === null) {
      warnings.push({
        code: "NO_COST",
        message: `${asset.assetTag} has a purchase date but no cost, so it cannot be depreciated and will be absent from the run.`,
      })
    }
    if (!asset.capitalisedAt && asset.purchaseDate) {
      const ageDays = (now - asset.purchaseDate.getTime()) / DAY_MS
      if (ageDays > 60) {
        warnings.push({
          code: "UNCAPITALISED",
          message: `${asset.assetTag} has not been capitalised for more than 60 days.`,
        })
      }
    }
    if (asset.capitalisedAt && asset.purchaseDate) {
      const months = monthIndexOf(query.year, query.month) - monthIndexOf(
        asset.purchaseDate.getUTCFullYear(),
        asset.purchaseDate.getUTCMonth() + 1
      )
      if (months > 3) {
        warnings.push({
          code: "LONG_CATCHUP",
          message: `${asset.assetTag} will be charged for ${months} months in one run. Check the number before posting.`,
        })
      }
    }
  }

  return { blockers, warnings, ok: blockers.length === 0 }
}
