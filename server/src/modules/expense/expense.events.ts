/**
 * How an expense claim reads in a feed.
 *
 * Amounts **are** carried here, unlike payslips and settlements. A claim is a
 * reimbursement the employee themselves filed, the figure is the whole point
 * of the decision Finance has to make, and a queue of "Travel claim
 * submitted" lines with no amounts is a queue nobody can triage. Salary is a
 * different kind of secret from a taxi fare.
 */

import type { EventInput } from "../event/event.types"

type ClaimStage = "submitted" | "approved" | "rejected" | "reimbursed"

const COPY: Record<ClaimStage, { title: string; severity: EventInput["severity"] }> = {
  submitted: { title: "Expense claim submitted", severity: "INFO" },
  approved: { title: "Expense claim approved", severity: "SUCCESS" },
  rejected: { title: "Expense claim rejected", severity: "WARNING" },
  reimbursed: { title: "Expense claim reimbursed", severity: "SUCCESS" },
}

interface ClaimArgs {
  stage: ClaimStage
  claimId: string
  employeeId: string
  category: string
  amount: string
  currency: string
  actorUserId: string | null
  note?: string | null
}

export function expenseEvent(args: ClaimArgs): EventInput {
  const copy = COPY[args.stage]
  return {
    type: `expense.${args.stage}` as EventInput["type"],
    severity: copy.severity,
    actorUserId: args.actorUserId,
    entity: "EXPENSE_CLAIM",
    entityId: args.claimId,
    subjectEmployeeId: args.employeeId,
    targetRoles: ["FINANCE_OFFICER"],
    title: copy.title,
    meta: [`${args.category} · ${args.currency} ${args.amount}`, args.note]
      .filter(Boolean)
      .join(" · "),
    href: "/expenses",
    payload: {
      stage: args.stage,
      category: args.category,
      amount: args.amount,
      currency: args.currency,
    },
  }
}
