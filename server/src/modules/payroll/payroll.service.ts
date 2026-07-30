/**
 * Salary structures and exchange rates — the configuration Finance owns
 * before any run can be processed.
 */

import prisma from "../../config/prisma"
import type { Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { auditPayroll } from "./payroll.audit"
import { dec, toMoneyString } from "./payroll.money"
import type {
  ExchangeRateBody,
  ExchangeRateUpdateBody,
  SalaryStructureBody,
} from "./payroll.validators"

function isUniqueViolation(err: unknown): boolean {
  return (err as Prisma.PrismaClientKnownRequestError)?.code === "P2002"
}

const asUtcMidnight = (dateOnly: string) => new Date(`${dateOnly}T00:00:00.000Z`)

function rateConflict(base: string, quote: string, effectiveFrom: string): AppError {
  return new AppError(
    409,
    `A ${base}→${quote} rate already exists effective ${effectiveFrom}`
  )
}

function serializeRate(rate: { base: string; quote: string; rate: Prisma.Decimal; effectiveFrom: Date }) {
  return {
    base: rate.base,
    quote: rate.quote,
    // 6dp, matching the column's own precision — a rate is a ratio, not
    // money, so toMoneyString's 2dp would round 122.456789 to 122.46.
    rate: rate.rate.toFixed(6),
    effectiveFrom: rate.effectiveFrom.toISOString().slice(0, 10),
  }
}

export async function listExchangeRates() {
  return prisma.exchangeRate.findMany({
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  })
}

export async function createExchangeRate(actorUserId: string, body: ExchangeRateBody) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rate = await tx.exchangeRate.create({
        data: {
          base: body.base,
          quote: body.quote,
          rate: dec(body.rate),
          effectiveFrom: asUtcMidnight(body.effectiveFrom),
          createdBy: actorUserId,
        },
      })
      await auditPayroll(tx, {
        entity: "EXCHANGE_RATE",
        entityId: rate.id,
        action: "CREATE",
        changedBy: actorUserId,
        after: serializeRate(rate),
      })
      return rate
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw rateConflict(body.base, body.quote, body.effectiveFrom)
    throw err
  }
}

/**
 * Editing a rate row is allowed and audited, and it cannot corrupt history:
 * every payslip and settlement freezes the rate value it used, not a
 * reference to this row.
 */
export async function updateExchangeRate(
  id: string,
  actorUserId: string,
  body: ExchangeRateUpdateBody
) {
  const existing = await prisma.exchangeRate.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, "Exchange rate not found")

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.exchangeRate.update({
        where: { id },
        data: {
          base: body.base,
          quote: body.quote,
          rate: dec(body.rate),
          effectiveFrom: asUtcMidnight(body.effectiveFrom),
        },
      })
      await auditPayroll(tx, {
        entity: "EXCHANGE_RATE",
        entityId: id,
        action: "UPDATE",
        changedBy: actorUserId,
        before: serializeRate(existing),
        after: serializeRate(updated),
      })
      return updated
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw rateConflict(body.base, body.quote, body.effectiveFrom)
    throw err
  }
}

type StructureWithComponents = Prisma.SalaryStructureGetPayload<{ include: { components: true } }>

function serializeStructure(structure: StructureWithComponents) {
  return {
    name: structure.name,
    currency: structure.currency,
    basic: toMoneyString(structure.basic),
    isActive: structure.isActive,
    components: structure.components.map((c) => ({
      code: c.code,
      label: c.label,
      kind: c.kind,
      calc: c.calc,
      value: c.value.toFixed(2),
      sortOrder: c.sortOrder,
      countsAsWages: c.countsAsWages,
    })),
  }
}

function structureConflict(name: string): AppError {
  return new AppError(409, `A salary structure named "${name}" already exists`)
}

const toComponentCreateInput = (c: SalaryStructureBody["components"][number]) => ({
  code: c.code,
  label: c.label,
  kind: c.kind,
  calc: c.calc,
  value: dec(c.value),
  sortOrder: c.sortOrder,
  countsAsWages: c.countsAsWages,
})

export async function listSalaryStructures() {
  return prisma.salaryStructure.findMany({
    include: { components: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] } },
    orderBy: { name: "asc" },
  })
}

export async function createSalaryStructure(actorUserId: string, body: SalaryStructureBody) {
  try {
    return await prisma.$transaction(async (tx) => {
      const structure = await tx.salaryStructure.create({
        data: {
          name: body.name,
          currency: body.currency,
          basic: dec(body.basic),
          isActive: body.isActive,
          components: { create: body.components.map(toComponentCreateInput) },
        },
        include: { components: true },
      })
      await auditPayroll(tx, {
        entity: "SALARY_STRUCTURE",
        entityId: structure.id,
        action: "CREATE",
        changedBy: actorUserId,
        after: serializeStructure(structure),
      })
      return structure
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw structureConflict(body.name)
    throw err
  }
}

export async function updateSalaryStructure(
  id: string,
  actorUserId: string,
  body: SalaryStructureBody
) {
  const existing = await prisma.salaryStructure.findUnique({
    where: { id },
    include: { components: true },
  })
  if (!existing) throw new AppError(404, "Salary structure not found")

  // Immutable after creation — changing it silently re-denominates every
  // figure already resolved against this structure.
  if (body.currency !== existing.currency) {
    throw new AppError(
      409,
      "Cannot change a salary structure's currency. Every FIXED component and every payslip that used it is denominated in the original currency — move affected employees to a different structure instead."
    )
  }

  if (body.isActive === false) {
    const assigned = await prisma.employee.count({ where: { salaryStructureId: id } })
    if (assigned > 0) {
      throw new AppError(
        409,
        `${assigned} employee(s) are still assigned to this structure. Reassign them before retiring it.`
      )
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // A wholesale replace, not a diff: nothing else in the schema holds a
      // foreign key to SalaryComponent, so delete-then-recreate cannot orphan
      // anything, and it is simpler than reconciling adds/edits/removals by
      // code.
      await tx.salaryComponent.deleteMany({ where: { salaryStructureId: id } })
      const structure = await tx.salaryStructure.update({
        where: { id },
        data: {
          name: body.name,
          basic: dec(body.basic),
          isActive: body.isActive,
          components: { create: body.components.map(toComponentCreateInput) },
        },
        include: { components: true },
      })
      await auditPayroll(tx, {
        entity: "SALARY_STRUCTURE",
        entityId: id,
        action: "UPDATE",
        changedBy: actorUserId,
        before: serializeStructure(existing),
        after: serializeStructure(structure),
      })
      return structure
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw structureConflict(body.name)
    throw err
  }
}
