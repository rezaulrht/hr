/**
 * Categories, commitments, bills and payment recording.
 *
 * No approval workflow: a bill is PENDING, then PAID. No department
 * allocation, no bill generation from a commitment — see the design spec's
 * Decisions 2-4. Every mutation writes its AuditLog row inside the same
 * transaction as the change it records.
 */

import prisma from "../../config/prisma"
import type { Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { dec, toMoneyString } from "../payroll/payroll.money"
import { isOverdue } from "./cost.derive"
import type {
  CreateCommitmentInput,
  CreateCostCategoryInput,
  CreateCostInput,
  PayCostInput,
  UpdateCommitmentInput,
  UpdateCostCategoryInput,
  UpdateCostInput,
} from "./cost.validators"

const isoDateToUtc = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`)
const toIsoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

// ── Categories ──────────────────────────────────────────────────────────

export async function listCategories() {
  return prisma.costCategory.findMany({ orderBy: { name: "asc" } })
}

export async function createCategory(input: CreateCostCategoryInput, actor: AccessTokenPayload) {
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.costCategory.create({
        data: { code: input.code, name: input.name },
      })

      await writeAudit(tx, {
        entity: "COST_CATEGORY",
        entityId: category.id,
        action: "CREATE",
        changedBy: actor.sub,
        after: { code: category.code, name: category.name },
      })

      return category
    })
  } catch (err) {
    // Unique violation on `code` or `name` — caught around the transaction,
    // matching createCategory in the asset module.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      throw new AppError(409, "A category with this code or name already exists")
    }
    throw err
  }
}

/** No delete: a category with history is not removable, and code is immutable once created. */
export async function updateCategory(
  id: string,
  input: UpdateCostCategoryInput,
  actor: AccessTokenPayload
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.costCategory.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Cost category not found")

    const data: Prisma.CostCategoryUpdateInput = {}
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}

    if (input.name !== undefined && input.name !== existing.name) {
      before.name = existing.name
      after.name = input.name
      data.name = input.name
    }

    if (Object.keys(data).length === 0) return existing

    const updated = await tx.costCategory.update({ where: { id }, data })

    await writeAudit(tx, {
      entity: "COST_CATEGORY",
      entityId: id,
      action: "UPDATE",
      changedBy: actor.sub,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
    })

    return updated
  })
}

// ── Commitments ─────────────────────────────────────────────────────────

export interface ListCommitmentsFilters {
  active?: boolean
}

export async function listCommitments(filters: ListCommitmentsFilters = {}) {
  return prisma.costCommitment.findMany({
    where: filters.active ? { endedOn: null } : {},
    include: { category: true },
    orderBy: { startedOn: "desc" },
  })
}

export async function createCommitment(input: CreateCommitmentInput, actor: AccessTokenPayload) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.costCategory.findUnique({ where: { id: input.categoryId } })
    if (!category) throw new AppError(400, "Cost category not found")

    const commitment = await tx.costCommitment.create({
      data: {
        categoryId: input.categoryId,
        label: input.label,
        payee: input.payee,
        amount: input.amount !== undefined ? dec(input.amount) : null,
        currency: input.currency ?? "BDT",
        dueDay: input.dueDay ?? null,
        startedOn: isoDateToUtc(input.startedOn),
        notes: input.notes ?? null,
      },
    })

    await writeAudit(tx, {
      entity: "COST_COMMITMENT",
      entityId: commitment.id,
      action: "CREATE",
      changedBy: actor.sub,
      after: { categoryId: input.categoryId, label: input.label, payee: input.payee },
    })

    return commitment
  })
}

/**
 * Also how a commitment is ended — via `endedOn`, never a delete. The bills
 * a commitment explains still exist after it stops, so removing the row
 * would orphan them.
 */
export async function updateCommitment(
  id: string,
  input: UpdateCommitmentInput,
  actor: AccessTokenPayload
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.costCommitment.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Cost commitment not found")

    const data: Prisma.CostCommitmentUpdateInput = {}
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}

    if (input.label !== undefined && input.label !== existing.label) {
      before.label = existing.label
      after.label = input.label
      data.label = input.label
    }
    if (input.payee !== undefined && input.payee !== existing.payee) {
      before.payee = existing.payee
      after.payee = input.payee
      data.payee = input.payee
    }
    if (input.amount !== undefined) {
      const newAmount = input.amount === null ? null : dec(input.amount)
      const oldAmount = existing.amount
      const changed =
        (newAmount === null) !== (oldAmount === null) ||
        (newAmount !== null && oldAmount !== null && !newAmount.equals(oldAmount))
      if (changed) {
        before.amount = oldAmount ? toMoneyString(oldAmount) : null
        after.amount = newAmount ? toMoneyString(newAmount) : null
        data.amount = newAmount
      }
    }
    if (input.currency !== undefined && input.currency !== existing.currency) {
      before.currency = existing.currency
      after.currency = input.currency
      data.currency = input.currency
    }
    if (input.dueDay !== undefined && input.dueDay !== existing.dueDay) {
      before.dueDay = existing.dueDay
      after.dueDay = input.dueDay
      data.dueDay = input.dueDay
    }
    if (input.notes !== undefined && input.notes !== existing.notes) {
      before.notes = existing.notes
      after.notes = input.notes
      data.notes = input.notes
    }
    if (input.endedOn !== undefined) {
      const newEndedOn = input.endedOn === null ? null : isoDateToUtc(input.endedOn)
      const oldIso = toIsoDate(existing.endedOn)
      if (input.endedOn !== oldIso) {
        before.endedOn = oldIso
        after.endedOn = input.endedOn
        data.endedOn = newEndedOn
      }
    }

    if (Object.keys(data).length === 0) return existing

    const updated = await tx.costCommitment.update({ where: { id }, data })

    await writeAudit(tx, {
      entity: "COST_COMMITMENT",
      entityId: id,
      action: "UPDATE",
      changedBy: actor.sub,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
    })

    return updated
  })
}

// ── Bills ───────────────────────────────────────────────────────────────

export interface ListCostsFilters {
  year?: number
  month?: number
  categoryId?: string
  status?: "PENDING" | "PAID"
}

/** Each row carries a derived `isOverdue`, never a stored one. */
export async function listCosts(filters: ListCostsFilters = {}) {
  const where: Prisma.OperatingCostWhereInput = {
    ...(filters.year !== undefined ? { periodYear: filters.year } : {}),
    ...(filters.month !== undefined ? { periodMonth: filters.month } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  }

  const bills = await prisma.operatingCost.findMany({
    where,
    include: { category: true, commitment: true },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { createdAt: "desc" }],
  })

  const asOf = new Date()
  return bills.map((bill) => ({ ...bill, isOverdue: isOverdue(bill, asOf) }))
}

export async function getCost(id: string) {
  const bill = await prisma.operatingCost.findUnique({
    where: { id },
    include: { category: true, commitment: true, attachments: true },
  })
  if (!bill) throw new AppError(404, "Cost not found")
  return { ...bill, isOverdue: isOverdue(bill, new Date()) }
}

/**
 * The database `@@unique([commitmentId, periodYear, periodMonth])` is the
 * real guarantee. This pre-check exists only to turn that constraint
 * violation into a message naming the bill that already exists — an ad-hoc
 * bill with no `commitmentId` has no period to collide on, so the check is
 * skipped entirely for it.
 */
export async function createCost(input: CreateCostInput, actor: AccessTokenPayload) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.costCategory.findUnique({ where: { id: input.categoryId } })
    if (!category) throw new AppError(400, "Cost category not found")

    if (input.commitmentId) {
      const commitment = await tx.costCommitment.findUnique({ where: { id: input.commitmentId } })
      if (!commitment) throw new AppError(400, "Cost commitment not found")

      const clash = await tx.operatingCost.findFirst({
        where: {
          commitmentId: input.commitmentId,
          periodYear: input.periodYear,
          periodMonth: input.periodMonth,
        },
      })
      if (clash) {
        throw new AppError(
          409,
          `${clash.label} for ${input.periodMonth}/${input.periodYear} is already recorded`
        )
      }
    }

    const cost = await tx.operatingCost.create({
      data: {
        categoryId: input.categoryId,
        commitmentId: input.commitmentId ?? null,
        label: input.label,
        payee: input.payee,
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
        amount: dec(input.amount),
        currency: input.currency ?? "BDT",
        dueDate: input.dueDate ? isoDateToUtc(input.dueDate) : null,
        notes: input.notes ?? null,
        createdBy: actor.sub,
      },
    })

    await writeAudit(tx, {
      entity: "COST",
      entityId: cost.id,
      action: "CREATE",
      changedBy: actor.sub,
      after: {
        categoryId: input.categoryId,
        label: input.label,
        amount: toMoneyString(dec(input.amount)),
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
      },
    })

    return cost
  })
}

/**
 * The period a bill is FOR and the commitment it is linked to are set once,
 * at creation. This never touches either — changing them would be a
 * different bill, not an edit of this one.
 */
export async function updateCost(id: string, input: UpdateCostInput, actor: AccessTokenPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.operatingCost.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Cost not found")

    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      const category = await tx.costCategory.findUnique({ where: { id: input.categoryId } })
      if (!category) throw new AppError(400, "Cost category not found")
    }

    const data: Prisma.OperatingCostUpdateInput = {}
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}

    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      before.categoryId = existing.categoryId
      after.categoryId = input.categoryId
      data.category = { connect: { id: input.categoryId } }
    }
    if (input.label !== undefined && input.label !== existing.label) {
      before.label = existing.label
      after.label = input.label
      data.label = input.label
    }
    if (input.payee !== undefined && input.payee !== existing.payee) {
      before.payee = existing.payee
      after.payee = input.payee
      data.payee = input.payee
    }
    if (input.amount !== undefined) {
      const newAmount = dec(input.amount)
      if (!newAmount.equals(existing.amount)) {
        before.amount = toMoneyString(existing.amount)
        after.amount = toMoneyString(newAmount)
        data.amount = newAmount
      }
    }
    if (input.currency !== undefined && input.currency !== existing.currency) {
      before.currency = existing.currency
      after.currency = input.currency
      data.currency = input.currency
    }
    if (input.dueDate !== undefined) {
      const newDueDate = input.dueDate === null ? null : isoDateToUtc(input.dueDate)
      const oldIso = toIsoDate(existing.dueDate)
      if (input.dueDate !== oldIso) {
        before.dueDate = oldIso
        after.dueDate = input.dueDate
        data.dueDate = newDueDate
      }
    }
    if (input.notes !== undefined && input.notes !== existing.notes) {
      before.notes = existing.notes
      after.notes = input.notes
      data.notes = input.notes
    }

    if (Object.keys(data).length === 0) return existing

    const updated = await tx.operatingCost.update({ where: { id }, data })

    await writeAudit(tx, {
      entity: "COST",
      entityId: id,
      action: "UPDATE",
      changedBy: actor.sub,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
    })

    return updated
  })
}

/** Terminal for a bill: PENDING -> PAID. There is no un-pay. */
export async function payCost(id: string, input: PayCostInput, actor: AccessTokenPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.operatingCost.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Cost not found")
    if (existing.status === "PAID") {
      throw new AppError(409, "This bill is already marked paid")
    }

    const paidAt = input.paidAt ? isoDateToUtc(input.paidAt) : new Date()

    const updated = await tx.operatingCost.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt,
        paidBy: actor.sub,
        paymentRef: input.paymentRef ?? null,
      },
    })

    await writeAudit(tx, {
      entity: "COST",
      entityId: id,
      action: "PAY",
      changedBy: actor.sub,
      before: { status: existing.status },
      after: { status: "PAID", paidAt: paidAt.toISOString(), paymentRef: input.paymentRef ?? null },
    })

    return updated
  })
}
