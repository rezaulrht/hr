import { Prisma } from "../../generated/prisma/client"
import type { CostNature, Prisma as PrismaNamespace } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { SystemJournalInput } from "../accounting/accounting.types"
import { postSystemJournal } from "../accounting/accounting.posting"
import { toLedgerDate } from "../accounting/accounting.utils"
import { loadRules, resolveAccountCode } from "../posting/posting.rules"
import type { ResolvedRules } from "../posting/posting.types"
type Line = SystemJournalInput["lines"][number]
export interface SettlementForPosting { id: string; employeeId: string; departmentId: string; costNature: CostNature; pendingSalary: Prisma.Decimal; gratuity: Prisma.Decimal; noticePay: Prisma.Decimal; expenseReimbursement: Prisma.Decimal; leaveEncashment: Prisma.Decimal; outstandingDeductions: Prisma.Decimal; finalAmountBdt: Prisma.Decimal }
export function buildSettlementAccrualLines(s: SettlementForPosting, rules: ResolvedRules): Line[] {
  const dimensions = { employeeId: s.employeeId, departmentId: s.departmentId }; const lines: Line[] = []
  const debit = (key: string, amount: Prisma.Decimal, narration: string) => { if (!amount.isZero()) lines.push({ accountCode: resolveAccountCode(rules, key), debit: amount.toFixed(2), narration, ...dimensions }) }
  debit(`${s.costNature}:BASIC`, s.pendingSalary, "Pending salary"); debit("GRATUITY", s.gratuity, "Gratuity"); debit("NOTICE_PAY", s.noticePay, "Notice pay"); debit("REIMBURSEMENT", s.expenseReimbursement, "Expense reimbursement"); debit(`${s.costNature}:BASIC`, s.leaveEncashment, "Leave encashment")
  if (!s.outstandingDeductions.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "ADVANCE_RECOVERY"), credit: s.outstandingDeductions.toFixed(2), narration: "Recovery of outstanding dues", ...dimensions })
  lines.push({ accountCode: resolveAccountCode(rules, "NET_PAY"), credit: s.finalAmountBdt.toFixed(2), narration: "Final dues payable", ...dimensions }); return lines
}
export function buildSettlementPaymentLines(s: SettlementForPosting, rules: ResolvedRules): Line[] { const amount = s.finalAmountBdt.toFixed(2); return [{ accountCode: resolveAccountCode(rules, "NET_PAY"), debit: amount, narration: "Final dues", employeeId: s.employeeId, departmentId: s.departmentId }, { accountCode: resolveAccountCode(rules, "BANK"), credit: amount }] }
async function loadSettlement(tx: PrismaNamespace.TransactionClient, id: string): Promise<SettlementForPosting> { const row = await tx.settlement.findUnique({ where: { id }, select: { id: true, employeeId: true, pendingSalary: true, gratuity: true, noticePay: true, expenseReimbursement: true, leaveEncashment: true, outstandingDeductions: true, finalAmountBdt: true, employee: { select: { departmentId: true, department: { select: { costNature: true } } } } } }); if (!row) throw new AppError(404, "Settlement not found"); return { ...row, departmentId: row.employee.departmentId, costNature: row.employee.department.costNature } }
export async function postSettlementAccrual(tx: PrismaNamespace.TransactionClient, id: string, actorUserId: string) { const [settlement, rules] = await Promise.all([loadSettlement(tx, id), loadRules(tx, "SETTLEMENT_ACCRUAL")]); return postSystemJournal(tx, { date: toLedgerDate(new Date()), narration: `Final settlement — ${settlement.employeeId}`, source: { module: "SETTLEMENT", refId: id, event: "ACCRUAL" }, lines: buildSettlementAccrualLines(settlement, rules), createdBy: actorUserId }) }
export async function postSettlementPayment(tx: PrismaNamespace.TransactionClient, id: string, actorUserId: string, paidAt: Date) { const [settlement, rules] = await Promise.all([loadSettlement(tx, id), loadRules(tx, "SETTLEMENT_PAYMENT")]); return postSystemJournal(tx, { date: toLedgerDate(paidAt), narration: `Settlement payment — ${settlement.employeeId}`, source: { module: "SETTLEMENT", refId: id, event: "PAYMENT" }, lines: buildSettlementPaymentLines(settlement, rules), createdBy: actorUserId }) }
