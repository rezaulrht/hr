/**
 * The historical bills importer.
 *
 * Thin by design: the parsing, the per-row report and the all-or-nothing
 * transaction all live in `src/utils/import/`, shared with the asset
 * register and historical expenses. This file supplies three things — a
 * column spec, a row validator and a writer.
 *
 * **A row carrying `paidAt` lands as `PAID`; one without lands `PENDING`.**
 * That is what makes importing a year of already-settled bills one file
 * rather than a file plus sixty mark-paid clicks.
 *
 * **Every imported bill gets `commitmentId: null`, deliberately.** The
 * `@@unique([commitmentId, periodYear, periodMonth])` constraint only binds
 * commitment-linked bills — Postgres treats every null as distinct — so
 * historical data that predates the commitment records can never collide
 * on it.
 *
 * No events: this module (see `cost.service.ts`) emits nothing to the event
 * log, importing included.
 */

import prisma from "../../config/prisma"
import { writeAudit } from "../../utils/audit"
import { runCommit, runPreview } from "../../utils/import/import.run"
import type { ImportSpec } from "../../utils/import/import.run"
import type { ColumnSpec, ImportPreview, ParsedRow, RowIssue } from "../../utils/import/import.types"
import type { AccessTokenPayload } from "../auth/auth.types"
import { dec } from "../payroll/payroll.money"

export const COST_IMPORT_COLUMNS: ColumnSpec[] = [
  { header: "categoryCode", required: true },
  { header: "label", required: true },
  { header: "payee", required: true },
  { header: "periodMonth", required: true },
  { header: "periodYear", required: true },
  { header: "amount", required: true },
  { header: "currency", required: false },
  { header: "dueDate", required: false },
  { header: "paidAt", required: false },
  { header: "paymentRef", required: false },
  { header: "notes", required: false },
]

const CURRENCIES = ["BDT", "USD"] as const
type ImportCurrency = (typeof CURRENCIES)[number]

interface CostImportRow {
  rowNumber: number
  categoryId: string
  label: string
  payee: string
  periodMonth: number
  periodYear: number
  amount: number
  currency?: ImportCurrency
  dueDate?: string
  paidAt?: string
  paymentRef?: string
  notes?: string
}

interface ImportContext {
  categoriesByCode: Map<string, { id: string }>
}

async function loadImportContext(): Promise<ImportContext> {
  const categories = await prisma.costCategory.findMany()
  return {
    categoriesByCode: new Map(categories.map((c) => [c.code.toUpperCase(), c])),
  }
}

/** Strict YYYY-MM-DD, matching every other date column in this codebase. */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime())
}

function makeValidateRow(ctx: ImportContext) {
  return (
    row: ParsedRow
  ): { ok: true; value: CostImportRow } | { ok: false; issues: RowIssue[] } => {
    const issues: RowIssue[] = []
    const cell = (key: string) => (row.values[key] ?? "").trim()
    const flag = (column: string, message: string) =>
      issues.push({ rowNumber: row.rowNumber, column, message })

    const categoryCodeRaw = cell("categorycode")
    const category = ctx.categoriesByCode.get(categoryCodeRaw.toUpperCase())
    if (!category) {
      flag("categoryCode", `Unknown category code "${categoryCodeRaw}"`)
    }

    const label = cell("label")
    const payee = cell("payee")

    let periodMonth: number | undefined
    const periodMonthRaw = cell("periodmonth")
    const monthN = Number(periodMonthRaw)
    if (!Number.isInteger(monthN) || monthN < 1 || monthN > 12) {
      flag("periodMonth", "periodMonth must be an integer between 1 and 12")
    } else {
      periodMonth = monthN
    }

    // Same bound as the manual-entry schema (cost.validators.ts): not more
    // than one year ahead of the current year, evaluated per-row rather than
    // at module load so a long-running server does not go stale across a
    // year boundary.
    let periodYear: number | undefined
    const periodYearRaw = cell("periodyear")
    const yearN = Number(periodYearRaw)
    const maxYear = new Date().getUTCFullYear() + 1
    if (!Number.isInteger(yearN) || yearN < 2000) {
      flag("periodYear", "periodYear must be an integer no earlier than 2000")
    } else if (yearN > maxYear) {
      flag("periodYear", "periodYear cannot be more than one year ahead of the current year")
    } else {
      periodYear = yearN
    }

    let amount: number | undefined
    const amountRaw = cell("amount")
    const amountN = Number(amountRaw)
    if (!Number.isFinite(amountN) || amountN < 0) {
      flag("amount", "amount must be a non-negative number")
    } else {
      amount = amountN
    }

    let currency: ImportCurrency | undefined
    const currencyRaw = cell("currency").toUpperCase()
    if (currencyRaw) {
      if (!(CURRENCIES as readonly string[]).includes(currencyRaw)) {
        flag("currency", `Unknown currency "${currencyRaw}"`)
      } else {
        currency = currencyRaw as ImportCurrency
      }
    }

    let dueDate: string | undefined
    const dueDateRaw = cell("duedate")
    if (dueDateRaw) {
      if (!isValidIsoDate(dueDateRaw)) flag("dueDate", "Expected a YYYY-MM-DD date")
      else dueDate = dueDateRaw
    }

    // Carrying paidAt is what lands this row PAID rather than PENDING.
    let paidAt: string | undefined
    const paidAtRaw = cell("paidat")
    if (paidAtRaw) {
      if (!isValidIsoDate(paidAtRaw)) flag("paidAt", "Expected a YYYY-MM-DD date")
      else paidAt = paidAtRaw
    }

    if (issues.length > 0) return { ok: false, issues }

    return {
      ok: true,
      value: {
        rowNumber: row.rowNumber,
        // Safe: any unresolved category already returned above.
        categoryId: category!.id,
        label,
        payee,
        periodMonth: periodMonth!,
        periodYear: periodYear!,
        amount: amount!,
        currency,
        dueDate,
        paidAt,
        paymentRef: cell("paymentref") || undefined,
        notes: cell("notes") || undefined,
      },
    }
  }
}

function summariseRows(rows: CostImportRow[]): Record<string, number> {
  const paid = rows.filter((r) => r.paidAt).length
  return { costs: rows.length, paid, pending: rows.length - paid }
}

function buildSpec(ctx: ImportContext): ImportSpec<CostImportRow> {
  return {
    columns: COST_IMPORT_COLUMNS,
    validateRow: makeValidateRow(ctx),
    summarise: summariseRows,
  }
}

export async function previewCostImport(
  buffer: Buffer,
  fileName: string
): Promise<ImportPreview<CostImportRow>> {
  const ctx = await loadImportContext()
  return runPreview(buffer, fileName, buildSpec(ctx))
}

/** One transaction for the whole file: every row lands or none do. */
async function writeImport(
  rows: CostImportRow[],
  actor: AccessTokenPayload
): Promise<{ costCount: number; paidCount: number }> {
  return prisma.$transaction(async (tx) => {
    let paidCount = 0

    for (const row of rows) {
      const status = row.paidAt ? "PAID" : "PENDING"
      if (status === "PAID") paidCount += 1

      const cost = await tx.operatingCost.create({
        data: {
          categoryId: row.categoryId,
          // Deliberate: historical data predates the commitment records, so
          // it must not be able to trip the commitment/period unique index.
          commitmentId: null,
          label: row.label,
          payee: row.payee,
          periodMonth: row.periodMonth,
          periodYear: row.periodYear,
          amount: dec(row.amount),
          currency: row.currency ?? "BDT",
          dueDate: row.dueDate ? new Date(`${row.dueDate}T00:00:00.000Z`) : null,
          notes: row.notes ?? null,
          createdBy: actor.sub,
          status,
          paidAt: row.paidAt ? new Date(`${row.paidAt}T00:00:00.000Z`) : null,
          paidBy: row.paidAt ? actor.sub : null,
          paymentRef: row.paymentRef ?? null,
        },
      })

      await writeAudit(tx, {
        entity: "COST",
        entityId: cost.id,
        action: "IMPORT",
        changedBy: actor.sub,
        after: {
          categoryId: row.categoryId,
          label: row.label,
          periodMonth: row.periodMonth,
          periodYear: row.periodYear,
          status,
        },
      })
    }

    return { costCount: rows.length, paidCount }
  })
}

export async function commitCostImport(
  buffer: Buffer,
  fileName: string,
  actor: AccessTokenPayload
): Promise<{ costCount: number; paidCount: number }> {
  const ctx = await loadImportContext()
  return runCommit(buffer, fileName, buildSpec(ctx), (rows) => writeImport(rows, actor))
}
