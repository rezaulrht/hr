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

interface ClosingLine {
  accountId: string
  debit: P.Decimal
  credit: P.Decimal
  sortOrder: number
}

/**
 * The closing entry, derived from the ledger. Used twice: once to draft it,
 * and once at approval to prove it is still the right answer.
 *
 * Both callers must compute it identically or the second is worthless, which
 * is why this is one function rather than two similar blocks.
 */
async function computeClosingLines(
  tx: Prisma.TransactionClient,
  year: { id: string; name: string; startDate: Date; endDate: Date },
  retainedEarningsId: string
): Promise<ClosingLine[]> {
  const pnlAccounts = await tx.account.findMany({
    where: { type: { in: ["INCOME", "EXPENSE"] }, isGroup: false },
    select: { id: true },
  })

  const sums = await tx.journalLine.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: pnlAccounts.map((a) => a.id) },
      journal: {
        // Decision 16: REVERSED counts. A reversed entry and its reversal
        // both belong in the year being closed.
        status: { in: ["POSTED", "REVERSED"] },
        // The closing entry itself must never be part of the movement it is
        // closing. At draft time there is none, so this changes nothing; at
        // approval time the entry has *already* flipped to POSTED, and
        // without this the recomputation would see its own contra and
        // conclude that every account nets to zero. Slice 2's profit-and-loss
        // aggregations exclude CLOSING for the same reason.
        type: { not: "CLOSING" },
        date: { gte: year.startDate, lte: year.endDate },
      },
    },
    _sum: { debit: true, credit: true },
  })

  // Zero each account by posting the opposite of its net movement. Done
  // generically rather than per type, so a contra account — an income line
  // sitting in debit after refunds — zeroes correctly too.
  const lines: ClosingLine[] = []
  let netDebit = ZERO
  let netCredit = ZERO

  // Sorted so the two computations produce the same order from the same
  // ledger; groupBy makes no ordering promise of its own.
  for (const row of [...sums].sort((a, b) => a.accountId.localeCompare(b.accountId))) {
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
    accountId: retainedEarningsId,
    debit: balancing.greaterThan(0) ? balancing : ZERO,
    credit: balancing.greaterThan(0) ? ZERO : balancing.abs(),
    sortOrder: lines.length,
  })

  assertBalanced(lines)
  return lines
}

/**
 * Same accounts, same amounts — order and sortOrder ignored, since neither
 * changes what the entry does to the ledger.
 */
export function closingLinesMatch(
  expected: Array<{ accountId: string; debit: P.Decimal; credit: P.Decimal }>,
  actual: Array<{ accountId: string; debit: P.Decimal; credit: P.Decimal }>
): boolean {
  if (expected.length !== actual.length) return false

  const actualByAccount = new Map(actual.map((l) => [l.accountId, l]))
  return expected.every((e) => {
    const a = actualByAccount.get(e.accountId)
    return a !== undefined && a.debit.equals(e.debit) && a.credit.equals(e.credit)
  })
}

async function requireRetainedEarnings(tx: Prisma.TransactionClient): Promise<{ id: string }> {
  const retained = await tx.account.findFirst({ where: { systemRole: "RETAINED_EARNINGS" } })
  if (!retained) {
    throw new AppError(
      400,
      "No account carries the RETAINED_EARNINGS role. Set it on the Retained Earnings account first."
    )
  }
  return retained
}

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

    const retained = await requireRetainedEarnings(tx)
    const lines = await computeClosingLines(tx, year, retained.id)

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
 *
 * Both checks below exist because of the gap between drafting the closing
 * entry and approving it. Year-end requires the final month to stay OPEN so
 * the entry can post into it like any other — which is precisely the window
 * in which more entries can be posted. Anything that lands in it after the
 * draft was computed leaves the profit-and-loss accounts non-zero and
 * Retained Earnings short by the difference. The balance sheet would still
 * balance, because the residual sits in the derived profit line and the two
 * errors offset; the Statement of Changes in Equity would quietly stop tying
 * to it. And the year would be locked, permanently, with no correction path.
 *
 * Everything here throws inside the approval transaction, so a stale entry
 * simply fails to post and the year stays open.
 */
export async function lockYearAfterClosing(
  tx: Prisma.TransactionClient,
  journal: { id: string; journalNo: string; type: string; periodId: string },
  actor: AccessTokenPayload
): Promise<void> {
  if (journal.type !== "CLOSING") return

  const period = await tx.accountingPeriod.findUnique({ where: { id: journal.periodId } })
  if (!period) throw new AppError(400, "Period not found")

  const year = await tx.financialYear.findUnique({ where: { id: period.financialYearId } })
  if (!year) throw new AppError(400, "Financial year not found")

  // Nothing may be left in flight. `closePeriod` refuses to close a month
  // holding unposted work, but the final month never goes through it — it
  // goes straight from OPEN to LOCKED here — so this is the only place that
  // rule can be applied to it. A draft stranded in a locked month can never
  // be posted, and was never in the figure being closed either.
  const inFlight = await tx.journal.findMany({
    where: {
      period: { financialYearId: year.id },
      status: { in: ["DRAFT", "PENDING_APPROVAL"] },
      id: { not: journal.id },
    },
    select: { journalNo: true },
    orderBy: { journalNo: "asc" },
  })
  if (inFlight.length > 0) {
    throw new AppError(
      409,
      `${year.name} still has unposted journals: ${inFlight.map((j) => j.journalNo).join(", ")}. Post or delete them before approving ${journal.journalNo}, because locking the year strands them.`
    )
  }

  // And the entry must still be the right answer. Recomputed from the ledger
  // as it stands now, not trusted from when it was drafted.
  const retained = await requireRetainedEarnings(tx)
  const expected = await computeClosingLines(tx, year, retained.id)
  const actual = await tx.journalLine.findMany({
    where: { journalId: journal.id },
    select: { accountId: true, debit: true, credit: true },
  })

  if (!closingLinesMatch(expected, actual)) {
    throw new AppError(
      409,
      `${journal.journalNo} was drafted before the last entries of ${year.name} were posted and no longer closes the year. Delete it and run year-end again.`
    )
  }

  await tx.accountingPeriod.updateMany({
    where: { financialYearId: year.id },
    data: { status: "LOCKED" },
  })

  await tx.financialYear.update({
    where: { id: year.id },
    data: { status: "CLOSED", closedBy: actor.sub, closedAt: new Date() },
  })

  await writeAudit(tx, {
    entity: "FINANCIAL_YEAR",
    entityId: year.id,
    action: "LOCK",
    changedBy: actor.sub,
    after: { status: "CLOSED" },
  })
}
