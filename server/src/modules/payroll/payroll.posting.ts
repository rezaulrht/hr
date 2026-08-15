import { Prisma } from "../../generated/prisma/client"
import type { CostNature, Currency, Prisma as PrismaNamespace } from "../../generated/prisma/client"
import type { SystemJournalInput } from "../accounting/accounting.types"
import { postSystemJournal } from "../accounting/accounting.posting"
import { monthWindow, toLedgerDate } from "../accounting/accounting.utils"
import { toBdtAllocated } from "../posting/posting.money"
import { loadRules, resolveAccountCode } from "../posting/posting.rules"
import type { ResolvedRules } from "../posting/posting.types"
import { AppError } from "../../middleware/errorHandler"

const ZERO = new Prisma.Decimal(0)
const two = (d: Prisma.Decimal) => d.toFixed(2)
type Line = SystemJournalInput["lines"][number]

export interface PayslipForPosting {
  id: string
  employeeId: string
  departmentId: string
  costNature: CostNature
  currency: Currency
  fxRateToBdt: Prisma.Decimal
  grossPayBdt: Prisma.Decimal
  totalDeductionsBdt: Prisma.Decimal
  netPayBdt: Prisma.Decimal
  netPayableBdt: Prisma.Decimal
  breakdown: {
    earnings: Array<{ code: string; label: string; amount: string }>
    deductions: Array<{ code: string; label: string; amount: string }>
    adjustments: Array<{ code: string; label: string; amount: string; kind?: string }>
    reimbursements: Array<{ claimId: string; amount: string }>
  }
}

const earningsOf = (p: PayslipForPosting) => [...p.breakdown.earnings, ...p.breakdown.adjustments.filter((a) => a.kind !== "DEDUCTION")].map((l) => ({ key: l.code, amount: new Prisma.Decimal(l.amount) }))
const deductionsOf = (p: PayslipForPosting) => [...p.breakdown.deductions, ...p.breakdown.adjustments.filter((a) => a.kind === "DEDUCTION")].map((l) => ({ key: l.code, amount: new Prisma.Decimal(l.amount) }))
const fxMemo = (p: PayslipForPosting, sourceAmount: Prisma.Decimal) => p.currency === "BDT" ? {} : { sourceCurrency: p.currency, sourceAmount: two(sourceAmount), fxRateToBdt: p.fxRateToBdt.toFixed(6) }

/**
 * A signed amount as a journal line.
 *
 * A negative earning is a credit and a negative deduction is a debit — the
 * ledger has no concept of a negative amount, and `assertLineShape` refuses
 * one outright.
 *
 * This is not hypothetical. `computePayslip` appends a **negative**
 * `LOP_ADJUSTMENT` earnings line whenever somebody lost pay, deliberately, so
 * the full-month earnings printed on the payslip reconcile to the pro-rated
 * gross beneath them. Posting that as a debit made every run containing a
 * single absent employee fail on approval.
 */
function sided(amount: Prisma.Decimal, normal: "debit" | "credit"): { debit?: string; credit?: string } {
  const flipped = normal === "debit" ? "credit" : "debit"
  return amount.isNegative() ? { [flipped]: two(amount.negated()) } : { [normal]: two(amount) }
}

export function buildAccrualLines(payslips: PayslipForPosting[], rules: ResolvedRules): Line[] {
  const lines: Line[] = []
  for (const p of payslips) {
    const dimensions = { employeeId: p.employeeId, departmentId: p.departmentId }
    for (const line of toBdtAllocated(earningsOf(p), p.fxRateToBdt, p.grossPayBdt)) {
      if (!line.amount.isZero()) lines.push({ accountCode: resolveAccountCode(rules, `${p.costNature}:${line.key}`), ...sided(line.amount, "debit"), narration: line.key, ...dimensions, ...fxMemo(p, line.amount.dividedBy(p.fxRateToBdt)) })
    }
    for (const line of toBdtAllocated(deductionsOf(p), p.fxRateToBdt, p.totalDeductionsBdt)) {
      if (!line.amount.isZero()) lines.push({ accountCode: resolveAccountCode(rules, `DEDUCTION:${line.key}`), ...sided(line.amount, "credit"), narration: line.key, ...dimensions })
    }
    if (!p.netPayBdt.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "NET_PAY"), ...sided(p.netPayBdt, "credit"), narration: "Net pay", ...dimensions })
  }
  return lines
}

export function buildPaymentLines(payslips: PayslipForPosting[], rules: ResolvedRules): Line[] {
  const lines: Line[] = []
  let bankTotal = ZERO
  for (const p of payslips) {
    const dimensions = { employeeId: p.employeeId, departmentId: p.departmentId }
    const reimbursement = p.netPayableBdt.minus(p.netPayBdt)
    // `sided` here too. Preflight blocker 5 rejects a run whose net pay went
    // negative, so this should not arise — but "should not arise" is how the
    // accrual came to be broken, and the cost of being right anyway is nil.
    if (!p.netPayBdt.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "NET_PAY"), ...sided(p.netPayBdt, "debit"), narration: "Net pay", ...dimensions })
    if (!reimbursement.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "REIMBURSEMENT"), ...sided(reimbursement, "debit"), narration: "Expense reimbursement", ...dimensions })
    bankTotal = bankTotal.plus(p.netPayableBdt)
  }
  if (!bankTotal.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "BANK"), ...sided(bankTotal, "credit"), narration: "Disbursement" })
  return lines
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const payslipSelect = {
  id: true, employeeId: true, currency: true, fxRateToBdt: true, grossPayBdt: true,
  totalDeductionsBdt: true, netPayBdt: true, netPayableBdt: true, breakdown: true,
  employee: { select: { departmentId: true, department: { select: { costNature: true } } } },
} as const

async function loadPayslips(tx: PrismaNamespace.TransactionClient, runId: string): Promise<PayslipForPosting[]> {
  const rows = await tx.payslip.findMany({ where: { payrollRunId: runId }, select: payslipSelect })
  return rows.map((row) => ({ ...row, departmentId: row.employee.departmentId, costNature: row.employee.department.costNature, breakdown: row.breakdown as PayslipForPosting["breakdown"] }))
}

export async function postPayrollAccrual(tx: PrismaNamespace.TransactionClient, runId: string, actorUserId: string) {
  const run = await tx.payrollRun.findUnique({ where: { id: runId }, select: { id: true, month: true, year: true } })
  if (!run) throw new AppError(404, "Payroll run not found")
  const [payslips, rules] = await Promise.all([loadPayslips(tx, runId), loadRules(tx, "PAYROLL_ACCRUAL")])
  if (!payslips.length) return null
  return postSystemJournal(tx, { date: monthWindow(run.year, run.month).endDate, narration: `Salary accrual for ${MONTHS[run.month - 1]} ${run.year}`, source: { module: "PAYROLL", refId: runId, event: "ACCRUAL" }, lines: buildAccrualLines(payslips, rules), createdBy: actorUserId })
}

export async function postPayrollPayment(tx: PrismaNamespace.TransactionClient, runId: string, actorUserId: string) {
  const run = await tx.payrollRun.findUnique({ where: { id: runId }, select: { id: true, month: true, year: true, disbursedAt: true } })
  if (!run) throw new AppError(404, "Payroll run not found")
  const [payslips, rules] = await Promise.all([loadPayslips(tx, runId), loadRules(tx, "PAYROLL_PAYMENT")])
  if (!payslips.length) return null
  return postSystemJournal(tx, { date: toLedgerDate(run.disbursedAt ?? new Date()), narration: `Salary disbursement for ${MONTHS[run.month - 1]} ${run.year}`, source: { module: "PAYROLL", refId: runId, event: "PAYMENT" }, lines: buildPaymentLines(payslips, rules), createdBy: actorUserId })
}
