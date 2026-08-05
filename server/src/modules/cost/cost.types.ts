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
  /**
   * Totals are per category *and* per currency. Two currencies under one
   * category are two rows, never one — adding BDT to USD produces a number
   * that is not money in any currency.
   */
  currency: Currency
  total: string
  paid: string
  outstanding: string
  billCount: number
}

export interface CurrencyTotal {
  currency: Currency
  total: string
  paid: string
  outstanding: string
}

export interface CostSummary {
  categories: CategoryTotal[]
  /**
   * One entry per currency present in the month, rather than a single
   * scalar. Almost always one (BDT), but an imported USD hosting bill must
   * not silently inflate the BDT figure.
   *
   * Deliberately not converted to a reporting currency here: that needs a
   * rate, and which rate is a judgement — `payroll.fx.ts` owns that decision
   * for documents that get paid. A spend summary reports what was spent.
   */
  totals: CurrencyTotal[]
  overdueCount: number
}
