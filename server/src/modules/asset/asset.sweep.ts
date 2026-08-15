/**
 * Flipping PENDING recoveries to RECOVERED when the run or settlement that
 * collected them is paid.
 *
 * Lives here rather than in `asset.recoveries.ts` because payroll and
 * settlement both call it, and `asset.recoveries` must not import either —
 * the dependency runs one way: payroll reads assets, assets never writes into
 * payroll. `expense.sweep.ts` is the precedent, and this is the same shape.
 *
 * It sweeps **status, not money**: the money moved when the run was disbursed
 * or the settlement was paid. Marking a recovery RECOVERED here only records
 * that fact; it never creates or moves a figure.
 *
 * The emits are **N events for N recoveries**, and that is not a violation of
 * the bulk rule. Disbursing a run is one thing Finance did, and it gets one
 * `payroll.run.disbursed`. "Your laptop charge was deducted" is a separate
 * fact for each person, and each of them needs telling exactly once.
 */

import type { Prisma } from "../../generated/prisma/client"
import { emitEvent } from "../event/event.emit"
import type { EventTx } from "../event/event.types"
import { toMoneyString } from "../payroll/payroll.money"
import { assetRecoveryCollectedEvent } from "./asset.events"

export async function sweepRecoveriesCollected(
  tx: EventTx,
  where: Prisma.AssetRecoveryWhereInput,
  actorUserId: string
): Promise<void> {
  // Read before the update, because afterwards nothing distinguishes the
  // recoveries this sweep touched from ones collected last month.
  const recoveries = await tx.assetRecovery.findMany({
    where,
    select: {
      id: true,
      employeeId: true,
      assetId: true,
      amount: true,
      currency: true,
      asset: { select: { assetTag: true } },
    },
  })

  if (recoveries.length === 0) return

  await tx.assetRecovery.updateMany({ where, data: { status: "RECOVERED" } })

  for (const recovery of recoveries) {
    await emitEvent(
      tx,
      assetRecoveryCollectedEvent({
        recoveryId: recovery.id,
        assetId: recovery.assetId,
        assetTag: recovery.asset.assetTag,
        employeeId: recovery.employeeId,
        amount: toMoneyString(recovery.amount),
        currency: recovery.currency,
        actorUserId,
      })
    )
  }
}
