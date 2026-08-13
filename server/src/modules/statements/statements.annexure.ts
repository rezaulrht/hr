import { Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { balancesFor, loadChart, ZERO, type BalanceMap, type ChartAccount, type ChartIndex } from "./statements.balances"
import { assertValidRange, describeRange, type DateRange } from "./statements.period"
import type { AnnexureResult, AnnexureRow } from "./statements.types"

const two = (d: Prisma.Decimal) => d.toFixed(2)
const openingOf = (balances: BalanceMap, id: string) => (balances.get(id)?.signed ?? ZERO).abs()
const debitMovement = (balances: BalanceMap, id: string) => balances.get(id)?.debit ?? ZERO
const creditMovement = (balances: BalanceMap, id: string) => balances.get(id)?.credit ?? ZERO
const dayBefore = (date: Date) => new Date(date.getTime() - 24 * 60 * 60 * 1000)

function requireContra(chart: ChartIndex, cost: ChartAccount): ChartAccount {
  const contra = cost.contraAccountId ? chart.byId.get(cost.contraAccountId) : undefined
  if (!contra) throw new AppError(409, `${cost.code} ${cost.name} has no accumulated-depreciation account linked to it, so Annexure-A cannot show its depreciation. Link one in the chart of accounts.`, { accountId: cost.id, code: cost.code })
  return contra
}

export async function annexureA(range: DateRange): Promise<AnnexureResult> {
  assertValidRange(range)
  const chart = await loadChart()
  const ppe = chart.byRole.get("PPE_COST")
  const [opening, movement] = await Promise.all([
    balancesFor({ to: dayBefore(range.from), excludeClosing: false }),
    balancesFor({ from: range.from, to: range.to, excludeClosing: false }),
  ])
  const classes = ppe ? chart.childrenOf(ppe.id) : []
  const rows: AnnexureRow[] = classes.map((cost) => {
    const contra = requireContra(chart, cost)
    const costOpening = openingOf(opening, cost.id)
    const costAddition = debitMovement(movement, cost.id)
    const costClosing = costOpening.plus(costAddition)
    const depOpening = openingOf(opening, contra.id)
    const depCharged = creditMovement(movement, contra.id)
    const depClosing = depOpening.plus(depCharged)
    return { accountId: cost.id, particulars: cost.name, rate: cost.depreciationRate ? cost.depreciationRate.toFixed(2) : null, costOpening: two(costOpening), costAddition: two(costAddition), costClosing: two(costClosing), depOpening: two(depOpening), depCharged: two(depCharged), depClosing: two(depClosing), writtenDownValue: two(costClosing.minus(depClosing)) }
  })
  const sum = (pick: (r: AnnexureRow) => string) => two(rows.reduce((t, r) => t.plus(new Prisma.Decimal(pick(r))), ZERO))
  return { period: { from: range.from.toISOString(), to: range.to.toISOString(), label: describeRange(range) }, rows, total: { costOpening: sum((r) => r.costOpening), costAddition: sum((r) => r.costAddition), costClosing: sum((r) => r.costClosing), depOpening: sum((r) => r.depOpening), depCharged: sum((r) => r.depCharged), depClosing: sum((r) => r.depClosing), writtenDownValue: sum((r) => r.writtenDownValue) } }
}

export function assertAnnexureTiesToPosition(annexure: AnnexureResult, positionPpe: Prisma.Decimal): void {
  const wdv = new Prisma.Decimal(annexure.total.writtenDownValue)
  if (wdv.equals(positionPpe)) return
  throw new AppError(409, `Annexure-A does not agree with the Statement of Financial Position: the schedule shows a written-down value of ${annexure.total.writtenDownValue} against ${positionPpe.toFixed(2)} on the balance sheet.`, { annexure: annexure.total.writtenDownValue, position: positionPpe.toFixed(2) })
}
