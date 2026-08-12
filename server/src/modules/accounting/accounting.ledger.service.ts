/**
 * The read models: General Ledger, Cash Book, Bank Book, Trial Balance.
 *
 * All four are SQL aggregates over posted journal lines. There is no
 * AccountPeriodBalance table and no cache (Decision 7): a maintained balance
 * is a second copy of the truth that can disagree with the journals
 * silently, and at this company's volume the aggregate is fast. A cache can
 * be added later without changing an invariant; it cannot be removed later
 * without a migration and a rebuild tool.
 *
 * Every query filters on IN_LEDGER below. A draft must never reach a ledger,
 * and forgetting that filter is the single most damaging bug this file could
 * carry — hence the same clause, spelled out, in each of them.
 */

import prisma from "../../config/prisma"
import type { Account, AccountCashKind, JournalStatus, Prisma } from "../../generated/prisma/client"
import { Prisma as P } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import type { LedgerResult, LedgerRow, TrialBalanceResult, TrialBalanceRow } from "./accounting.types"
import { normalSide, signedBalance } from "./accounting.utils"
import type { LedgerQuery, TrialBalanceQuery } from "./accounting.validators"

const ZERO = new P.Decimal(0)

/**
 * Decision 16. REVERSED is a ledger-visible status: it means *posted, and
 * later superseded by a reversal that is itself posted*, not *unposted*.
 *
 * Filtering to POSTED alone is wrong twice. After the reversal is approved
 * the original would be excluded while the reversal is included, moving the
 * account by minus the original amount instead of back to zero. And between
 * drafting the reversal and approving it, the original is REVERSED and the
 * reversal is DRAFT, so the entry vanishes with nothing offsetting it.
 *
 * DRAFT and PENDING_APPROVAL stay excluded, which is the rule that matters:
 * nothing reaches a ledger until a second person has approved it.
 */
const IN_LEDGER: { in: JournalStatus[] } = { in: ["POSTED", "REVERSED"] }

const two = (d: P.Decimal) => d.toFixed(2)

export function listCashAccounts(kind: "CASH" | "BANK"): Promise<Account[]> {
  return prisma.account.findMany({
    where: { cashKind: kind, isGroup: false },
    orderBy: { code: "asc" },
  })
}

function dimensionFilter(query: LedgerQuery): Prisma.JournalLineWhereInput {
  return {
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
  }
}

export async function generalLedger(query: LedgerQuery): Promise<LedgerResult> {
  const account = await prisma.account.findUnique({ where: { id: query.accountId } })
  if (!account) throw new AppError(404, "Account not found")

  // Opening balance is everything from inception, not from the start of a
  // financial year. That is what makes "opening balance carry forward"
  // arithmetic rather than a job that can fail to run.
  const prior = await prisma.journalLine.aggregate({
    where: {
      accountId: query.accountId,
      ...dimensionFilter(query),
      journal: { status: IN_LEDGER, date: { lt: query.from } },
    },
    _sum: { debit: true, credit: true },
  })

  const openingBalance = signedBalance(
    account.type,
    prior._sum.debit ?? ZERO,
    prior._sum.credit ?? ZERO
  )

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: query.accountId,
      ...dimensionFilter(query),
      journal: { status: IN_LEDGER, date: { gte: query.from, lte: query.to } },
    },
    select: {
      debit: true,
      credit: true,
      narration: true,
      journal: {
        select: {
          id: true,
          journalNo: true,
          date: true,
          narration: true,
          reference: true,
          sourceModule: true,
        },
      },
    },
    // Journal number breaks the tie so two entries on the same day read in
    // the order they were written.
    orderBy: [{ journal: { date: "asc" } }, { journal: { journalNo: "asc" } }, { sortOrder: "asc" }],
  })

  const side = normalSide(account.type)
  let running = openingBalance
  let totalDebit = ZERO
  let totalCredit = ZERO

  const rows: LedgerRow[] = lines.map((l) => {
    totalDebit = totalDebit.plus(l.debit)
    totalCredit = totalCredit.plus(l.credit)
    const delta = side === "DEBIT" ? l.debit.minus(l.credit) : l.credit.minus(l.debit)
    running = running.plus(delta)

    return {
      journalId: l.journal.id,
      journalNo: l.journal.journalNo,
      date: l.journal.date.toISOString(),
      narration: l.journal.narration,
      lineNarration: l.narration,
      reference: l.journal.reference,
      sourceModule: l.journal.sourceModule,
      debit: two(l.debit),
      credit: two(l.credit),
      runningBalance: two(running),
    }
  })

  return {
    account: { id: account.id, code: account.code, name: account.name, type: account.type },
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    openingBalance: two(openingBalance),
    rows,
    totalDebit: two(totalDebit),
    totalCredit: two(totalCredit),
    closingBalance: two(running),
  }
}

/**
 * The Cash Book and the Bank Book are the General Ledger for a cash- or
 * bank-tagged account, with an opening and a closing balance — which
 * `generalLedger` already returns. The only added rule is that the account
 * must actually be of that kind, so a Bank Book cannot quietly render an
 * expense account.
 */
export async function cashOrBankBook(
  kind: Extract<AccountCashKind, "CASH" | "BANK">,
  query: LedgerQuery
): Promise<LedgerResult> {
  const account = await prisma.account.findUnique({ where: { id: query.accountId } })
  if (!account) throw new AppError(404, "Account not found")
  if (account.cashKind !== kind) {
    throw new AppError(
      400,
      `${account.code} ${account.name} is not a ${kind.toLowerCase()} account`
    )
  }
  return generalLedger(query)
}

export async function trialBalance(query: TrialBalanceQuery): Promise<TrialBalanceResult> {
  const accounts = await prisma.account.findMany({
    where: { isGroup: false },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  })

  const [opening, period] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { journal: { status: IN_LEDGER, date: { lt: query.from } } },
      _sum: { debit: true, credit: true },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { journal: { status: IN_LEDGER, date: { gte: query.from, lte: query.to } } },
      _sum: { debit: true, credit: true },
    }),
  ])

  const openingBy = new Map(opening.map((r) => [r.accountId, r._sum]))
  const periodBy = new Map(period.map((r) => [r.accountId, r._sum]))

  const totals = {
    openingDebit: ZERO,
    openingCredit: ZERO,
    periodDebit: ZERO,
    periodCredit: ZERO,
    closingDebit: ZERO,
    closingCredit: ZERO,
  }

  const rows: TrialBalanceRow[] = []

  for (const account of accounts) {
    const o = openingBy.get(account.id)
    const p = periodBy.get(account.id)

    const openDr = o?.debit ?? ZERO
    const openCr = o?.credit ?? ZERO
    const perDr = p?.debit ?? ZERO
    const perCr = p?.credit ?? ZERO

    // An account with nothing in it is noise on a report meant to be read.
    if (openDr.isZero() && openCr.isZero() && perDr.isZero() && perCr.isZero()) continue

    const openBal = signedBalance(account.type, openDr, openCr)
    const closeBal = signedBalance(account.type, openDr.plus(perDr), openCr.plus(perCr))

    // A balance sits on one side only. Which side depends on the account's
    // normal side *and* on the sign — accumulated depreciation is an ASSET
    // that normally shows a credit, so this cannot key on type alone.
    const onDebitSide = normalSide(account.type) === "DEBIT"
    const place = (bal: P.Decimal) => {
      const positive = bal.greaterThanOrEqualTo(0)
      const showOnDebit = onDebitSide ? positive : !positive
      return showOnDebit
        ? { debit: bal.abs(), credit: ZERO }
        : { debit: ZERO, credit: bal.abs() }
    }

    const openPlaced = place(openBal)
    const closePlaced = place(closeBal)

    totals.openingDebit = totals.openingDebit.plus(openPlaced.debit)
    totals.openingCredit = totals.openingCredit.plus(openPlaced.credit)
    totals.periodDebit = totals.periodDebit.plus(perDr)
    totals.periodCredit = totals.periodCredit.plus(perCr)
    totals.closingDebit = totals.closingDebit.plus(closePlaced.debit)
    totals.closingCredit = totals.closingCredit.plus(closePlaced.credit)

    rows.push({
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      openingDebit: two(openPlaced.debit),
      openingCredit: two(openPlaced.credit),
      periodDebit: two(perDr),
      periodCredit: two(perCr),
      closingDebit: two(closePlaced.debit),
      closingCredit: two(closePlaced.credit),
    })
  }

  return {
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    rows,
    totals: {
      openingDebit: two(totals.openingDebit),
      openingCredit: two(totals.openingCredit),
      periodDebit: two(totals.periodDebit),
      periodCredit: two(totals.periodCredit),
      closingDebit: two(totals.closingDebit),
      closingCredit: two(totals.closingCredit),
    },
    // Reported, never thrown. An unbalanced trial balance is a fact the
    // user needs to see and investigate, not an error that hides the report
    // that would let them find the cause. Slice 2 refuses to generate
    // statements when this is false.
    isBalanced: totals.closingDebit.equals(totals.closingCredit),
  }
}
