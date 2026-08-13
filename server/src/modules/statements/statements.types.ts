/**
 * Read-model shapes for the statements. Declared here rather than inferred
 * from Prisma, because what a statement returns is a computed row, not a
 * table row. Money crosses the API boundary as a decimal string.
 */

export interface StatementPeriod {
  from: string
  to: string
  /** "July 2026" — so the client need not re-derive the label. */
  label: string
}

export interface BreakdownRow {
  accountId: string
  code: string
  name: string
  current: string
  comparative: string
}

export interface StatementLine {
  /** systemRole for a rolled-up line, accountId for a leaf, a slug for a subtotal. */
  key: string
  label: string
  code: string | null
  current: string
  comparative: string
  kind: "LINE" | "SUBTOTAL" | "DERIVED"
  /** The accounts making this line up. Empty for subtotals and derived lines. */
  breakdown: BreakdownRow[]
}

export interface PnlResult {
  period: StatementPeriod
  comparative: StatementPeriod
  lines: StatementLine[]
  netProfit: { current: string; comparative: string }
}

export interface PositionSection {
  heading: string
  lines: StatementLine[]
  subtotal: { current: string; comparative: string }
}

export interface PositionResult {
  period: StatementPeriod
  comparative: StatementPeriod
  assets: PositionSection[]
  totalAssets: { current: string; comparative: string }
  equityAndLiabilities: PositionSection[]
  totalEquityAndLiabilities: { current: string; comparative: string }
  /** Assets === Equity + Liabilities. False means a bug, not bad data. */
  balances: boolean
}

export interface EquityColumn {
  accountId: string
  code: string
  name: string
}

export interface EquityRow {
  label: string
  /** Keyed by accountId, matching `columns`. */
  values: Record<string, string>
  total: string
  kind: "OPENING" | "MOVEMENT" | "PROFIT" | "CLOSING"
}

/**
 * No comparative. A Statement of Changes in Equity is self-comparative — it
 * carries its own opening and closing balances — which is why the audited
 * FY 2024-25 version has no prior-year column either.
 */
export interface EquityResult {
  period: StatementPeriod
  columns: EquityColumn[]
  rows: EquityRow[]
}

export interface CashFlowRow {
  key: string
  label: string
  current: string
  comparative: string
  isSubtotal?: boolean
}

export interface CashFlowResult {
  period: StatementPeriod
  comparativePeriod: StatementPeriod
  operating: CashFlowRow[]
  investing: CashFlowRow[]
  financing: CashFlowRow[]
  summary: CashFlowRow[]
}
