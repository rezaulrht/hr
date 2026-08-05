/**
 * Shared shapes for the bulk importers.
 *
 * Domain-agnostic on purpose: three consumers are already known — the asset
 * register, operating costs and historical expenses — and writing the
 * machinery three times guarantees the three drift.
 */

/** One declared column in an import file. */
export interface ColumnSpec {
  /** Header name, matched case-insensitively on the trimmed cell text. */
  header: string
  required: boolean
  /**
   * When true, two rows in the *same file* sharing a non-empty value is an
   * error. Checking only against the database misses the common case: a file
   * that contradicts itself.
   */
  uniqueInFile?: boolean
}

/** One problem with one cell. `column` is null for whole-row problems. */
export interface RowIssue {
  /** 1-based spreadsheet row number, counting the header as row 1. */
  rowNumber: number
  column: string | null
  message: string
}

/** What `preview` returns. Nothing here has been written to the database. */
export interface ImportPreview<T> {
  /** Rows that parsed and validated, in file order. */
  rows: T[]
  issues: RowIssue[]
  /** Free-form counts the UI shows before the user commits. */
  summary: Record<string, number>
}

export interface ParsedRow {
  rowNumber: number
  /** Keyed by the lower-cased trimmed header. Missing cells are "". */
  values: Record<string, string>
}
