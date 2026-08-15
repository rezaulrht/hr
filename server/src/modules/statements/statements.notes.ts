/**
 * The notes: sixteen generated breakdowns merged with the narrative ones.
 *
 * A note is one ordered list with two sources (2b Decision 2). A
 * `StatementNote` supplies title and prose, an account carrying a matching
 * `noteRef` supplies the table, and either may be absent — so a note may be
 * prose only, table only, or both, and nothing here branches on which.
 */

import { Prisma } from "../../generated/prisma/client"
import prisma from "../../config/prisma"
import {
  balancesFor,
  loadChart,
  sumLeaves,
  ZERO,
  type BalanceMap,
  type ChartAccount,
  type ChartIndex,
} from "./statements.balances"
import { assertValidRange, describeRange, shiftBackOneYear, type DateRange } from "./statements.period"
import { compareRefs } from "./statements.refs"
import type { NoteRow, NotesResult, StatementNoteView } from "./statements.types"

const two = (d: Prisma.Decimal) => d.toFixed(2)

/**
 * A note exists to break down the line above it, so it has to be read the
 * same way that line was.
 *
 * A balance-sheet anchor reads the cumulative balance *including* CLOSING,
 * exactly as `statements.position.ts` does. Reading a movement instead makes
 * note 10.00 Share Capital nil in every year the company did not issue
 * shares, while the balance sheet beside it shows the balance — and note
 * 11.00 Retained Earnings would drop the very entry that puts the money
 * there.
 *
 * A profit-and-loss anchor reads the period movement *excluding* CLOSING,
 * exactly as `statements.pnl.ts` does, for the reason recorded there: the
 * year-end entry nets every profit-and-loss account to zero.
 */
const isProfitAndLoss = (account: ChartAccount) =>
  account.type === "INCOME" || account.type === "EXPENSE"

/**
 * 2b Decision 9: a group anchor shows one row per **child**, not per leaf
 * descendant. Note 16.00's children are 5110 and 5120, and 16.01 breaks 5120
 * down separately — flattening to leaves would leave 16.01 nothing to say.
 *
 * The child's *figure* is still the sum of its leaves. `5120 Direct Expenses`
 * is itself a group with eight children, and a journal line can never point
 * at a group, so reading its own balance returns nil and the note quietly
 * disagrees with the Profit or Loss above it. `sumLeaves` on a leaf returns
 * that leaf, so one call covers both shapes.
 */
const noteAccounts = (chart: ChartIndex, anchor: ChartAccount) =>
  anchor.isGroup ? chart.childrenOf(anchor.id) : [anchor]

export async function statementNotes(range: DateRange): Promise<NotesResult> {
  assertValidRange(range)
  const comparativeRange = shiftBackOneYear(range)

  // Four reads: the two periods times the two shapes above. Which pair a note
  // uses is decided once per anchor rather than per row — an anchor's
  // children always share its type, since `code` fixes `type` on write.
  const [chart, movement, movementPrior, cumulative, cumulativePrior, narrative] = await Promise.all([
    loadChart(),
    balancesFor({ from: range.from, to: range.to, excludeClosing: true }),
    balancesFor({ from: comparativeRange.from, to: comparativeRange.to, excludeClosing: true }),
    balancesFor({ to: range.to, excludeClosing: false }),
    balancesFor({ to: comparativeRange.to, excludeClosing: false }),
    prisma.statementNote.findMany(),
  ])

  const byRef = new Map<string, StatementNoteView>()

  for (const anchor of chart.all) {
    if (!anchor.noteRef) continue

    const pnl = isProfitAndLoss(anchor)
    const current = pnl ? movement : cumulative
    const comparative = pnl ? movementPrior : cumulativePrior
    const accounts = noteAccounts(chart, anchor)
    const value = (balances: BalanceMap, account: ChartAccount) =>
      sumLeaves(chart, balances, account.id)

    const rows: NoteRow[] = accounts.map((account) => ({
      accountId: account.id,
      code: account.code,
      name: account.name,
      current: two(value(current, account)),
      comparative: two(value(comparative, account)),
    }))

    byRef.set(anchor.noteRef, {
      ref: anchor.noteRef,
      title: anchor.name,
      body: null,
      rows,
      total: two(accounts.reduce((t, a) => t.plus(value(current, a)), ZERO)),
      totalComparative: two(accounts.reduce((t, a) => t.plus(value(comparative, a)), ZERO)),
    })
  }

  // Title resolution: the typed title wins, otherwise the anchor account's
  // name — so note 17.00 titles itself with nothing typed at all.
  for (const note of narrative) {
    const existing = byRef.get(note.ref)
    byRef.set(note.ref, {
      ref: note.ref,
      title: note.title,
      body: note.body.trim() === "" ? null : note.body,
      rows: existing?.rows ?? [],
      total: existing?.total ?? null,
      totalComparative: existing?.totalComparative ?? null,
    })
  }

  // 2b Decision 3. Refs compare segment by segment as integers, so
  // 9.01 < 10.00 < 16.00 < 16.01 rather than lexically. `sortOrder` breaks a
  // genuine tie, which is reachable because `compareRefs` treats "2", "2.0"
  // and "2.00" as the same number.
  const sortOrder = new Map(narrative.map((n) => [n.ref, n.sortOrder]))
  const notes = [...byRef.values()].sort(
    (a, b) => compareRefs(a.ref, b.ref) || (sortOrder.get(a.ref) ?? 0) - (sortOrder.get(b.ref) ?? 0)
  )

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString(), label: describeRange(range) },
    comparativePeriod: {
      from: comparativeRange.from.toISOString(),
      to: comparativeRange.to.toISOString(),
      label: describeRange(comparativeRange),
    },
    notes,
  }
}
