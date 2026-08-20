/**
 * The starter operating-cost categories.
 *
 * A table rather than an enum because Finance will add "gas bill" and no
 * code branches on the name. Extracted from `prisma/seed.ts` so it can be
 * imported without running the whole seed — see the note in
 * `asset.categories.seed.ts`.
 */

import prisma from "../../config/prisma"

export const COST_CATEGORIES = [
  { code: "RENT", name: "Office rent" },
  { code: "ELECTRICITY", name: "Electricity" },
  { code: "WATER", name: "Water" },
  { code: "INTERNET", name: "Internet" },
  { code: "CLEANING", name: "Cleaning" },
  { code: "SECURITY", name: "Security" },
  { code: "MAINTENANCE", name: "Maintenance" },
  { code: "OTHER", name: "Other" },
  { code: "STATIONERY", name: "Stationery and office supplies" },
]

export async function seedCostCategories(): Promise<void> {
  for (const category of COST_CATEGORIES) {
    await prisma.costCategory.upsert({
      where: { code: category.code },
      update: {},
      create: category,
    })
  }
}
