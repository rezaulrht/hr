/**
 * Statement of Changes in Equity.
 *
 * Columns are the children of the Equity root; rows are opening balance,
 * one row per equity account that moved, the profit for the period, and the
 * closing balance.
 *
 * A movement row is labelled with its **account name**, not with an event.
 * The system cannot know whether a credit to Share Capital was an issue, a
 * bonus issue or a correction, and naming it wrongly on a filed statement is
 * worse than naming it plainly.
 *
 * **Why the CLOSING split is what makes this tie.** Movement rows exclude
 * CLOSING journals; the profit row carries what the closing entry would have
 * moved. In a closed year the Retained Earnings column therefore shows no
 * movement of its own and the profit row accounts for the whole change —
 * while the ledger balance, read with the closing journal included, lands on
 * exactly the same figure by a different route. Task 6 asserts that.
 *
 * The closing row is the computed sum, not the ledger balance, because
 * mid-year they legitimately differ: nothing has posted to Retained Earnings
 * yet, so the ledger shows only the opening figure while the statement must
 * show the profit earned so far. Total equity agrees with the balance sheet
 * either way, since that carries the same derived profit line.
 *
 * There is no comparative. A Statement of Changes in Equity is
 * self-comparative — it carries its own opening and closing balances — which
 * is why the audited FY 2024-25 version has no prior-year column either.
 */

import { Prisma } from "../../generated/prisma/client"
import {
  assertLedgerBalanced,
  balancesFor,
  loadChart,
  sumLeaves,
  ZERO,
  type BalanceMap,
} from "./statements.balances"
import { pnlNetProfit } from "./statements.pnl"
import {
  assertValidRange,
  describeRange,
  type DateRange,
} from "./statements.period"
import type { EquityColumn, EquityResult, EquityRow } from "./statements.types"

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function dayBefore(date: Date): Date {
  return new Date(date.getTime() - ONE_DAY_MS)
}

function row(
  label: string,
  kind: EquityRow["kind"],
  columns: EquityColumn[],
  valueFor: (column: EquityColumn) => Prisma.Decimal
): EquityRow {
  const values: Record<string, string> = {}
  let total = ZERO
  for (const column of columns) {
    const value = valueFor(column)
    values[column.accountId] = value.toFixed(2)
    total = total.plus(value)
  }
  return { label, kind, values, total: total.toFixed(2) }
}

export async function buildEquity(range: DateRange): Promise<EquityResult> {
  assertValidRange(range)
  await assertLedgerBalanced(range.to)

  const chart = await loadChart()
  const equityRoot = chart.equityRoot

  const columns: EquityColumn[] = equityRoot
    ? chart.childrenOf(equityRoot.id).map((a) => ({ accountId: a.id, code: a.code, name: a.name }))
    : []

  // Three reads, in this order. The middle one is the reason this ties.
  const [opening, movement, profitBalances] = await Promise.all([
    balancesFor({ to: dayBefore(range.from), excludeClosing: false }),
    balancesFor({ from: range.from, to: range.to, excludeClosing: true }),
    balancesFor({ from: range.from, to: range.to, excludeClosing: true }),
  ])

  const profit = pnlNetProfit(chart, profitBalances)
  const retained = chart.byRole.get("RETAINED_EARNINGS")

  const valueIn = (balances: BalanceMap) => (column: EquityColumn) =>
    sumLeaves(chart, balances, column.accountId)

  const rows: EquityRow[] = [row(`Balance at ${describeRange({ from: range.from, to: range.from })}`, "OPENING", columns, valueIn(opening))]

  // One row per account that actually moved. An account that did not move
  // gets no row at all, rather than a row of dashes.
  for (const column of columns) {
    const moved = sumLeaves(chart, movement, column.accountId)
    if (moved.isZero()) continue
    rows.push(
      row(column.name, "MOVEMENT", columns, (c) =>
        c.accountId === column.accountId ? moved : ZERO
      )
    )
  }

  rows.push(
    row("Profit/(Loss) for the period", "PROFIT", columns, (c) =>
      retained && c.accountId === retained.id ? profit : ZERO
    )
  )

  // Computed, not read back from the ledger — see the file comment.
  rows.push(
    row(`Balance at ${describeRange({ from: range.to, to: range.to })}`, "CLOSING", columns, (c) => {
      const base = sumLeaves(chart, opening, c.accountId).plus(
        sumLeaves(chart, movement, c.accountId)
      )
      return retained && c.accountId === retained.id ? base.plus(profit) : base
    })
  )

  return {
    period: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      label: describeRange(range),
    },
    columns,
    rows,
  }
}
