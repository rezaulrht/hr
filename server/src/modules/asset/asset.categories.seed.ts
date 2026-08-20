/**
 * The starter asset categories.
 *
 * Lives here rather than in `prisma/seed.ts` for the same reason
 * `accounting.seed.ts` and `posting.rules.seed.ts` do: reference data the
 * running code resolves against has to be importable on its own. `seed.ts`
 * calls `main()` at module level, so anything importing from it would run
 * the entire seed — including the demo users and the announcements, which
 * are created rather than upserted and would duplicate.
 *
 * Idempotent on `code`, and `update: {}` so a re-run never overwrites a
 * useful life or a name somebody has since edited.
 */

import prisma from "../../config/prisma"
import type { Prisma } from "../../generated/prisma/client"

export const ASSET_CATEGORIES: Prisma.AssetCategoryCreateInput[] = [
  { code: "LAPTOP", name: "Laptop", requiresSerial: true, isConsumable: false, usefulLifeMonths: 36, classification: "IT", tracksIndividually: true },
  { code: "MONITOR", name: "Monitor", requiresSerial: true, isConsumable: false, usefulLifeMonths: 36, classification: "IT", tracksIndividually: true },
  { code: "PHONE", name: "Phone", requiresSerial: true, isConsumable: false, usefulLifeMonths: 24, classification: "IT", tracksIndividually: true },
  { code: "FURNITURE", name: "Furniture", requiresSerial: false, isConsumable: false, usefulLifeMonths: 60, classification: "NON_IT", tracksIndividually: true },
  { code: "LICENCE", name: "Software licence", requiresSerial: false, isConsumable: false, usefulLifeMonths: 12, classification: "IT", tracksIndividually: true },
  // A supply: issued by quantity, never registered as individual rows. Ten
  // pens is one fact, not ten assets with ten tags.
  { code: "STATIONERY", name: "Stationery", requiresSerial: false, isConsumable: true, usefulLifeMonths: null, classification: "NON_IT", tracksIndividually: false },
]

export async function seedAssetCategories(): Promise<void> {
  for (const category of ASSET_CATEGORIES) {
    await prisma.assetCategory.upsert({
      where: { code: category.code },
      update: {},
      create: category,
    })
  }
}
