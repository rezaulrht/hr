import type { NextFunction, Request, Response } from "express"

import { AppError } from "../../middleware/errorHandler"
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  listAccountsFlat,
  updateAccount,
} from "./accounting.coa.service"
import { cashOrBankBook, generalLedger, listCashAccounts, trialBalance } from "./accounting.ledger.service"
import { approveJournal, rejectJournal, reverseJournal } from "./accounting.journal.post"
import {
  createJournal,
  deleteJournal,
  getJournal,
  listJournals,
  submitJournal,
  updateJournal,
} from "./accounting.journal.service"
import {
  deleteJournalAttachment,
  getJournalAttachmentUrl,
  listJournalAttachments,
  uploadJournalAttachment,
} from "./accounting.media"
import {
  closePeriod,
  createFinancialYear,
  deleteFinancialYear,
  listFinancialYears,
  listPeriods,
  reopenPeriod,
  updateFinancialYear,
} from "./accounting.period.service"
import {
  createAccountSchema,
  createFinancialYearSchema,
  createJournalSchema,
  journalQuerySchema,
  ledgerQuerySchema,
  rejectJournalSchema,
  reopenPeriodSchema,
  reverseJournalSchema,
  trialBalanceQuerySchema,
  updateAccountSchema,
  updateFinancialYearSchema,
  updateJournalSchema,
} from "./accounting.validators"
import { draftYearEndJournal } from "./accounting.yearend"

/**
 * Express 5 still does not forward a rejected promise to the error
 * middleware, so every handler is wrapped. Without this a thrown AppError
 * hangs the request instead of producing its status.
 */
const wrap =
  <R extends Request>(fn: (req: R, res: Response) => Promise<unknown>) =>
  (req: R, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

// Express 5 types route params as `string | string[]`; these narrow them to
// the shape each handler actually reads, matching cost.controller.ts's
// RequestWithId.
type RequestWithId = Request<{ id: string }>
type RequestWithAttachmentId = Request<{ attachmentId: string }>

function actor(req: Request) {
  if (!req.user) throw new AppError(401, "Authentication required")
  return req.user
}

// ── chart of accounts ──────────────────────────────────────────────

export const listAccountsHandler = wrap(async (req, res) => {
  const flat = req.query.flat === "true"
  const opts = {
    type: req.query.type as never,
    isActive: req.query.isActive === undefined ? undefined : req.query.isActive === "true",
    q: typeof req.query.q === "string" ? req.query.q : undefined,
  }
  res.json(flat ? await listAccountsFlat(opts) : await listAccounts(opts))
})

export const getAccountHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await getAccount(req.params.id))
})

export const createAccountHandler = wrap(async (req, res) => {
  res.status(201).json(await createAccount(createAccountSchema.parse(req.body), actor(req)))
})

export const updateAccountHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await updateAccount(req.params.id, updateAccountSchema.parse(req.body), actor(req)))
})

export const deleteAccountHandler = wrap(async (req: RequestWithId, res) => {
  await deleteAccount(req.params.id, actor(req))
  res.status(204).send()
})

// ── financial years and periods ────────────────────────────────────

export const listFinancialYearsHandler = wrap(async (_req, res) => {
  res.json(await listFinancialYears())
})

export const createFinancialYearHandler = wrap(async (req, res) => {
  res
    .status(201)
    .json(await createFinancialYear(createFinancialYearSchema.parse(req.body), actor(req)))
})

export const updateFinancialYearHandler = wrap(async (req: RequestWithId, res) => {
  res.json(
    await updateFinancialYear(req.params.id, updateFinancialYearSchema.parse(req.body), actor(req))
  )
})

export const deleteFinancialYearHandler = wrap(async (req: RequestWithId, res) => {
  await deleteFinancialYear(req.params.id, actor(req))
  res.status(204).send()
})

export const yearEndHandler = wrap(async (req: RequestWithId, res) => {
  res.status(201).json(await draftYearEndJournal(req.params.id, actor(req)))
})

export const listPeriodsHandler = wrap(async (req, res) => {
  res.json(
    await listPeriods({
      financialYearId:
        typeof req.query.financialYearId === "string" ? req.query.financialYearId : undefined,
      status: req.query.status as never,
    })
  )
})

export const closePeriodHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await closePeriod(req.params.id, actor(req)))
})

export const reopenPeriodHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await reopenPeriod(req.params.id, reopenPeriodSchema.parse(req.body), actor(req)))
})

// ── journals ───────────────────────────────────────────────────────

export const listJournalsHandler = wrap(async (req, res) => {
  res.json(await listJournals(journalQuerySchema.parse(req.query)))
})

export const getJournalHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await getJournal(req.params.id))
})

export const createJournalHandler = wrap(async (req, res) => {
  res.status(201).json(await createJournal(createJournalSchema.parse(req.body), actor(req)))
})

export const updateJournalHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await updateJournal(req.params.id, updateJournalSchema.parse(req.body), actor(req)))
})

export const deleteJournalHandler = wrap(async (req: RequestWithId, res) => {
  await deleteJournal(req.params.id, actor(req))
  res.status(204).send()
})

export const submitJournalHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await submitJournal(req.params.id, actor(req)))
})

export const approveJournalHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await approveJournal(req.params.id, actor(req)))
})

export const rejectJournalHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await rejectJournal(req.params.id, rejectJournalSchema.parse(req.body), actor(req)))
})

export const reverseJournalHandler = wrap(async (req: RequestWithId, res) => {
  res
    .status(201)
    .json(await reverseJournal(req.params.id, reverseJournalSchema.parse(req.body), actor(req)))
})

// ── attachments ────────────────────────────────────────────────────

export const listAttachmentsHandler = wrap(async (req: RequestWithId, res) => {
  res.json(await listJournalAttachments(req.params.id))
})

export const uploadAttachmentHandler = wrap(async (req: RequestWithId, res) => {
  const file = (req as Request & { file?: { buffer: Buffer; originalname: string } }).file
  if (!file) throw new AppError(400, "No file was uploaded")
  res.status(201).json(await uploadJournalAttachment(req.params.id, file, actor(req)))
})

export const getAttachmentUrlHandler = wrap(async (req: RequestWithAttachmentId, res) => {
  res.json(await getJournalAttachmentUrl(req.params.attachmentId))
})

export const deleteAttachmentHandler = wrap(async (req: RequestWithAttachmentId, res) => {
  await deleteJournalAttachment(req.params.attachmentId, actor(req))
  res.status(204).send()
})

// ── read models ────────────────────────────────────────────────────

export const ledgerHandler = wrap(async (req, res) => {
  res.json(await generalLedger(ledgerQuerySchema.parse(req.query)))
})

export const cashBookHandler = wrap(async (req, res) => {
  res.json(await cashOrBankBook("CASH", ledgerQuerySchema.parse(req.query)))
})

export const bankBookHandler = wrap(async (req, res) => {
  res.json(await cashOrBankBook("BANK", ledgerQuerySchema.parse(req.query)))
})

export const cashAccountsHandler = wrap(async (req, res) => {
  const kind = req.query.kind === "CASH" ? "CASH" : "BANK"
  res.json(await listCashAccounts(kind))
})

export const trialBalanceHandler = wrap(async (req, res) => {
  res.json(await trialBalance(trialBalanceQuerySchema.parse(req.query)))
})
