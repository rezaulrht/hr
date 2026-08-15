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
import { dec, round2, ZERO } from "../payroll/payroll.money"
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

export interface DisposalInput {
  asset: AssetForPosting
  /** Everything charged to date, summed from AssetDepreciation. */
  accumulated: Prisma.Decimal
  proceeds: Prisma.Decimal
  /** The contra account for the class, from Account.contraAccountId. */
  contraAccountCode: string
}

/**
 * The cost leaves, the accumulated depreciation leaves, and whatever is left
 * is the gain or loss — by construction, the entry cannot be unbalanced.
 *
 * The class cost account resolves through the same ASSET_ACQUISITION rules as
 * capitalisation, so the disposal can never disagree with the acquisition.
 */
export function buildDisposalLines(input: DisposalInput, rules: ResolvedRules): Line[] {
  const { asset: a, accumulated, proceeds, contraAccountCode } = input
  const narration = `Disposal — ${a.assetTag} ${a.name}`
  const lines: Line[] = []

  if (accumulated.greaterThan(ZERO)) {
    lines.push({ accountCode: contraAccountCode, debit: accumulated.toFixed(2), narration })
  }
  if (proceeds.greaterThan(ZERO)) {
    lines.push({ accountCode: resolveAccountCode(rules, "BANK"), debit: proceeds.toFixed(2), narration })
  }

  // Whatever is left. The gain or loss is defined as the balancing figure,
  // so the entry cannot be unbalanced by construction.
  const balance = a.purchaseCostBdt.minus(accumulated).minus(proceeds)
  if (!balance.isZero()) {
    lines.push(
      balance.greaterThan(ZERO)
        ? { accountCode: resolveAccountCode(rules, "LOSS"), debit: balance.toFixed(2), narration }
        : { accountCode: resolveAccountCode(rules, "GAIN"), credit: balance.negated().toFixed(2), narration }
    )
  }

  lines.push({
    accountCode: resolveAccountCode(rules, a.categoryCode),
    credit: a.purchaseCostBdt.toFixed(2),
    narration,
  })
  return lines
}

/**
 * Retiring an asset without telling the ledger leaves cost and accumulated
 * depreciation on the balance sheet forever. Posts the disposal and flips the
 * asset to RETIRED.
 *
 * Refused on an asset that was never capitalised, on one already disposed of,
 * and on one with an open assignment — the last is a hard block, unlike the
 * settlement checklist: disposing of a laptop somebody is still holding is a
 * data error, not a debt (spec Decision 8).
 */
export async function disposeAsset(
  assetId: string,
  body: { proceeds?: string; note?: string },
  actor: AccessTokenPayload
) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true, assetTag: true, name: true, purchaseCost: true, purchaseCostBdt: true,
        fxRateToBdt: true, purchaseDate: true, currency: true, departmentId: true,
        capitalisedAt: true, capitalisedBy: true, lifecycle: true, retiredAt: true,
        category: { select: { code: true, isConsumable: true } },
      },
    })
    if (!asset) throw new AppError(404, "Asset not found")
    if (!asset.capitalisedAt) {
      throw new AppError(409, `${asset.assetTag} was never capitalised, so there is nothing to dispose of.`, { assetId })
    }
    if (asset.lifecycle === "RETIRED" || asset.retiredAt) {
      throw new AppError(409, `${asset.assetTag} has already been disposed of.`, { assetId })
    }

    const openAssignment = await tx.assetAssignment.findFirst({
      where: { assetId, returnedAt: null },
      include: { employee: { select: { fullName: true, employeeCode: true } } },
    })
    if (openAssignment) {
      const holder = openAssignment.employee
        ? `${openAssignment.employee.fullName} (${openAssignment.employee.employeeCode})`
        : "somebody"
      throw new AppError(409, `Take the asset back from ${holder} before disposing of it.`, { assetId })
    }

    if (asset.purchaseCostBdt === null) {
      throw new AppError(409, `${asset.assetTag} has no frozen BDT cost, so it cannot be disposed of.`, { assetId })
    }

    const [disposalRules, acquisitionRules] = await Promise.all([
      loadRules(tx, "ASSET_DISPOSAL"),
      loadRules(tx, "ASSET_ACQUISITION"),
    ])
    // The disposal needs the category → PPE mapping that lives in the
    // acquisition rules. Merge, with disposal keys winning any overlap.
    const rules: ResolvedRules = {
      event: "ASSET_DISPOSAL",
      byKey: new Map([...acquisitionRules.byKey, ...disposalRules.byKey]),
    }

    const classAccountCode = resolveAccountCode(acquisitionRules, asset.category.code)
    const classAccount = await tx.account.findUnique({ where: { code: classAccountCode } })
    if (!classAccount?.contraAccountId) {
      throw new AppError(409, `Account ${classAccountCode} has no accumulated-depreciation contra linked, so it cannot be disposed of.`, { assetId })
    }
    const contra = await tx.account.findUnique({ where: { id: classAccount.contraAccountId } })
    if (!contra) {
      throw new AppError(409, `The contra for ${classAccountCode} no longer exists.`, { assetId })
    }

    const { _sum } = await tx.assetDepreciation.aggregate({
      where: { assetId },
      _sum: { amount: true },
    })
    const accumulated = _sum.amount ?? ZERO
    const proceeds = body.proceeds !== undefined ? dec(body.proceeds) : ZERO

    const posting: AssetForPosting = {
      id: asset.id,
      assetTag: asset.assetTag,
      name: asset.name,
      categoryCode: asset.category.code,
      isConsumable: asset.category.isConsumable,
      purchaseCostBdt: asset.purchaseCostBdt,
      currency: asset.currency,
      fxRateToBdt: asset.fxRateToBdt ?? dec(1),
      purchaseCost: asset.purchaseCost ?? ZERO,
      departmentId: asset.departmentId,
    }

    const journal = await postSystemJournal(tx, {
      date: toLedgerDate(new Date()),
      narration: `Disposal — ${posting.assetTag} ${posting.name}`,
      source: { module: "ASSET", refId: assetId, event: "DISPOSAL" },
      lines: buildDisposalLines(
        { asset: posting, accumulated, proceeds, contraAccountCode: contra.code },
        rules
      ),
      createdBy: actor.sub,
    })

    const updated = await tx.asset.update({
      where: { id: assetId },
      data: {
        lifecycle: "RETIRED",
        retiredAt: new Date(),
        retiredBy: actor.sub,
        retirementNote: body.note ?? null,
      },
    })

    await writeAudit(tx, {
      entity: "ASSET",
      entityId: assetId,
      action: "RETIRE",
      changedBy: actor.sub,
      before: { lifecycle: asset.lifecycle },
      after: { lifecycle: "RETIRED", journalNo: journal.journalNo, proceeds: proceeds.toFixed(2) },
      note: body.note,
    })

    return updated
  })
}
