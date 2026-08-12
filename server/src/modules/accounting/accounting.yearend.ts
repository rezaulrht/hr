/**
 * Year-end: closing the P&L into Retained Earnings.
 *
 * The sequence matters (Decision 12). Closing requires every month except
 * the last to be CLOSED and the last one to still be OPEN, because the
 * closing journal is dated the last day of the year and has to post into an
 * open period like any other entry. A year-end that needs an exception to
 * the posting rules is a year-end nobody can trust.
 *
 * Drafting is a Finance Officer action. Making it Super Admin-only would put
 * the same person in createdBy and approvedBy on the single most scrutinised
 * journal of the year, which is exactly the control Decision 11 exists for.
 *
 * Balance-sheet accounts carry forward with no entry at all: balances are
 * computed from inception (Decision 7), so "opening balance carry forward"
 * is arithmetic here, not a job that can fail to run.
 */

import prisma from "../../config/prisma"
import type { Journal, Prisma } from "../../generated/prisma/client"
import { Prisma as P } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { writeAudit } from "../../utils/audit"
import type { AccessTokenPayload } from "../auth/auth.types"
import { nextJournalNo } from "./accounting.journal.service"
import { monthLabel } from "./accounting.period.service"
import { assertBalanced } from "./accounting.utils"

const ZERO = new P.Decimal(0)

export function draftYearEndJournal(
  financialYearId: string,
  actor: AccessTokenPayload
): Promise<Journal> {
  return prisma.$transaction(async (tx) => {
    const year = await tx.financialYear.findUnique({ where: { id: financialYearId } })
    if (!year) throw new AppError(404, "Financial year not found")
    if (year.status === "CLOSED") {
      throw new AppError(409, `${year.name} is already closed`)
    }

    const existing = await tx.journal.findFirst({
      where: { type: "CLOSING", period: { financialYearId } },
      select: { journalNo: true },
    })
    if (existing) {
      throw new AppError(
        409,
        `${year.name} already has a closing journal (${existing.journalNo})`
      )
    }

    const periods = await tx.accountingPeriod.findMany({
      where: { financialYearId },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    })
    const last = periods[periods.length - 1]
    if (!last) throw new AppError(400, `${year.name} has no periods`)

    const stillOpen = periods
      .slice(0, -1)
      .filter((p) => p.status === "OPEN")
      .map((p) => monthLabel(p.year, p.month))
    if (stillOpen.length > 0) {
      throw new AppError(
        409,
        `Close these months before running year-end: ${stillOpen.join(", ")}`
      )
    }
    if (last.status !== "OPEN") {
      throw new AppError(
        409,
        `${monthLabel(last.year, last.month)} must be open to receive the closing entry. Reopen it, then run year-end.`
      )
    }

    const retained = await tx.account.findFirst({ where: { systemRole: "RETAINED_EARNINGS" } })
    if (!retained) {
      throw new AppError(
        400,
        "No account carries the RETAINED_EARNINGS role. Set it on the Retained Earnings account first."
      )
    }

    // Every income and expense account's movement within this year.
    const pnlAccounts = await tx.account.findMany({
      where: { type: { in: ["INCOME", "EXPENSE"] }, isGroup: false },
      select: { id: true, code: true, name: true, type: true },
    })
    const pnlIds = pnlAccounts.map((a) => a.id)

    const sums = await tx.journalLine.groupBy({
      by: ["accountId"],
      where: {
        accountId: { in: pnlIds },
        // Decision 16: REVERSED counts. A reversed entry and its reversal
        // both belong in the year being closed.
        journal: {
          status: { in: ["POSTED", "REVERSED"] },
          date: { gte: year.startDate, lte: year.endDate },
        },
      },
      _sum: { debit: true, credit: true },
    })

    // Zero each account by posting the opposite of its net movement. Done
    // generically rather than per type, so a contra account — an income line
    // sitting in debit after refunds — zeroes correctly too.
    const lines: Array<{ accountId: string; debit: P.Decimal; credit: P.Decimal; sortOrder: number }> = []
    let netDebit = ZERO
    let netCredit = ZERO

    for (const row of sums) {
      const debit = row._sum.debit ?? ZERO
      const credit = row._sum.credit ?? ZERO
      const net = debit.minus(credit)
      if (net.isZero()) continue

      if (net.greaterThan(0)) {
        // Debit balance (an expense): credit it away.
        lines.push({ accountId: row.accountId, debit: ZERO, credit: net, sortOrder: lines.length })
        netCredit = netCredit.plus(net)
      } else {
        // Credit balance (revenue): debit it away.
        const amount = net.abs()
        lines.push({ accountId: row.accountId, debit: amount, credit: ZERO, sortOrder: lines.length })
        netDebit = netDebit.plus(amount)
      }
    }

    if (lines.length === 0) {
      throw new AppError(400, `${year.name} has no income or expense movement to close`)
    }

    // Retained Earnings takes the balancing figure: credited on a profit,
    // debited on a loss.
    const balancing = netCredit.minus(netDebit)
    lines.push({
      accountId: retained.id,
      debit: balancing.greaterThan(0) ? balancing : ZERO,
      credit: balancing.greaterThan(0) ? ZERO : balancing.abs(),
      sortOrder: lines.length,
    })

    assertBalanced(lines)

    const created = await tx.journal.create({
      data: {
        journalNo: await nextJournalNo(tx),
        date: year.endDate,
        periodId: last.id,
        type: "CLOSING",
        status: "DRAFT",
        narration: `Closing entry for ${year.name} — income and expenses to Retained Earnings`,
        createdBy: actor.sub,
        lines: { createMany: { data: lines.map((l) => ({ ...l, narration: null })) } },
      },
    })

    await writeAudit(tx, {
      entity: "FINANCIAL_YEAR",
      entityId: financialYearId,
      action: "CREATE",
      changedBy: actor.sub,
      after: { closingJournal: created.journalNo, lineCount: lines.length },
      note: `Year-end closing journal drafted for ${year.name}`,
    })

    return tx.journal.findUnique({
      where: { id: created.id },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { account: { select: { id: true, code: true, name: true, type: true } } },
        },
      },
    }) as Promise<Journal>
  })
}

/**
 * Called from `postApprovedJournal` inside the posting transaction. For an
 * ordinary journal it does nothing; for a CLOSING journal it locks all
 * twelve periods and closes the year, so approval and the lock are one
 * atomic act rather than two things a crash could separate.
 */
export async function lockYearAfterClosing(
  tx: Prisma.TransactionClient,
  journal: { id: string; type: string; periodId: string },
  actor: AccessTokenPayload
): Promise<void> {
  if (journal.type !== "CLOSING") return

  const period = await tx.accountingPeriod.findUnique({ where: { id: journal.periodId } })
  if (!period) throw new AppError(400, "Period not found")

  await tx.accountingPeriod.updateMany({
    where: { financialYearId: period.financialYearId },
    data: { status: "LOCKED" },
  })

  await tx.financialYear.update({
    where: { id: period.financialYearId },
    data: { status: "CLOSED", closedBy: actor.sub, closedAt: new Date() },
  })

  await writeAudit(tx, {
    entity: "FINANCIAL_YEAR",
    entityId: period.financialYearId,
    action: "LOCK",
    changedBy: actor.sub,
    after: { status: "CLOSED" },
  })
}
