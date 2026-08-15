/**
 * Marking approved claims REIMBURSED when a run is disbursed or a settlement
 * is paid.
 *
 * Lives here rather than in `expense.service.ts` because payroll and
 * settlement both call it, and `expense.service` already imports from
 * payroll — putting it there would close the import cycle.
 *
 * The emits are **N events for N claims**, and that is not a violation of the
 * bulk rule. Disbursing a run is one thing Finance did, and it gets one
 * `payroll.run.disbursed`. "Your travel claim was reimbursed" is a separate
 * fact for each claimant, and each of them needs telling exactly once.
 */

import type { Prisma } from "../../generated/prisma/client"
import { emitEvent } from "../event/event.emit"
import type { EventTx } from "../event/event.types"
import { toMoneyString } from "../payroll/payroll.money"
import { expenseEvent } from "./expense.events"

export async function sweepClaimsReimbursed(
  tx: EventTx,
  where: Prisma.ExpenseClaimWhereInput,
  actorUserId: string
): Promise<void> {
  // Read before the update, because afterwards nothing distinguishes the
  // claims this sweep touched from ones reimbursed last month.
  const claims = await tx.expenseClaim.findMany({
    where,
    select: {
      id: true,
      employeeId: true,
       category: { select: { code: true } },
      amount: true,
      currency: true,
    },
  })

  await tx.expenseClaim.updateMany({ where, data: { status: "REIMBURSED" } })

  for (const claim of claims) {
    await emitEvent(
      tx,
      expenseEvent({
        stage: "reimbursed",
        claimId: claim.id,
        employeeId: claim.employeeId,
        category: claim.category.code,
        amount: toMoneyString(claim.amount),
        currency: claim.currency,
        actorUserId,
      })
    )
  }
}
