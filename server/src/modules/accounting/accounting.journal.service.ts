/**
 * The journal lifecycle.
 *
 * Mutable while DRAFT or PENDING_APPROVAL, with every edit recorded;
 * immutable the moment it posts, and corrected only by a reversal
 * (Decision 9). That single line is what separates this from a table with a
 * status column.
 *
 * Approve, reject and reverse live in accounting.journal.post.ts — they are
 * the Super Admin half of the same lifecycle and share the guards below.
 */

import prisma from "../../config/prisma"
import type { Journal, JournalStatus, Prisma } from "../../generated/prisma/client"
import { Prisma as P } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { requirePostableAccounts } from "./accounting.coa.service"
import { resolveOpenPeriod } from "./accounting.period.service"
import { assertBalanced } from "./accounting.utils"
import type {
  CreateJournalInput,
  JournalLineInput,
  JournalQuery,
  UpdateJournalInput,
} from "./accounting.validators"

/** "BS-JV-00123" — five digits, matching nextAssetTag and employee codes. */
export async function nextJournalNo(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.idCounter.upsert({
    where: { id: "JV" },
    update: { value: { increment: 1 } },
    create: { id: "JV", value: 1 },
  })
  return `BS-JV-${String(counter.value).padStart(5, "0")}`
}

export function toLineData(lines: JournalLineInput[]) {
  return lines.map((l, i) => ({
    accountId: l.accountId,
    debit: new P.Decimal(l.debit),
    credit: new P.Decimal(l.credit),
    narration: l.narration ?? null,
    departmentId: l.departmentId ?? null,
    employeeId: l.employeeId ?? null,
    sourceCurrency: l.sourceCurrency ?? null,
    sourceAmount: l.sourceAmount ? new P.Decimal(l.sourceAmount) : null,
    fxRateToBdt: l.fxRateToBdt ? new P.Decimal(l.fxRateToBdt) : null,
    sortOrder: i,
  }))
}

/** Invariant 6, in one place. */
export function assertEditable(journal: { status: JournalStatus; journalNo: string }): void {
  if (journal.status === "POSTED") {
    throw new AppError(
      409,
      `${journal.journalNo} is posted and cannot be changed. Reverse it and post a correction instead.`
    )
  }
  if (journal.status === "REVERSED") {
    throw new AppError(409, `${journal.journalNo} has been reversed and cannot be changed`)
  }
}

const journalInclude = {
  lines: {
    orderBy: { sortOrder: "asc" as const },
    include: { account: { select: { id: true, code: true, name: true, type: true } } },
  },
  attachments: { orderBy: { uploadedAt: "desc" as const } },
  period: { select: { id: true, year: true, month: true, status: true } },
}

export async function listJournals(query: JournalQuery): Promise<{ rows: Journal[]; total: number }> {
  const where: Prisma.JournalWhereInput = {
    ...(query.from || query.to
      ? { date: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.sourceModule ? { sourceModule: query.sourceModule } : {}),
    ...(query.accountId || query.departmentId || query.employeeId
      ? {
          lines: {
            some: {
              ...(query.accountId ? { accountId: query.accountId } : {}),
              ...(query.departmentId ? { departmentId: query.departmentId } : {}),
              ...(query.employeeId ? { employeeId: query.employeeId } : {}),
            },
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { journalNo: { contains: query.q, mode: "insensitive" as const } },
            { narration: { contains: query.q, mode: "insensitive" as const } },
            { reference: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.journal.findMany({
      where,
      include: journalInclude,
      // Date first, then number: two journals on the same day read in the
      // order they were written, which is how a register is expected to run.
      orderBy: [{ date: "desc" }, { journalNo: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.journal.count({ where }),
  ])

  return { rows, total }
}

export async function getJournal(id: string): Promise<Journal> {
  const journal = await prisma.journal.findUnique({ where: { id }, include: journalInclude })
  if (!journal) throw new AppError(404, "Journal not found")
  return journal
}

/**
 * An OPENING journal is the one journal per financial year that establishes
 * its starting balances, so it is dated that year's first day and there can
 * only be one.
 */
async function assertOpeningIsUnique(
  tx: Prisma.TransactionClient,
  periodId: string,
  date: Date,
  excludeJournalId?: string
): Promise<void> {
  const period = await tx.accountingPeriod.findFirst({
    where: { id: periodId },
    include: { financialYear: true },
  })
  if (!period) throw new AppError(400, "Period not found")

  if (date.getTime() !== period.financialYear.startDate.getTime()) {
    throw new AppError(
      400,
      `An opening journal is dated the first day of ${period.financialYear.name}`
    )
  }

  const existing = await tx.journal.findFirst({
    where: {
      type: "OPENING",
      period: { financialYearId: period.financialYearId },
      ...(excludeJournalId ? { id: { not: excludeJournalId } } : {}),
    },
    select: { journalNo: true },
  })
  if (existing) {
    throw new AppError(
      409,
      `${period.financialYear.name} already has an opening journal (${existing.journalNo})`
    )
  }
}

export async function createJournal(
  input: CreateJournalInput,
  actor: AccessTokenPayload
): Promise<Journal> {
  const lineData = toLineData(input.lines)
  assertBalanced(lineData)

  return prisma.$transaction(async (tx) => {
    const period = await resolveOpenPeriod(tx, input.date)
    await requirePostableAccounts(
      tx,
      input.lines.map((l) => l.accountId)
    )
    if (input.type === "OPENING") {
      await assertOpeningIsUnique(tx, period.id, input.date)
    }

    const created = await tx.journal.create({
      data: {
        journalNo: await nextJournalNo(tx),
        date: input.date,
        periodId: period.id,
        type: input.type,
        status: "DRAFT",
        narration: input.narration,
        reference: input.reference ?? null,
        createdBy: actor.sub,
        lines: { createMany: { data: lineData } },
      },
    })

    await writeAudit(tx, {
      entity: "JOURNAL",
      entityId: created.id,
      action: "CREATE",
      changedBy: actor.sub,
      after: {
        journalNo: created.journalNo,
        date: input.date.toISOString(),
        narration: input.narration,
        lineCount: lineData.length,
      },
    })

    return tx.journal.findUnique({ where: { id: created.id }, include: journalInclude }) as Promise<Journal>
  })
}

export async function updateJournal(
  id: string,
  input: UpdateJournalInput,
  actor: AccessTokenPayload
): Promise<Journal> {
  const lineData = input.lines ? toLineData(input.lines) : undefined
  if (lineData) assertBalanced(lineData)

  return prisma.$transaction(async (tx) => {
    const existing = await tx.journal.findUnique({ where: { id }, include: { lines: true } })
    if (!existing) throw new AppError(404, "Journal not found")
    assertEditable(existing)

    let periodId = existing.periodId
    if (input.date && input.date.getTime() !== existing.date.getTime()) {
      periodId = (await resolveOpenPeriod(tx, input.date)).id
      if (existing.type === "OPENING") {
        await assertOpeningIsUnique(tx, periodId, input.date, id)
      }
    }

    if (lineData) {
      await requirePostableAccounts(tx, input.lines!.map((l) => l.accountId))
      // Replaced wholesale rather than patched: a partial update would leave
      // sortOrder and the removed rows to be reconciled by hand, and the
      // journal must be balanced as a set anyway.
      await tx.journalLine.deleteMany({ where: { journalId: id } })
      await tx.journalLine.createMany({
        data: lineData.map((l) => ({ ...l, journalId: id })),
      })
    }

    const updated = await tx.journal.update({
      where: { id },
      data: {
        ...(input.date ? { date: input.date, periodId } : {}),
        ...(input.narration !== undefined ? { narration: input.narration } : {}),
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
      },
    })

    await writeAudit(tx, {
      entity: "JOURNAL",
      entityId: id,
      action: "UPDATE",
      changedBy: actor.sub,
      before: {
        date: existing.date.toISOString(),
        narration: existing.narration,
        reference: existing.reference,
        lineCount: existing.lines.length,
      },
      after: {
        date: updated.date.toISOString(),
        narration: updated.narration,
        reference: updated.reference,
        lineCount: lineData?.length ?? existing.lines.length,
      },
    })

    return tx.journal.findUnique({ where: { id }, include: journalInclude }) as Promise<Journal>
  })
}

export function deleteJournal(id: string, actor: AccessTokenPayload): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.journal.findUnique({ where: { id } })
    if (!existing) throw new AppError(404, "Journal not found")
    if (existing.status !== "DRAFT") {
      throw new AppError(
        409,
        `${existing.journalNo} is ${existing.status.toLowerCase().replace("_", " ")} and cannot be deleted`
      )
    }

    // A deleted reversal must release the journal it was reversing.
    // Otherwise the original sits REVERSED with nothing reversing it, and
    // the @unique on reversesId means it can never be reversed again.
    if (existing.type === "REVERSAL" && existing.reversesId) {
      await tx.journal.update({
        where: { id: existing.reversesId },
        data: { status: "POSTED" },
      })
    }

    // Lines and attachments cascade from the journal.
    await tx.journal.delete({ where: { id } })

    // The row is gone; the fact that it existed is not. A hard-deleted draft
    // that leaves no trace is a gap in the numbering nobody can explain.
    await writeAudit(tx, {
      entity: "JOURNAL",
      entityId: id,
      action: "DELETE",
      changedBy: actor.sub,
      before: { journalNo: existing.journalNo, narration: existing.narration },
    })
  })
}

export function submitJournal(id: string, actor: AccessTokenPayload): Promise<Journal> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.journal.findUnique({ where: { id }, include: { lines: true } })
    if (!existing) throw new AppError(404, "Journal not found")
    if (existing.status !== "DRAFT") {
      throw new AppError(409, `${existing.journalNo} is not a draft`)
    }

    // Re-checked here rather than trusted from create: a draft can be edited
    // repeatedly, and this is the last gate before another person is asked
    // to approve it.
    assertBalanced(existing.lines)

    const updated = await tx.journal.update({
      where: { id },
      data: {
        status: "PENDING_APPROVAL",
        submittedBy: actor.sub,
        submittedAt: new Date(),
        // A resubmission answers the earlier rejection; leaving the note in
        // place would show a stale complaint beside a fresh submission.
        rejectionNote: null,
      },
    })

    await writeAudit(tx, {
      entity: "JOURNAL",
      entityId: id,
      action: "SUBMIT",
      changedBy: actor.sub,
      before: { status: "DRAFT" },
      after: { status: "PENDING_APPROVAL" },
    })

    return updated
  })
}
