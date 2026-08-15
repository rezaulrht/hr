/**
 * Capitalise, pay and dispose an asset — the three journal builders and the
 * services that wrap them.
 *
 * Follows `cost.posting.ts` as the template: accrue against payables, then
 * clear to bank, both through `postSystemJournal` inside the caller's
 * transaction.
 */

import { Prisma } from "../../generated/prisma/client"
import type { Currency, Prisma as PrismaNamespace } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { SystemJournalInput } from "../accounting/accounting.types"
import { postSystemJournal } from "../accounting/accounting.posting"
import { toLedgerDate } from "../accounting/accounting.utils"
import { loadRules, resolveAccountCode } from "../posting/posting.rules"
import type { ResolvedRules } from "../posting/posting.types"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { resolveRateOrThrow } from "../payroll/payroll.fx"
import { dec, round2 } from "../payroll/payroll.money"
import prisma from "../../config/prisma"

type Line = SystemJournalInput["lines"][number]

export interface AssetForPosting {
  id: string
  assetTag: string
  name: string
  categoryCode: string
  isConsumable: boolean
  purchaseCostBdt: Prisma.Decimal
  currency: Currency
  fxRateToBdt: Prisma.Decimal
  purchaseCost: Prisma.Decimal
  departmentId: string | null
}

const isoDateToUtc = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`)

/**
 * The FX memo on a non-BDT line — "USD 50,000 at 122.50" — so a BDT figure in
 * the ledger can answer why it is what it is. Null on a BDT transaction.
 */
const memo = (a: AssetForPosting) =>
  a.currency === "BDT"
    ? {}
    : {
        sourceCurrency: a.currency,
        sourceAmount: a.purchaseCost.toFixed(2),
        fxRateToBdt: a.fxRateToBdt.toFixed(6),
      }

export function buildAcquisitionLines(a: AssetForPosting, rules: ResolvedRules): Line[] {
  const amount = a.purchaseCostBdt.toFixed(2)
  const narration = `${a.assetTag} ${a.name}`
  return [
    {
      accountCode: resolveAccountCode(rules, a.categoryCode),
      debit: amount,
      narration,
      departmentId: a.departmentId ?? undefined,
      ...memo(a),
    },
    { accountCode: resolveAccountCode(rules, "PAYABLE"), credit: amount, narration, ...memo(a) },
  ]
}

export function buildPaymentLines(a: AssetForPosting, rules: ResolvedRules): Line[] {
  const amount = a.purchaseCostBdt.toFixed(2)
  const narration = `Payment — ${a.assetTag} ${a.name}`
  return [
    { accountCode: resolveAccountCode(rules, "PAYABLE"), debit: amount, narration },
    { accountCode: resolveAccountCode(rules, "BANK"), credit: amount, narration },
  ]
}

interface LoadedAsset {
  id: string
  assetTag: string
  name: string
  purchaseCost: Prisma.Decimal | null
  purchaseCostBdt: Prisma.Decimal | null
  fxRateToBdt: Prisma.Decimal | null
  purchaseDate: Date | null
  currency: Currency
  departmentId: string | null
  capitalisedAt: Date | null
  capitalisedBy: string | null
  category: { code: string; isConsumable: boolean }
}

async function loadAsset(tx: PrismaNamespace.TransactionClient, assetId: string): Promise<LoadedAsset> {
  const asset = await tx.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true, assetTag: true, name: true, purchaseCost: true, purchaseCostBdt: true,
      fxRateToBdt: true, purchaseDate: true,
      currency: true, departmentId: true, capitalisedAt: true, capitalisedBy: true,
      category: { select: { code: true, isConsumable: true } },
    },
  })
  if (!asset) throw new AppError(404, "Asset not found")
  return asset
}

/**
 * The explicit act that moves an asset onto the balance sheet. HR fills the
 * register; Finance capitalises — HR is not authorised to move the ledger,
 * and the bulk importer can create hundreds of rows at once (spec Decision 4).
 *
 * The journal is dated to the capitalisation date, not to `purchaseDate`: a
 * July purchase entered in August must not be refused by a closed July, every
 * month (Decision 4).
 *
 * A consumable is expensed, not capitalised — the category's rule resolves to
 * an expense account, so the debit never touches a PPE account, and the asset
 * is left un-stamped so depreciation skips it (Decision 3).
 */
export async function capitaliseAsset(assetId: string, actor: AccessTokenPayload) {
  return prisma.$transaction(async (tx) => {
    const asset = await loadAsset(tx, assetId)
    if (asset.purchaseCost === null || asset.purchaseDate === null) {
      throw new AppError(
        400,
        `${asset.assetTag} has no purchase cost or purchase date, so it cannot be capitalised.`,
        { assetId }
      )
    }

    if (asset.capitalisedAt) {
      const journal = await tx.journal.findFirst({
        where: { sourceModule: "ASSET", sourceRefId: assetId, sourceEvent: "ACQUISITION" },
        select: { journalNo: true },
      })
      throw new AppError(
        409,
        `${asset.assetTag} was already capitalised${journal ? ` — ${journal.journalNo} exists` : ""}. Reverse that journal in the accounting module before changing it.`,
        { assetId, journalNo: journal?.journalNo }
      )
    }

    // Spec Decision 7: the rate is frozen on the asset at capitalisation, so
    // acquisition and depreciation can never convert at different rates.
    const capitalisedOn = new Date()
    const rate = asset.currency === "BDT" ? dec(1) : await resolveRateOrThrow(asset.currency, capitalisedOn)
    const purchaseCostBdt = round2(asset.purchaseCost.times(rate))

    const posting: AssetForPosting = {
      id: asset.id,
      assetTag: asset.assetTag,
      name: asset.name,
      categoryCode: asset.category.code,
      isConsumable: asset.category.isConsumable,
      purchaseCostBdt,
      currency: asset.currency,
      fxRateToBdt: rate,
      purchaseCost: asset.purchaseCost,
      departmentId: asset.departmentId,
    }

    const rules = await loadRules(tx, "ASSET_ACQUISITION")
    const journal = await postSystemJournal(tx, {
      date: toLedgerDate(capitalisedOn),
      narration: `${posting.assetTag} ${posting.name}`,
      source: { module: "ASSET", refId: assetId, event: "ACQUISITION" },
      lines: buildAcquisitionLines(posting, rules),
      createdBy: actor.sub,
    })

    const updated = asset.category.isConsumable
      ? (await tx.asset.findUnique({ where: { id: assetId } }))!
      : await tx.asset.update({
          where: { id: assetId },
          data: {
            capitalisedAt: capitalisedOn,
            capitalisedBy: actor.sub,
            fxRateToBdt: rate,
            purchaseCostBdt,
          },
        })

    await writeAudit(tx, {
      entity: "ASSET",
      entityId: assetId,
      action: "CAPITALISE",
      changedBy: actor.sub,
      after: { journalNo: journal.journalNo, purchaseCostBdt: purchaseCostBdt.toFixed(2) },
    })

    return updated
  })
}

/**
 * Clears the payable raised at capitalisation against the bank. Refused on an
 * asset that was never capitalised — you cannot clear a payable that was never
 * raised. Dated to when it was paid, like every other payment.
 */
export async function payForAsset(
  assetId: string,
  body: { paidAt?: string },
  actor: AccessTokenPayload
) {
  return prisma.$transaction(async (tx) => {
    const asset = await loadAsset(tx, assetId)
    if (!asset.capitalisedAt) {
      throw new AppError(
        409,
        `${asset.assetTag} has not been capitalised yet, so there is no payable to clear.`,
        { assetId }
      )
    }
    if (asset.purchaseCost === null || asset.purchaseCostBdt === null) {
      throw new AppError(
        409,
        `${asset.assetTag} has no frozen BDT cost, so it cannot be paid.`,
        { assetId }
      )
    }

    const paidAt = body.paidAt ? isoDateToUtc(body.paidAt) : new Date()
    const posting: AssetForPosting = {
      id: asset.id,
      assetTag: asset.assetTag,
      name: asset.name,
      categoryCode: asset.category.code,
      isConsumable: asset.category.isConsumable,
      purchaseCostBdt: asset.purchaseCostBdt,
      currency: asset.currency,
      fxRateToBdt: asset.fxRateToBdt ?? dec(1),
      purchaseCost: asset.purchaseCost,
      departmentId: asset.departmentId,
    }

    const rules = await loadRules(tx, "ASSET_PAYMENT")
    const journal = await postSystemJournal(tx, {
      date: toLedgerDate(paidAt),
      narration: `Payment — ${posting.assetTag} ${posting.name}`,
      source: { module: "ASSET", refId: assetId, event: "PAYMENT" },
      lines: buildPaymentLines(posting, rules),
      createdBy: actor.sub,
    })

    await writeAudit(tx, {
      entity: "ASSET",
      entityId: assetId,
      action: "PAY",
      changedBy: actor.sub,
      after: { journalNo: journal.journalNo, paidAt: paidAt.toISOString() },
    })

    return tx.asset.findUnique({ where: { id: assetId } })
  })
}
