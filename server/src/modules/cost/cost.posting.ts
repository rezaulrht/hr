import { Prisma } from "../../generated/prisma/client"
import type { Currency, Prisma as PrismaNamespace } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { SystemJournalInput } from "../accounting/accounting.types"
import { postSystemJournal } from "../accounting/accounting.posting"
import { toLedgerDate } from "../accounting/accounting.utils"
import { loadRules, resolveAccountCode } from "../posting/posting.rules"
import type { ResolvedRules } from "../posting/posting.types"

type Line = SystemJournalInput["lines"][number]

export interface CostForPosting {
  id: string
  categoryCode: string
  label: string
  payee: string
  amount: Prisma.Decimal
  periodMonth: number
  periodYear: number
  currency: Currency
}

export function buildCostAccrualLines(cost: CostForPosting, rules: ResolvedRules): Line[] {
  const amount = cost.amount.toFixed(2)
  return [
    { accountCode: resolveAccountCode(rules, cost.categoryCode), debit: amount, narration: `${cost.label} — ${cost.payee}` },
    { accountCode: resolveAccountCode(rules, "PAYABLE"), credit: amount, narration: `${cost.label} — ${cost.payee}` },
  ]
}

export function buildCostPaymentLines(cost: CostForPosting, rules: ResolvedRules): Line[] {
  const amount = cost.amount.toFixed(2)
  return [
    { accountCode: resolveAccountCode(rules, "PAYABLE"), debit: amount, narration: `${cost.label} — ${cost.payee}` },
    { accountCode: resolveAccountCode(rules, "BANK"), credit: amount, narration: `${cost.label} — ${cost.payee}` },
  ]
}

/**
 * `OperatingCost` stores an amount and a currency but freezes no rate, unlike
 * every other document that posts. Converting at post time would give the
 * accrual and the payment different rates, leaving a residue on Trade and
 * other Payables that never clears and that no account exists to absorb —
 * the "no FX gain or loss" limitation the spec records.
 *
 * So a non-BDT cost is refused rather than mis-posted, on both events. It was
 * refused on the accrual alone, which left the worse case open: an existing
 * USD bill could still be paid, booking USD 500 as ৳500.
 */
function assertPostable(cost: CostForPosting): void {
  if (cost.currency === "BDT") return
  throw new AppError(
    400,
    `${cost.label} is recorded in ${cost.currency}, and operating costs do not carry an exchange rate, so it cannot be posted to the ledger. Record it in BDT.`,
    { costId: cost.id, currency: cost.currency }
  )
}

async function loadCost(tx: PrismaNamespace.TransactionClient, costId: string): Promise<CostForPosting> {
  const cost = await tx.operatingCost.findUnique({
    where: { id: costId },
    select: { id: true, label: true, payee: true, amount: true, periodMonth: true, periodYear: true, currency: true, category: { select: { code: true } } },
  })
  if (!cost) throw new AppError(404, "Cost not found")
  return { ...cost, categoryCode: cost.category.code }
}

export async function postCostAccrual(tx: PrismaNamespace.TransactionClient, costId: string, actorUserId: string) {
  const [cost, rules] = await Promise.all([loadCost(tx, costId), loadRules(tx, "COST_ACCRUAL")])
  assertPostable(cost)
  // Decision 10: dated to when it was recorded, not to the month it relates
  // to. July's electricity bill arrives on 5 August, and dating the accrual
  // into July would be refused by a closed period essentially every month.
  // `periodMonth`/`periodYear` stay what they were built for — reporting
  // which month a bill belongs to — and the ledger date is when it was
  // entered.
  return postSystemJournal(tx, {
    date: toLedgerDate(new Date()),
    narration: `${cost.label} — ${cost.payee}`,
    source: { module: "COST", refId: costId, event: "ACCRUAL" },
    lines: buildCostAccrualLines(cost, rules),
    createdBy: actorUserId,
  })
}

export async function postCostPayment(tx: PrismaNamespace.TransactionClient, costId: string, actorUserId: string, paidAt: Date) {
  const [cost, rules] = await Promise.all([loadCost(tx, costId), loadRules(tx, "COST_PAYMENT")])
  assertPostable(cost)
  return postSystemJournal(tx, {
    date: toLedgerDate(paidAt),
    narration: `Payment — ${cost.label} — ${cost.payee}`,
    source: { module: "COST", refId: costId, event: "PAYMENT" },
    lines: buildCostPaymentLines(cost, rules),
    createdBy: actorUserId,
  })
}
