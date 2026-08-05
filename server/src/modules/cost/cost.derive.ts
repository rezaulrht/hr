/**
 * Derived, never stored, facts about operating costs.
 *
 * `CostStatus` only ever stores PENDING/PAID. Overdue is a read-time
 * judgement, not a third status: a stored overdue flag would need a job to
 * unset it the instant a bill is paid, and it drifts the moment nobody runs
 * that job. Deriving it from `dueDate` on every read makes that class of
 * stale data unreachable — the same rule `asset.status.ts` applies to
 * lifecycle vs. custody.
 *
 * Pure — no Prisma, no Express — so its tests need no mocks, following the
 * `asset.status.ts` / `payroll.calc.ts` precedent.
 */

import type { Currency } from "../../generated/prisma/client"
import { dec, sum, toMoneyString, type MoneyInput } from "../payroll/payroll.money"
import type { BillLike, CategoryTotal, CostSummary, CurrencyTotal } from "./cost.types"

/** The only fields `isOverdue` actually judges — not the whole bill. */
export type OverdueInput = Pick<BillLike, "status" | "dueDate">

/**
 * A bill is overdue only while it is still PENDING and its due date has
 * passed. Due *today* is not yet late — the boundary matters most at month
 * end, where "due today" and "a day late" are one calendar day apart.
 */
export function isOverdue(bill: OverdueInput, asOf: Date): boolean {
  return bill.status === "PENDING" && bill.dueDate !== null && bill.dueDate < asOf
}

const totalOf = (rows: BillLike[]) => sum(rows.map((row) => dec(row.amount as MoneyInput)))
const paidOf = (rows: BillLike[]) => totalOf(rows.filter((row) => row.status === "PAID"))

/**
 * Groups bills by category, sums with the shared money helpers, and splits
 * paid from outstanding. Counts overdue *bills*, not overdue categories.
 *
 * A month with no bills is a real answer, not an absent one — an empty list
 * returns zeroed totals rather than null, so every caller does not have to
 * separately handle "zero" as a special case.
 */
export function summariseCosts(bills: BillLike[], asOf: Date): CostSummary {
  // Keyed by category AND currency. Summing a USD hosting bill into a BDT
  // rent total produces a figure that is not money in either currency, and
  // it is the headline number on the screen — so the split is structural
  // rather than something the caller is trusted to remember.
  const byBucket = new Map<
    string,
    { categoryId: string; categoryName: string; currency: Currency; rows: BillLike[] }
  >()

  for (const bill of bills) {
    const key = `${bill.categoryId}::${bill.currency}`
    const bucket = byBucket.get(key)
    if (bucket) {
      bucket.rows.push(bill)
    } else {
      byBucket.set(key, {
        categoryId: bill.categoryId,
        categoryName: bill.categoryName,
        currency: bill.currency,
        rows: [bill],
      })
    }
  }

  const categories: CategoryTotal[] = Array.from(byBucket.values()).map(
    ({ categoryId, categoryName, currency, rows }) => {
      const total = totalOf(rows)
      const paid = paidOf(rows)
      return {
        categoryId,
        categoryName,
        currency,
        total: toMoneyString(total),
        paid: toMoneyString(paid),
        outstanding: toMoneyString(total.minus(paid)),
        billCount: rows.length,
      }
    }
  )

  const currencies = Array.from(new Set(bills.map((bill) => bill.currency)))
  const totals: CurrencyTotal[] = currencies.map((currency) => {
    const rows = bills.filter((bill) => bill.currency === currency)
    const total = totalOf(rows)
    const paid = paidOf(rows)
    return {
      currency,
      total: toMoneyString(total),
      paid: toMoneyString(paid),
      outstanding: toMoneyString(total.minus(paid)),
    }
  })

  return {
    categories,
    totals,
    overdueCount: bills.filter((bill) => isOverdue(bill, asOf)).length,
  }
}
