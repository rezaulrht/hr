/** Monthly totals by category — thin, over `cost.derive.ts`'s pure summariser. */

import prisma from "../../config/prisma"
import { summariseCosts } from "./cost.derive"

export async function monthlySummary(year: number, month: number) {
  const bills = await prisma.operatingCost.findMany({
    where: { periodYear: year, periodMonth: month },
    include: { category: true },
  })

  const rows = bills.map((bill) => ({
    status: bill.status,
    dueDate: bill.dueDate,
    amount: bill.amount,
    currency: bill.currency,
    categoryId: bill.categoryId,
    categoryName: bill.category.name,
  }))

  return summariseCosts(rows, new Date())
}
