/**
 * Financial years and the twelve monthly periods under each.
 *
 * There is deliberately no "active financial year" flag. A journal's period
 * comes from its date and nothing else — on 3 July, June is still open for
 * late entries and July is already accepting new ones, and an active-year
 * flag would force one of those two to be wrong (Decision 4).
 *
 * Quarters and half-years are derived by summing months, never stored: a
 * closed Q1 containing an open August is a contradiction the system would
 * then have to police forever (Decision 3).
 */

import prisma from "../../config/prisma"
import type {
  AccountingPeriod,
  FinancialYear,
  PeriodStatus,
  Prisma,
} from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { financialYearName, financialYearPeriods } from "./accounting.utils"
import type {
  CreateFinancialYearInput,
  ReopenPeriodInput,
  UpdateFinancialYearInput,
} from "./accounting.validators"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`
}

export function listFinancialYears(): Promise<FinancialYear[]> {
  return prisma.financialYear.findMany({
    orderBy: { startDate: "desc" },
    include: { periods: { orderBy: [{ year: "asc" }, { month: "asc" }] } },
  })
}

export function listPeriods(
  opts: { financialYearId?: string; status?: PeriodStatus } = {}
): Promise<AccountingPeriod[]> {
  return prisma.accountingPeriod.findMany({
    where: {
      ...(opts.financialYearId ? { financialYearId: opts.financialYearId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  })
}

/** The twelve rows a year is born with, all OPEN. */
function periodRows(financialYearId: string, startDate: Date) {
  return financialYearPeriods(startDate).map((p) => ({
    financialYearId,
    year: p.year,
    month: p.month,
    startDate: p.startDate,
    endDate: p.endDate,
    status: "OPEN" as const,
  }))
}

export async function createFinancialYear(
  input: CreateFinancialYearInput,
  actor: AccessTokenPayload
): Promise<FinancialYear> {
  if (input.startDate.getUTCDate() !== 1) {
    throw new AppError(400, "A financial year starts on the first of a month")
  }
  const periods = financialYearPeriods(input.startDate)
  const endDate = periods[11].endDate

  return prisma.$transaction(async (tx) => {
    // Overlap, not just an exact clash: two years sharing a month would give
    // one calendar month two periods, and @@unique([year, month]) would only
    // surface that as an opaque constraint error.
    const overlap = await tx.financialYear.findFirst({
      where: { startDate: { lte: endDate }, endDate: { gte: input.startDate } },
    })
    if (overlap) {
      throw new AppError(409, `${overlap.name} already covers part of that range`)
    }

    const year = await tx.financialYear.create({
      data: { name: financialYearName(input.startDate), startDate: input.startDate, endDate },
    })

    await tx.accountingPeriod.createMany({ data: periodRows(year.id, input.startDate) })

    await writeAudit(tx, {
      entity: "FINANCIAL_YEAR",
      entityId: year.id,
      action: "CREATE",
      changedBy: actor.sub,
      after: { name: year.name, startDate: input.startDate.toISOString() },
    })

    return tx.financialYear.findUnique({
      where: { id: year.id },
      include: { periods: { orderBy: [{ year: "asc" }, { month: "asc" }] } },
    }) as Promise<FinancialYear>
  })
}

export function updateFinancialYear(
  id: string,
  input: UpdateFinancialYearInput,
  actor: AccessTokenPayload
): Promise<FinancialYear> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.financialYear.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Financial year not found")
    if (existing.status === "CLOSED") {
      throw new AppError(409, `${existing.name} is closed`)
    }

    // Moving the dates rebuilds the twelve periods, which is only safe while
    // nothing has been posted into them.
    if (input.startDate) {
      const journals = await tx.journal.count({ where: { period: { financialYearId: id } } })
      if (journals > 0) {
        throw new AppError(
          409,
          `${existing.name} has ${journals} journal(s) in it; its dates can no longer be changed`
        )
      }
      if (input.startDate.getUTCDate() !== 1) {
        throw new AppError(400, "A financial year starts on the first of a month")
      }
      await tx.accountingPeriod.deleteMany({ where: { financialYearId: id } })
      await tx.accountingPeriod.createMany({ data: periodRows(id, input.startDate) })
    }

    const endDate = input.startDate ? financialYearPeriods(input.startDate)[11].endDate : undefined

    const updated = await tx.financialYear.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.startDate ? { startDate: input.startDate, endDate } : {}),
      },
      include: { periods: { orderBy: [{ year: "asc" }, { month: "asc" }] } },
    })

    await writeAudit(tx, {
      entity: "FINANCIAL_YEAR",
      entityId: id,
      action: "UPDATE",
      changedBy: actor.sub,
      before: { name: existing.name, startDate: existing.startDate.toISOString() },
      after: { name: updated.name, startDate: updated.startDate.toISOString() },
    })

    return updated
  })
}

export function deleteFinancialYear(id: string, actor: AccessTokenPayload): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.financialYear.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Financial year not found")

    const journals = await tx.journal.count({ where: { period: { financialYearId: id } } })
    if (journals > 0) {
      throw new AppError(409, `${existing.name} has ${journals} journal(s) in it and cannot be deleted`)
    }

    // Periods cascade from the year (onDelete: Cascade on the relation).
    await tx.financialYear.delete({ where: { id } })

    await writeAudit(tx, {
      entity: "FINANCIAL_YEAR",
      entityId: id,
      action: "DELETE",
      changedBy: actor.sub,
      before: { name: existing.name },
    })
  })
}

export function closePeriod(id: string, actor: AccessTokenPayload): Promise<AccountingPeriod> {
  return prisma.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findUnique({ where: { id } })
    if (!period) throw new AppError(404, "Period not found")
    if (period.status === "LOCKED") {
      throw new AppError(409, `${monthLabel(period.year, period.month)} is locked`)
    }
    if (period.status === "CLOSED") {
      throw new AppError(409, `${monthLabel(period.year, period.month)} is already closed`)
    }

    // Naming them matters: "close the month" must not silently strand
    // somebody's unapproved work.
    const outstanding = await tx.journal.findMany({
      where: { periodId: id, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
      select: { journalNo: true, status: true },
      orderBy: { journalNo: "asc" },
    })
    if (outstanding.length > 0) {
      const list = outstanding.map((j) => j.journalNo).join(", ")
      throw new AppError(
        409,
        `${monthLabel(period.year, period.month)} still has unposted journals: ${list}`
      )
    }

    const updated = await tx.accountingPeriod.update({
      where: { id },
      data: { status: "CLOSED", closedBy: actor.sub, closedAt: new Date() },
    })

    await writeAudit(tx, {
      entity: "ACCOUNTING_PERIOD",
      entityId: id,
      action: "CLOSE",
      changedBy: actor.sub,
      after: { status: "CLOSED" },
    })

    return updated
  })
}

export function reopenPeriod(
  id: string,
  input: ReopenPeriodInput,
  actor: AccessTokenPayload
): Promise<AccountingPeriod> {
  return prisma.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findUnique({ where: { id } })
    if (!period) throw new AppError(404, "Period not found")
    if (period.status === "LOCKED") {
      throw new AppError(
        409,
        `${monthLabel(period.year, period.month)} is locked. A locked year is permanent.`
      )
    }
    if (period.status === "OPEN") {
      throw new AppError(409, `${monthLabel(period.year, period.month)} is already open`)
    }

    const updated = await tx.accountingPeriod.update({
      where: { id },
      data: {
        status: "OPEN",
        reopenedBy: actor.sub,
        reopenedAt: new Date(),
        reopenReason: input.reason,
      },
    })

    await writeAudit(tx, {
      entity: "ACCOUNTING_PERIOD",
      entityId: id,
      action: "REOPEN",
      changedBy: actor.sub,
      before: { status: "CLOSED" },
      after: { status: "OPEN" },
      note: input.reason,
    })

    return updated
  })
}

/**
 * Invariant 4: a journal's date must land in an OPEN period. The period is
 * resolved *from* the date and never chosen by the caller, which is what
 * makes "no posting into a closed period" impossible to route around.
 */
export async function resolveOpenPeriod(
  tx: Prisma.TransactionClient,
  date: Date
): Promise<AccountingPeriod> {
  const period = await tx.accountingPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
  })
  const iso = date.toISOString().slice(0, 10)

  if (!period) {
    throw new AppError(400, `No financial year covers ${iso}. Create one first.`)
  }
  if (period.status === "CLOSED") {
    throw new AppError(400, `${monthLabel(period.year, period.month)} is closed`)
  }
  if (period.status === "LOCKED") {
    throw new AppError(400, `${monthLabel(period.year, period.month)} is locked`)
  }
  return period
}

/**
 * The earliest still-open period at or after `date` — where a reversal lands
 * when the original's period has since closed (Decision 9).
 */
export async function earliestOpenPeriodFrom(
  tx: Prisma.TransactionClient,
  date: Date
): Promise<AccountingPeriod> {
  const period = await tx.accountingPeriod.findFirst({
    where: { status: "OPEN", endDate: { gte: date } },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  })
  if (!period) {
    throw new AppError(
      400,
      "There is no open period to post a reversal into. Reopen a period or create the next financial year."
    )
  }
  return period
}
