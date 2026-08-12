import { z } from "zod"

import { toLedgerDate } from "./accounting.utils"

/**
 * Amounts arrive as strings and stay strings until the service converts them
 * to `Prisma.Decimal`. A JSON number would already have lost precision by
 * the time Zod sees it.
 */
const decimalString = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount with up to two decimal places")

/**
 * Coerced *and truncated*. A date input sends "2026-07-31" and coercion alone
 * gives UTC midnight, so this is invisible from the UI — but the API accepts
 * any parseable value, and one carrying a time of day would fall outside its
 * own period. See `toLedgerDate`.
 */
const dateOnly = z.coerce.date().transform(toLedgerDate)

const trimmed = (min: number, message: string) =>
  z.string().transform((s) => s.trim()).pipe(z.string().min(min, message))

export const accountTypeSchema = z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"])
export const cashKindSchema = z.enum(["NONE", "CASH", "BANK"])

export const createAccountSchema = z.object({
  code: z.string(),
  name: trimmed(1, "Enter an account name"),
  type: accountTypeSchema,
  parentId: z.string().uuid().optional(),
  isGroup: z.boolean().default(false),
  cashKind: cashKindSchema.default("NONE"),
  description: z.string().optional(),
})
export type CreateAccountInput = z.infer<typeof createAccountSchema>

// `code` and `type` are absent on purpose: renumbering is a separate,
// deliberate operation, and retyping an account with posted lines would
// silently move money between statements.
export const updateAccountSchema = z.object({
  name: trimmed(1, "Enter an account name").optional(),
  parentId: z.string().uuid().nullable().optional(),
  isGroup: z.boolean().optional(),
  cashKind: cashKindSchema.optional(),
  isActive: z.boolean().optional(),
  description: z.string().nullable().optional(),
})
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

export const createFinancialYearSchema = z.object({
  startDate: dateOnly,
})
export type CreateFinancialYearInput = z.infer<typeof createFinancialYearSchema>

export const updateFinancialYearSchema = z.object({
  name: trimmed(1, "Enter a name").optional(),
  startDate: dateOnly.optional(),
})
export type UpdateFinancialYearInput = z.infer<typeof updateFinancialYearSchema>

export const reopenPeriodSchema = z.object({
  reason: trimmed(1, "Give a reason for reopening this period"),
})
export type ReopenPeriodInput = z.infer<typeof reopenPeriodSchema>

export const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  debit: decimalString.default("0"),
  credit: decimalString.default("0"),
  narration: z.string().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  sourceCurrency: z.enum(["BDT", "USD"]).nullable().optional(),
  sourceAmount: decimalString.nullable().optional(),
  fxRateToBdt: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,6})?$/, "Enter a rate with up to six decimal places")
    .nullable()
    .optional(),
})
export type JournalLineInput = z.infer<typeof journalLineSchema>

// SYSTEM and CLOSING are absent deliberately: the first is written only by
// postSystemJournal, the second only by the year-end routine. Accepting
// either here would let a hand-typed journal impersonate a generated one.
const creatableType = z.enum(["MANUAL", "OPENING"])

export const createJournalSchema = z.object({
  date: dateOnly,
  type: creatableType.default("MANUAL"),
  narration: trimmed(1, "Enter a narration"),
  reference: z.string().nullable().optional(),
  lines: z.array(journalLineSchema).min(2, "A journal needs at least two lines"),
})
export type CreateJournalInput = z.infer<typeof createJournalSchema>

export const updateJournalSchema = z.object({
  date: dateOnly.optional(),
  narration: trimmed(1, "Enter a narration").optional(),
  reference: z.string().nullable().optional(),
  lines: z.array(journalLineSchema).min(2, "A journal needs at least two lines").optional(),
})
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>

export const rejectJournalSchema = z.object({
  note: trimmed(1, "Say why this is being sent back"),
})
export type RejectJournalInput = z.infer<typeof rejectJournalSchema>

export const reverseJournalSchema = z.object({
  reason: trimmed(1, "Give a reason for the reversal"),
})
export type ReverseJournalInput = z.infer<typeof reverseJournalSchema>

export const journalQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  accountId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "POSTED", "REVERSED"]).optional(),
  type: z.enum(["OPENING", "MANUAL", "SYSTEM", "REVERSAL", "CLOSING"]).optional(),
  sourceModule: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
export type JournalQuery = z.infer<typeof journalQuerySchema>

const range: { message: string; path: PropertyKey[] } = {
  message: "The end date cannot be before the start date",
  path: ["to"],
}

export const ledgerQuerySchema = z
  .object({
    accountId: z.string().uuid(),
    from: dateOnly,
    to: dateOnly,
    departmentId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
  })
  .refine((v) => v.to >= v.from, range)
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>

export const trialBalanceQuerySchema = z
  .object({ from: dateOnly, to: dateOnly })
  .refine((v) => v.to >= v.from, range)
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>
