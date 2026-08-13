import { Prisma } from "../../generated/prisma/client"
import type { CostNature, Currency, Prisma as PrismaNamespace } from "../../generated/prisma/client"
import type { SystemJournalInput } from "../accounting/accounting.types"
import { postSystemJournal } from "../accounting/accounting.posting"
import { monthWindow, toLedgerDate } from "../accounting/accounting.utils"
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

export function toBdtAllocated(lines: Array<{ key: string; amount: Prisma.Decimal }>, rate: Prisma.Decimal, target: Prisma.Decimal) {
  if (lines.length === 0) return []
  const converted = lines.map((line) => ({ key: line.key, amount: new Prisma.Decimal(line.amount.times(rate).toFixed(2)) }))
  const remainder = target.minus(converted.reduce((sum, line) => sum.plus(line.amount), ZERO))
  if (!remainder.isZero()) {
    const largest = converted.reduce((index, line, i, all) => line.amount.greaterThan(all[index].amount) ? i : index, 0)
    converted[largest].amount = converted[largest].amount.plus(remainder)
  }
  return converted
}

const earningsOf = (p: PayslipForPosting) => [...p.breakdown.earnings, ...p.breakdown.adjustments.filter((a) => a.kind !== "DEDUCTION")].map((l) => ({ key: l.code, amount: new Prisma.Decimal(l.amount) }))
const deductionsOf = (p: PayslipForPosting) => [...p.breakdown.deductions, ...p.breakdown.adjustments.filter((a) => a.kind === "DEDUCTION")].map((l) => ({ key: l.code, amount: new Prisma.Decimal(l.amount) }))
const fxMemo = (p: PayslipForPosting, sourceAmount: Prisma.Decimal) => p.currency === "BDT" ? {} : { sourceCurrency: p.currency, sourceAmount: two(sourceAmount), fxRateToBdt: p.fxRateToBdt.toFixed(6) }

export function buildAccrualLines(payslips: PayslipForPosting[], rules: ResolvedRules): Line[] {
  const lines: Line[] = []
  for (const p of payslips) {
    const dimensions = { employeeId: p.employeeId, departmentId: p.departmentId }
    for (const line of toBdtAllocated(earningsOf(p), p.fxRateToBdt, p.grossPayBdt)) {
      if (!line.amount.isZero()) lines.push({ accountCode: resolveAccountCode(rules, `${p.costNature}:${line.key}`), debit: two(line.amount), narration: line.key, ...dimensions, ...fxMemo(p, line.amount.dividedBy(p.fxRateToBdt)) })
    }
    for (const line of toBdtAllocated(deductionsOf(p), p.fxRateToBdt, p.totalDeductionsBdt)) {
      if (!line.amount.isZero()) lines.push({ accountCode: resolveAccountCode(rules, `DEDUCTION:${line.key}`), credit: two(line.amount), narration: line.key, ...dimensions })
    }
    if (!p.netPayBdt.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "NET_PAY"), credit: two(p.netPayBdt), narration: "Net pay", ...dimensions })
  }
  return lines
}

export function buildPaymentLines(payslips: PayslipForPosting[], rules: ResolvedRules): Line[] {
  const lines: Line[] = []
  let bankTotal = ZERO
  for (const p of payslips) {
    const dimensions = { employeeId: p.employeeId, departmentId: p.departmentId }
    const reimbursement = p.netPayableBdt.minus(p.netPayBdt)
    if (!p.netPayBdt.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "NET_PAY"), debit: two(p.netPayBdt), narration: "Net pay", ...dimensions })
    if (!reimbursement.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "REIMBURSEMENT"), debit: two(reimbursement), narration: "Expense reimbursement", ...dimensions })
    bankTotal = bankTotal.plus(p.netPayableBdt)
  }
  if (!bankTotal.isZero()) lines.push({ accountCode: resolveAccountCode(rules, "BANK"), credit: two(bankTotal), narration: "Disbursement" })
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
