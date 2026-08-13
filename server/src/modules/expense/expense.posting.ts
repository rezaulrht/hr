import { Prisma } from "../../generated/prisma/client"
import type { Currency, Prisma as PrismaNamespace } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { SystemJournalInput } from "../accounting/accounting.types"
import { postSystemJournal } from "../accounting/accounting.posting"
import { toLedgerDate } from "../accounting/accounting.utils"
import { loadRules, resolveAccountCode } from "../posting/posting.rules"
import type { ResolvedRules } from "../posting/posting.types"

type Line = SystemJournalInput["lines"][number]
export interface ClaimForPosting { id: string; employeeId: string; departmentId: string; categoryCode: string; currency: Currency; amount: Prisma.Decimal; fxRateToBdt: Prisma.Decimal | null; description: string | null }

export function buildClaimAccrualLines(claim: ClaimForPosting, rules: ResolvedRules): Line[] {
  const rate = claim.fxRateToBdt ?? new Prisma.Decimal(1)
  const bdt = new Prisma.Decimal(claim.amount.times(rate).toFixed(2))
  const memo = claim.currency === "BDT" ? {} : { sourceCurrency: claim.currency, sourceAmount: claim.amount.toFixed(2), fxRateToBdt: rate.toFixed(6) }
  const dimensions = { employeeId: claim.employeeId, departmentId: claim.departmentId }
  return [
    { accountCode: resolveAccountCode(rules, claim.categoryCode), debit: bdt.toFixed(2), narration: claim.description ?? undefined, ...dimensions, ...memo },
    { accountCode: resolveAccountCode(rules, "REIMBURSEMENT"), credit: bdt.toFixed(2), ...dimensions },
  ]
}

export async function postExpenseAccrual(tx: PrismaNamespace.TransactionClient, claimId: string, actorUserId: string) {
  const claim = await tx.expenseClaim.findUnique({ where: { id: claimId }, select: { id: true, employeeId: true, currency: true, amount: true, fxRateToBdt: true, description: true, category: { select: { code: true } }, employee: { select: { departmentId: true } } } })
  if (!claim) throw new AppError(404, "Claim not found")
  const rules = await loadRules(tx, "EXPENSE_ACCRUAL")
  return postSystemJournal(tx, { date: toLedgerDate(new Date()), narration: `Expense claim ${claim.description ?? claim.id}`, source: { module: "EXPENSE", refId: claimId, event: "ACCRUAL" }, lines: buildClaimAccrualLines({ ...claim, departmentId: claim.employee.departmentId, categoryCode: claim.category.code }, rules), createdBy: actorUserId })
}
