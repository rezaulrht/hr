import { Prisma } from "../../generated/prisma/client"
import prisma from "../../config/prisma"
import { balancesFor, loadChart, ZERO, type BalanceMap, type ChartAccount, type ChartIndex } from "./statements.balances"
import { assertValidRange, describeRange, shiftBackOneYear, type DateRange } from "./statements.period"
import { compareRefs } from "./statements.refs"
import type { NoteRow, NotesResult, StatementNoteView } from "./statements.types"

const two = (d: Prisma.Decimal) => d.toFixed(2)
const signed = (balances: BalanceMap, id: string) => balances.get(id)?.signed ?? ZERO
const noteAccounts = (chart: ChartIndex, anchor: ChartAccount) => anchor.isGroup ? chart.childrenOf(anchor.id) : [anchor]

export async function statementNotes(range: DateRange): Promise<NotesResult> {
  assertValidRange(range)
  const comparativeRange = shiftBackOneYear(range)
  const [chart, current, comparative, narrative] = await Promise.all([
    loadChart(),
    balancesFor({ from: range.from, to: range.to, excludeClosing: true }),
    balancesFor({ from: comparativeRange.from, to: comparativeRange.to, excludeClosing: true }),
    prisma.statementNote.findMany(),
  ])
  const byRef = new Map<string, StatementNoteView>()
  for (const anchor of chart.all) {
    if (!anchor.noteRef) continue
    const accounts = noteAccounts(chart, anchor)
    const rows: NoteRow[] = accounts.map((account) => ({ accountId: account.id, code: account.code, name: account.name, current: two(signed(current, account.id)), comparative: two(signed(comparative, account.id)) }))
    const total = accounts.reduce((t, a) => t.plus(signed(current, a.id)), ZERO)
    const totalComparative = accounts.reduce((t, a) => t.plus(signed(comparative, a.id)), ZERO)
    byRef.set(anchor.noteRef, { ref: anchor.noteRef, title: anchor.name, body: null, rows, total: two(total), totalComparative: two(totalComparative) })
  }
  for (const note of narrative) {
    const existing = byRef.get(note.ref)
    byRef.set(note.ref, { ref: note.ref, title: note.title, body: note.body.trim() === "" ? null : note.body, rows: existing?.rows ?? [], total: existing?.total ?? null, totalComparative: existing?.totalComparative ?? null })
  }
  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString(), label: describeRange(range) },
    comparativePeriod: { from: comparativeRange.from.toISOString(), to: comparativeRange.to.toISOString(), label: describeRange(comparativeRange) },
    notes: [...byRef.values()].sort((a, b) => compareRefs(a.ref, b.ref)),
  }
}
