import { Prisma } from "../../generated/prisma/client"
import type { Prisma as PrismaNamespace } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { SystemJournalInput } from "../accounting/accounting.types"
import { postSystemJournal } from "../accounting/accounting.posting"
import { toLedgerDate } from "../accounting/accounting.utils"
import { loadRules, resolveAccountCode } from "../posting/posting.rules"
import type { ResolvedRules } from "../posting/posting.types"

type Line = SystemJournalInput["lines"][number]
export interface CostForPosting { id: string; categoryCode: string; label: string; payee: string; amount: Prisma.Decimal }
export function buildCostAccrualLines(cost: CostForPosting, rules: ResolvedRules): Line[] { const amount = cost.amount.toFixed(2); return [{ accountCode: resolveAccountCode(rules, cost.categoryCode), debit: amount, narration: `${cost.label} — ${cost.payee}` }, { accountCode: resolveAccountCode(rules, "PAYABLE"), credit: amount }] }
export function buildCostPaymentLines(cost: CostForPosting, rules: ResolvedRules): Line[] { const amount = cost.amount.toFixed(2); return [{ accountCode: resolveAccountCode(rules, "PAYABLE"), debit: amount, narration: `${cost.label} — ${cost.payee}` }, { accountCode: resolveAccountCode(rules, "BANK"), credit: amount }] }
async function loadCost(tx: PrismaNamespace.TransactionClient, costId: string): Promise<CostForPosting> { const cost = await tx.operatingCost.findUnique({ where: { id: costId }, select: { id: true, label: true, payee: true, amount: true, category: { select: { code: true } } } }); if (!cost) throw new AppError(404, "Cost not found"); return { ...cost, categoryCode: cost.category.code } }
export async function postCostAccrual(tx: PrismaNamespace.TransactionClient, costId: string, actorUserId: string) { const [cost, rules] = await Promise.all([loadCost(tx, costId), loadRules(tx, "COST_ACCRUAL")]); return postSystemJournal(tx, { date: toLedgerDate(new Date()), narration: `${cost.label} — ${cost.payee}`, source: { module: "COST", refId: costId, event: "ACCRUAL" }, lines: buildCostAccrualLines(cost, rules), createdBy: actorUserId }) }
export async function postCostPayment(tx: PrismaNamespace.TransactionClient, costId: string, actorUserId: string, paidAt: Date) { const [cost, rules] = await Promise.all([loadCost(tx, costId), loadRules(tx, "COST_PAYMENT")]); return postSystemJournal(tx, { date: toLedgerDate(paidAt), narration: `Payment — ${cost.label} — ${cost.payee}`, source: { module: "COST", refId: costId, event: "PAYMENT" }, lines: buildCostPaymentLines(cost, rules), createdBy: actorUserId }) }
