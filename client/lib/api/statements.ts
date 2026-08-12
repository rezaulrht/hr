import { apiFetch } from "./client"
import type { EquityResult, PnlResult, PositionResult } from "./types"

export interface StatementRange {
  from: string
  to: string
}

function qs({ from, to }: StatementRange): string {
  return `?${new URLSearchParams({ from, to }).toString()}`
}

export function getProfitOrLoss(
  accessToken: string,
  range: StatementRange
): Promise<PnlResult> {
  return apiFetch<PnlResult>(`/api/statements/profit-or-loss${qs(range)}`, { accessToken })
}

export function getFinancialPosition(
  accessToken: string,
  range: StatementRange
): Promise<PositionResult> {
  return apiFetch<PositionResult>(`/api/statements/financial-position${qs(range)}`, {
    accessToken,
  })
}

export function getChangesInEquity(
  accessToken: string,
  range: StatementRange
): Promise<EquityResult> {
  return apiFetch<EquityResult>(`/api/statements/changes-in-equity${qs(range)}`, { accessToken })
}
