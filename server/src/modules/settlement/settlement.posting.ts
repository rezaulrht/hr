import { Prisma } from "../../generated/prisma/client"
import type { CostNature, Currency, Prisma as PrismaNamespace } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { SystemJournalInput } from "../accounting/accounting.types"
import { postSystemJournal } from "../accounting/accounting.posting"
import { toLedgerDate } from "../accounting/accounting.utils"
import { toBdtAllocated } from "../posting/posting.money"
import { loadRules, resolveAccountCode } from "../posting/posting.rules"
import type { ResolvedRules } from "../posting/posting.types"

type Line = SystemJournalInput["lines"][number]

export interface SettlementForPosting {
  id: string
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentId: string
  costNature: CostNature
  currency: Currency
  fxRateToBdt: Prisma.Decimal
  pendingSalary: Prisma.Decimal
  gratuity: Prisma.Decimal
  noticePay: Prisma.Decimal
  expenseReimbursement: Prisma.Decimal
  leaveEncashment: Prisma.Decimal
  outstandingDeductions: Prisma.Decimal
  finalAmountBdt: Prisma.Decimal
}

/** Rule key, amount, and what the ledger line says. */
const HEADS: Array<{ key: (nature: CostNature) => string; of: (s: SettlementForPosting) => Prisma.Decimal; narration: string }> = [
  { key: (n) => `${n}:BASIC`, of: (s) => s.pendingSalary, narration: "Pending salary" },
  { key: () => "GRATUITY", of: (s) => s.gratuity, narration: "Gratuity" },
  { key: () => "NOTICE_PAY", of: (s) => s.noticePay, narration: "Notice pay" },
  { key: () => "REIMBURSEMENT", of: (s) => s.expenseReimbursement, narration: "Expense reimbursement" },
  // Its own key rather than sharing BASIC. It is always zero this phase, but
  // when it stops being zero an auditor will want it separable, and a rule
  // that exists can be re-pointed at a new account without a deploy.
  { key: (n) => `${n}:LEAVE_ENCASHMENT`, of: (s) => s.leaveEncashment, narration: "Leave encashment" },
]

/**
 * Settlement heads are stored in `Settlement.currency` — the schema says so —
 * while `finalAmountBdt` is the converted total. Debiting the heads raw and
 * crediting `finalAmountBdt` balances only when the currency happens to be
 * BDT; for anything else the two sides differ by the whole FX rate and the
 * journal is refused. It would also be the wrong figure: the ledger is BDT
 * only.
 *
 * So every head is converted at the settlement's own frozen rate, and the
 * rounding remainder is allocated so the debits tie to `finalAmountBdt` plus
 * the recovery exactly.
 */
export function buildSettlementAccrualLines(s: SettlementForPosting, rules: ResolvedRules): Line[] {
  const dimensions = { employeeId: s.employeeId, departmentId: s.departmentId }
  const memo = (source: Prisma.Decimal) =>
    s.currency === "BDT"
      ? {}
      : { sourceCurrency: s.currency, sourceAmount: source.toFixed(2), fxRateToBdt: s.fxRateToBdt.toFixed(6) }

  // What the debits must add up to: the payable plus anything recovered.
  const target = s.finalAmountBdt.plus(
    new Prisma.Decimal(s.outstandingDeductions.times(s.fxRateToBdt).toFixed(2))
  )
  const sourceByIndex = HEADS.map((head) => head.of(s))
  const converted = toBdtAllocated(
    HEADS.map((head, i) => ({ key: String(i), amount: sourceByIndex[i] })),
    s.fxRateToBdt,
    target
  )

  const lines: Line[] = []
  converted.forEach((line, i) => {
    if (line.amount.isZero()) return
    lines.push({
      accountCode: resolveAccountCode(rules, HEADS[i].key(s.costNature)),
      debit: line.amount.toFixed(2),
      narration: HEADS[i].narration,
      ...dimensions,
      ...memo(sourceByIndex[i]),
    })
  })

  const recovered = new Prisma.Decimal(s.outstandingDeductions.times(s.fxRateToBdt).toFixed(2))
  if (!recovered.isZero()) {
    lines.push({
      accountCode: resolveAccountCode(rules, "ADVANCE_RECOVERY"),
      credit: recovered.toFixed(2),
      narration: "Recovery of outstanding dues",
      ...dimensions,
      ...memo(s.outstandingDeductions),
    })
  }

  lines.push({
    accountCode: resolveAccountCode(rules, "NET_PAY"),
    credit: s.finalAmountBdt.toFixed(2),
    narration: "Final dues payable",
    ...dimensions,
  })

  return lines
}

export function buildSettlementPaymentLines(s: SettlementForPosting, rules: ResolvedRules): Line[] {
  const amount = s.finalAmountBdt.toFixed(2)
  return [
    { accountCode: resolveAccountCode(rules, "NET_PAY"), debit: amount, narration: "Final dues", employeeId: s.employeeId, departmentId: s.departmentId },
    { accountCode: resolveAccountCode(rules, "BANK"), credit: amount, narration: "Settlement payment" },
  ]
}

async function loadSettlement(tx: PrismaNamespace.TransactionClient, id: string): Promise<SettlementForPosting> {
  const row = await tx.settlement.findUnique({
    where: { id },
    select: {
      id: true, employeeId: true, currency: true, fxRateToBdt: true,
      pendingSalary: true, gratuity: true, noticePay: true, expenseReimbursement: true,
      leaveEncashment: true, outstandingDeductions: true, finalAmountBdt: true,
      employee: {
        select: {
          employeeCode: true, fullName: true, departmentId: true,
          department: { select: { costNature: true } },
        },
      },
    },
  })
  if (!row) throw new AppError(404, "Settlement not found")
  return {
    ...row,
    employeeCode: row.employee.employeeCode,
    employeeName: row.employee.fullName,
    departmentId: row.employee.departmentId,
    costNature: row.employee.department.costNature,
  }
}

// A uuid in the narration is unreadable in the General Ledger, which is where
// this text ends up.
const describe = (s: SettlementForPosting) => `${s.employeeCode} ${s.employeeName}`

export async function postSettlementAccrual(tx: PrismaNamespace.TransactionClient, id: string, actorUserId: string) {
  const [settlement, rules] = await Promise.all([loadSettlement(tx, id), loadRules(tx, "SETTLEMENT_ACCRUAL")])
  return postSystemJournal(tx, {
    date: toLedgerDate(new Date()),
    narration: `Final settlement — ${describe(settlement)}`,
    source: { module: "SETTLEMENT", refId: id, event: "ACCRUAL" },
    lines: buildSettlementAccrualLines(settlement, rules),
    createdBy: actorUserId,
  })
}

export async function postSettlementPayment(tx: PrismaNamespace.TransactionClient, id: string, actorUserId: string, paidAt: Date) {
  const [settlement, rules] = await Promise.all([loadSettlement(tx, id), loadRules(tx, "SETTLEMENT_PAYMENT")])
  return postSystemJournal(tx, {
    date: toLedgerDate(paidAt),
    narration: `Settlement payment — ${describe(settlement)}`,
    source: { module: "SETTLEMENT", refId: id, event: "PAYMENT" },
    lines: buildSettlementPaymentLines(settlement, rules),
    createdBy: actorUserId,
  })
}
