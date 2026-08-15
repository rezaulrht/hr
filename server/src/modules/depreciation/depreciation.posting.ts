/**
 * Turns a run's charges into journal lines and posts them.
 *
 * The aggregation is the point: one debit line per (cost nature, class) pair,
 * one credit line per class — a hundred laptops is two lines, not two hundred.
 */

import type { SystemJournalInput } from "../accounting/accounting.types"
import { resolveAccountCode } from "../posting/posting.rules"
import type { ResolvedRules } from "../posting/posting.types"
import { dec, ZERO } from "../payroll/payroll.money"
import type { ComputedCharge } from "./depreciation.compute"

type Line = SystemJournalInput["lines"][number]

/**
 * `contraByClass` maps a PPE cost account code to its accumulated-depreciation
 * contra account code — "1114" → "1124". It comes from `Account.contraAccountId`
 * on the chart, the same relationship Annexure-A reads, so the journal can
 * never disagree with the schedule.
 */
export function buildDepreciationLines(
  charges: ComputedCharge[],
  contraByClass: Map<string, string>,
  rules: ResolvedRules
): Line[] {
  const debits = new Map<string, { accountCode: string; amount: ReturnType<typeof dec> }>()
  const credits = new Map<string, { accountCode: string; amount: ReturnType<typeof dec> }>()

  for (const c of charges) {
    const debitCode = resolveAccountCode(rules, c.costNature)
    const debit = debits.get(debitCode) ?? { accountCode: debitCode, amount: ZERO }
    debit.amount = debit.amount.plus(c.amount)
    debits.set(debitCode, debit)

    const contraCode = contraByClass.get(c.classAccountCode)
    if (!contraCode) {
      throw new Error(`No accumulated-depreciation contra is linked to account ${c.classAccountCode}`)
    }
    const credit = credits.get(contraCode) ?? { accountCode: contraCode, amount: ZERO }
    credit.amount = credit.amount.plus(c.amount)
    credits.set(contraCode, credit)
  }

  const debitLines = [...debits.values()]
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
    .map((d) => ({ accountCode: d.accountCode, debit: d.amount.toFixed(2) }))

  const creditLines = [...credits.values()]
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
    .map((c) => ({ accountCode: c.accountCode, credit: c.amount.toFixed(2) }))

  return [...debitLines, ...creditLines]
}
