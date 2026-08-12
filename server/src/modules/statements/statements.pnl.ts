/**
 * Statement of Profit or Loss.
 *
 * Every line is a roled group. There is no positional inference and no code
 * range anywhere in this file — the shape below is the audited FY 2024-25
 * statement, expressed once.
 *
 * Both periods exclude CLOSING journals (spec Decision 1). Without that, a
 * closed year's report reads as a page of dashes: the year-end entry credits
 * every expense account and debits every revenue account on the last day of
 * the year, so an unfiltered sum over that year nets each account to zero.
 */

import type { Account } from "../../generated/prisma/client"
import { Prisma } from "../../generated/prisma/client"
import {
  assertLedgerBalanced,
  balancesFor,
  isVisible,
  loadChart,
  sumLeaves,
  ZERO,
  type BalanceMap,
  type ChartIndex,
} from "./statements.balances"
import {
  assertValidRange,
  describeRange,
  shiftBackOneYear,
  type DateRange,
} from "./statements.period"
import type { BreakdownRow, PnlResult, StatementLine } from "./statements.types"

interface RowSpec {
  key: string
  label: string
  /** Present on a rolled-up line, absent on a subtotal. */
  role?: string
  /** How the line moves the running total. Income adds, expense subtracts. */
  sign?: 1 | -1
}

/** The audited statement's shape, in its order. */
const ROWS: RowSpec[] = [
  { key: "REVENUE", role: "REVENUE", label: "Revenue", sign: 1 },
  { key: "COST_OF_SALES", role: "COST_OF_SALES", label: "Less: Cost of Goods Sold", sign: -1 },
  { key: "GROSS_PROFIT", label: "Gross Profit/(Loss)" },
  {
    key: "ADMIN_SELLING",
    role: "ADMIN_SELLING",
    label: "Less: Administrative & Selling Expenses",
    sign: -1,
  },
  { key: "OPERATING_PROFIT", label: "Operating Profit/(Loss)" },
  { key: "OTHER_INCOME", role: "OTHER_INCOME", label: "Add: Other Income", sign: 1 },
  {
    key: "FINANCIAL_EXPENSE",
    role: "FINANCIAL_EXPENSE",
    label: "Less: Financial Expenses",
    sign: -1,
  },
  { key: "PROFIT_BEFORE_TAX", label: "Net Profit/(Loss) Before Tax" },
  { key: "TAX_EXPENSE", role: "TAX_EXPENSE", label: "Less: Income Tax Expense", sign: -1 },
  { key: "PROFIT_AFTER_TAX", label: "Net Profit/(Loss) After Tax" },
]

function breakdownFor(
  chart: ChartIndex,
  group: Account,
  current: BalanceMap,
  comparative: BalanceMap
): BreakdownRow[] {
  return chart
    .leavesUnder(group.id)
    .map((leaf) => ({
      leaf,
      cur: current.get(leaf.id)?.signed ?? ZERO,
      cmp: comparative.get(leaf.id)?.signed ?? ZERO,
    }))
    .filter(({ leaf, cur, cmp }) => isVisible(leaf, cur, cmp))
    .map(({ leaf, cur, cmp }) => ({
      accountId: leaf.id,
      code: leaf.code,
      name: leaf.name,
      current: cur.toFixed(2),
      comparative: cmp.toFixed(2),
    }))
}

/**
 * Net profit for a set of balances. Exported because the Statement of
 * Changes in Equity needs the same figure from the same rule, and two
 * implementations of "profit" is how two statements come to disagree.
 */
export function pnlNetProfit(chart: ChartIndex, balances: BalanceMap): Prisma.Decimal {
  let income = ZERO
  let expense = ZERO
  for (const account of chart.all) {
    if (account.isGroup) continue
    const signed = balances.get(account.id)?.signed ?? ZERO
    if (account.type === "INCOME") income = income.plus(signed)
    else if (account.type === "EXPENSE") expense = expense.plus(signed)
  }
  return income.minus(expense)
}

export async function buildPnl(range: DateRange): Promise<PnlResult> {
  assertValidRange(range)
  await assertLedgerBalanced(range.to)

  const comparativeRange = shiftBackOneYear(range)
  const chart = await loadChart()

  const [current, comparative] = await Promise.all([
    balancesFor({ from: range.from, to: range.to, excludeClosing: true }),
    balancesFor({
      from: comparativeRange.from,
      to: comparativeRange.to,
      excludeClosing: true,
    }),
  ])

  let runningCurrent = ZERO
  let runningComparative = ZERO
  const lines: StatementLine[] = []

  for (const spec of ROWS) {
    if (!spec.role) {
      lines.push({
        key: spec.key,
        label: spec.label,
        code: null,
        current: runningCurrent.toFixed(2),
        comparative: runningComparative.toFixed(2),
        kind: "SUBTOTAL",
        breakdown: [],
      })
      continue
    }

    const group = chart.byRole.get(spec.role)
    // A chart missing a role still renders, as a nil line. Throwing here
    // would take the whole statement down over one unclassified group.
    const cur = group ? sumLeaves(chart, current, group.id) : ZERO
    const cmp = group ? sumLeaves(chart, comparative, group.id) : ZERO

    runningCurrent = runningCurrent.plus(cur.times(spec.sign!))
    runningComparative = runningComparative.plus(cmp.times(spec.sign!))

    lines.push({
      key: spec.key,
      label: spec.label,
      code: group?.code ?? null,
      current: cur.toFixed(2),
      comparative: cmp.toFixed(2),
      kind: "LINE",
      breakdown: group ? breakdownFor(chart, group, current, comparative) : [],
    })
  }

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString(), label: describeRange(range) },
    comparative: {
      from: comparativeRange.from.toISOString(),
      to: comparativeRange.to.toISOString(),
      label: describeRange(comparativeRange),
    },
    lines,
    netProfit: {
      current: runningCurrent.toFixed(2),
      comparative: runningComparative.toFixed(2),
    },
  }
}
