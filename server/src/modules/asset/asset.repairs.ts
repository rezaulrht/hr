/**
 * Repairs, which deliberately do NOT suspend custody.
 *
 * An open repair and an open assignment coexist because that is how it
 * happens: the employee still has the machine on their record, it goes to the
 * vendor for a week, it comes back to them. Forcing a return-and-reissue
 * would fabricate two custody events that never occurred and make the ledger
 * *less* accurate than the thing it models. It also keeps the person
 * responsible for the asset responsible while it is out.
 *
 * `cost` is expense and never touches book value. Capitalising repairs would
 * mean a heavily-repaired old laptop carrying a *higher* book value than a
 * new one, which is the opposite of what phase 2's report is for.
 *
 * Repairs emit no events. Nobody needs telling that a monitor went to the
 * vendor; the audit rows and the open-repairs list cover it.
 */

import prisma from "../../config/prisma"
import type { AssetCondition, AssetRepair, Currency } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { dec, round2 } from "../payroll/payroll.money"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"

export interface SendForRepairInput {
  fault: string
  vendor?: string
  expectedBack?: Date
  isWarranty?: boolean
}

export interface ReceiveFromRepairInput {
  cost?: number | string
  currency?: Currency
  outcome?: string
  conditionAfter?: AssetCondition
}

export interface RepairFilters {
  open?: boolean
}

export async function sendForRepair(
  assetId: string,
  input: SendForRepairInput,
  actor: AccessTokenPayload
): Promise<AssetRepair> {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId } })
    if (!asset) throw new AppError(404, "Asset not found")
    if (asset.lifecycle === "RETIRED") {
      throw new AppError(409, "This asset is retired")
    }
    if (asset.lifecycle === "LOST") {
      throw new AppError(409, "This asset has been marked lost")
    }

    // Not `assetAssignment.findFirst` — custody is untouched by a repair, so
    // there is nothing about the holder to read here.
    const openRepair = await tx.assetRepair.findFirst({
      where: { assetId, returnedAt: null },
    })
    if (openRepair) {
      throw new AppError(409, `${asset.assetTag} already has an open repair`)
    }

    const repair = await tx.assetRepair.create({
      data: {
        assetId,
        sentAt: new Date(),
        sentBy: actor.sub,
        vendor: input.vendor ?? null,
        fault: input.fault,
        expectedBack: input.expectedBack ?? null,
        isWarranty: input.isWarranty ?? false,
      },
    })

    await writeAudit(tx, {
      entity: "ASSET_REPAIR",
      entityId: repair.id,
      action: "SEND_REPAIR",
      changedBy: actor.sub,
      after: { assetId, fault: input.fault, vendor: input.vendor ?? null },
    })

    return repair
  })
}

export async function receiveFromRepair(
  repairId: string,
  input: ReceiveFromRepairInput,
  actor: AccessTokenPayload
): Promise<AssetRepair> {
  return prisma.$transaction(async (tx) => {
    const repair = await tx.assetRepair.findUnique({ where: { id: repairId } })
    if (!repair) throw new AppError(404, "Repair not found")
    if (repair.returnedAt) {
      throw new AppError(409, "This repair is already closed")
    }

    const cost = input.cost === undefined ? null : round2(dec(input.cost))

    const updated = await tx.assetRepair.update({
      where: { id: repairId },
      data: {
        returnedAt: new Date(),
        cost,
        currency: input.currency ?? "BDT",
        outcome: input.outcome ?? null,
        conditionAfter: input.conditionAfter ?? null,
      },
    })

    // A REPAIR request is fulfilled by the thing coming back. updateMany, not
    // update: there may be no request behind this repair at all, because HR
    // can still send an asset for repair directly.
    await tx.assetRequest.updateMany({
      where: { repairId, status: "APPROVED" },
      data: { status: "FULFILLED", fulfilledAt: new Date(), fulfilledBy: actor.sub },
    })

    await writeAudit(tx, {
      entity: "ASSET_REPAIR",
      entityId: repairId,
      action: "RECEIVE_REPAIR",
      changedBy: actor.sub,
      after: {
        cost: cost ? cost.toFixed(2) : null,
        outcome: input.outcome ?? null,
        conditionAfter: input.conditionAfter ?? null,
      },
    })

    return updated
  })
}

/** The open-repairs list HR reads instead of an event. */
export function listRepairs(filters: RepairFilters = {}): Promise<AssetRepair[]> {
  return prisma.assetRepair.findMany({
    where: filters.open ? { returnedAt: null } : undefined,
    include: { asset: { include: { category: true } } },
    orderBy: { sentAt: "desc" },
  })
}
