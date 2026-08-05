import type { CostStatus, Currency } from "../../generated/prisma/client"

/** The minimum a bill must expose for the pure helpers to judge it. */
export interface BillLike {
  status: CostStatus
  dueDate: Date | null
  amount: unknown // Prisma.Decimal at runtime; the helpers only sum it
  currency: Currency
  categoryId: string
  categoryName: string
}

export interface CategoryTotal {
  categoryId: string
  categoryName: string
  total: string
  paid: string
  outstanding: string
  billCount: number
}

export interface CostSummary {
  categories: CategoryTotal[]
  total: string
  paid: string
  outstanding: string
  overdueCount: number
}
