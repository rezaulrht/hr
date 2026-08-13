/**
 * Statement of Financial Position.
 *
 * Sections come from `Account.type`; the subtotal headings from the roled
 * section groups; the lines from *their children*. That is one level deeper
 * than the Profit or Loss uses, and it is not an inconsistency — it is what
 * the audited document does.
 *
 * Balances are cumulative from inception and include CLOSING journals: the
 * year-end entry legitimately moves the figure into Retained Earnings, and
 * excluding it here would break Assets = Liabilities + Equity.
 *
 * The statement balances by identity rather than by check. A balanced trial
 * balance means Assets + Expenses = Liabilities + Equity + Income, therefore
 * Assets = Liabilities + Equity + (Income − Expenses) — and the derived
 * Profit/(Loss) for the period line under Equity is exactly that last term.
 * That is why it balances on any date, mid-year or not, with no plug.
 *
 * It also means the profit line needs no second query and no financial-year
 * lookup: a closed year's income and expense accounts self-cancel against
 * their own closing entry, so cumulative income less cumulative expenses is
 * precisely the current year's profit to date.
 */

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
  type ChartAccount,
} from "./statements.balances"
import { pnlNetProfit } from "./statements.pnl"
import {
  assertValidRange,
  describeRange,
  shiftBackOneYear,
  type DateRange,
} from "./statements.period"
import type {
  BreakdownRow,
  PositionResult,
  PositionSection,
  StatementLine,
} from "./statements.types"

interface SectionSpec {
  heading: string
  /** The roled group whose children are the lines. */
  role?: string
  /** The equity section is found by type, since `type: EQUITY` identifies it. */
  equityRoot?: true
}

const ASSET_SECTIONS: SectionSpec[] = [
  { heading: "Non-Current Assets", role: "NON_CURRENT_ASSETS" },
  { heading: "Current Assets", role: "CURRENT_ASSETS" },
]

const EQUITY_AND_LIABILITY_SECTIONS: SectionSpec[] = [
  { heading: "Shareholders' Equity", equityRoot: true },
  { heading: "Current Liabilities", role: "CURRENT_LIABILITIES" },
  { heading: "Non-Current Liabilities", role: "NON_CURRENT_LIABILITIES" },
]

function breakdownOf(
  chart: ChartIndex,
  roots: ChartAccount[],
  current: BalanceMap,
  comparative: BalanceMap
): BreakdownRow[] {
  return roots
    .flatMap((root) => chart.leavesUnder(root.id))
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

function buildSection(
  spec: SectionSpec,
  chart: ChartIndex,
  current: BalanceMap,
  comparative: BalanceMap
): PositionSection {
  const group = spec.equityRoot ? chart.equityRoot : (chart.byRole.get(spec.role!) ?? null)
  if (!group) {
    return { heading: spec.heading, lines: [], subtotal: { current: "0.00", comparative: "0.00" } }
  }

  const children = chart.childrenOf(group.id)
  const lines: StatementLine[] = []
  let subCurrent = ZERO
  let subComparative = ZERO

  // Accumulated depreciation is presented inside the cost line rather than
  // beside it, matching the single "Property, Plant & Equipment 126,350"
  // row in the audited statement. The arithmetic needs no special case:
  // PPE_COST carries a debit balance and PPE_ACCUM_DEP a credit one, so
  // their signed balances already sum correctly. Only the row is merged.
  const accumDep = children.find((c) => c.systemRole === "PPE_ACCUM_DEP")

  for (const child of children) {
    if (accumDep && child.id === accumDep.id) continue

    const roots = child.systemRole === "PPE_COST" && accumDep ? [child, accumDep] : [child]

    const cur = roots.reduce((t, r) => t.plus(sumLeaves(chart, current, r.id)), ZERO)
    const cmp = roots.reduce((t, r) => t.plus(sumLeaves(chart, comparative, r.id)), ZERO)

    subCurrent = subCurrent.plus(cur)
    subComparative = subComparative.plus(cmp)

    if (!isVisible(child, cur, cmp)) continue

    lines.push({
      key: child.id,
      label: child.name,
      code: child.code,
      current: cur.toFixed(2),
      comparative: cmp.toFixed(2),
      kind: "LINE",
      breakdown: breakdownOf(chart, roots, current, comparative),
    })
  }

  return {
    heading: spec.heading,
    lines,
    subtotal: { current: subCurrent.toFixed(2), comparative: subComparative.toFixed(2) },
  }
}

function totalOf(sections: PositionSection[], key: "current" | "comparative"): Prisma.Decimal {
  return sections.reduce((t, s) => t.plus(new Prisma.Decimal(s.subtotal[key])), ZERO)
}

export async function buildPosition(range: DateRange): Promise<PositionResult> {
  assertValidRange(range)
  await assertLedgerBalanced(range.to)

  const comparativeRange = shiftBackOneYear(range)
  const chart = await loadChart()

  const [current, comparative] = await Promise.all([
    balancesFor({ to: range.to, excludeClosing: false }),
    balancesFor({ to: comparativeRange.to, excludeClosing: false }),
  ])

  const assets = ASSET_SECTIONS.map((s) => buildSection(s, chart, current, comparative))
  const equityAndLiabilities = EQUITY_AND_LIABILITY_SECTIONS.map((s) =>
    buildSection(s, chart, current, comparative)
  )

  // The derived line, appended to the equity section and folded into its
  // subtotal. Never posted, never stored.
  const profitCurrent = pnlNetProfit(chart, current)
  const profitComparative = pnlNetProfit(chart, comparative)

  const equity = equityAndLiabilities[0]
  equity.lines.push({
    key: "PROFIT_FOR_PERIOD",
    label: "Profit/(Loss) for the period",
    code: null,
    current: profitCurrent.toFixed(2),
    comparative: profitComparative.toFixed(2),
    kind: "DERIVED",
    breakdown: [],
  })
  equity.subtotal = {
    current: new Prisma.Decimal(equity.subtotal.current).plus(profitCurrent).toFixed(2),
    comparative: new Prisma.Decimal(equity.subtotal.comparative)
      .plus(profitComparative)
      .toFixed(2),
  }

  const totalAssetsCurrent = totalOf(assets, "current")
  const totalEquityLiabCurrent = totalOf(equityAndLiabilities, "current")

  return {
    period: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      label: describeRange(range),
    },
    comparative: {
      from: comparativeRange.from.toISOString(),
      to: comparativeRange.to.toISOString(),
      label: describeRange(comparativeRange),
    },
    assets,
    totalAssets: {
      current: totalAssetsCurrent.toFixed(2),
      comparative: totalOf(assets, "comparative").toFixed(2),
    },
    equityAndLiabilities,
    totalEquityAndLiabilities: {
      current: totalEquityLiabCurrent.toFixed(2),
      comparative: totalOf(equityAndLiabilities, "comparative").toFixed(2),
    },
    // Reported rather than thrown. If this is ever false it is a bug in this
    // file, not bad data — the trial-balance guard already ran.
    balances: totalAssetsCurrent.equals(totalEquityLiabCurrent),
  }
}
