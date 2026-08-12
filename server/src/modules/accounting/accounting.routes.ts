import { Router } from "express"

import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { journalUpload } from "../media/media.upload"
import {
  approveJournalHandler,
  bankBookHandler,
  cashAccountsHandler,
  cashBookHandler,
  closePeriodHandler,
  createAccountHandler,
  createFinancialYearHandler,
  createJournalHandler,
  deleteAccountHandler,
  deleteAttachmentHandler,
  deleteFinancialYearHandler,
  deleteJournalHandler,
  getAccountHandler,
  getAttachmentUrlHandler,
  getJournalHandler,
  ledgerHandler,
  listAccountsHandler,
  listAttachmentsHandler,
  listFinancialYearsHandler,
  listJournalsHandler,
  listPeriodsHandler,
  rejectJournalHandler,
  reopenPeriodHandler,
  reverseJournalHandler,
  submitJournalHandler,
  trialBalanceHandler,
  updateAccountHandler,
  updateFinancialYearHandler,
  updateJournalHandler,
  uploadAttachmentHandler,
  yearEndHandler,
} from "./accounting.controller"

const router = Router()

// Two roles, and only two. HR Admin's read-only payroll access does not
// extend here: seeing one payroll run is not the same as seeing the
// company's whole financial position. Managers and employees get nothing,
// not even GET.
const ACCESS = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const
// Approving, closing and reopening are the controls the whole design rests
// on. A Finance Officer who could approve their own entry would make
// Decision 11 decorative.
const ADMIN = [Role.SUPER_ADMIN] as const

// ── chart of accounts ──
router.get("/accounts", requireAuth, requireRole(...ACCESS), listAccountsHandler)
router.post("/accounts", requireAuth, requireRole(...ACCESS), createAccountHandler)
router.get("/accounts/:id", requireAuth, requireRole(...ACCESS), getAccountHandler)
router.patch("/accounts/:id", requireAuth, requireRole(...ACCESS), updateAccountHandler)
router.delete("/accounts/:id", requireAuth, requireRole(...ACCESS), deleteAccountHandler)

// ── financial years ──
router.get("/financial-years", requireAuth, requireRole(...ACCESS), listFinancialYearsHandler)
router.post("/financial-years", requireAuth, requireRole(...ACCESS), createFinancialYearHandler)
router.patch("/financial-years/:id", requireAuth, requireRole(...ACCESS), updateFinancialYearHandler)
router.delete("/financial-years/:id", requireAuth, requireRole(...ADMIN), deleteFinancialYearHandler)
// Drafting is a Finance action; approving the resulting journal is what
// locks the year, and that is Super Admin (Decision 12).
router.post("/financial-years/:id/year-end", requireAuth, requireRole(...ACCESS), yearEndHandler)

// ── periods ──
router.get("/periods", requireAuth, requireRole(...ACCESS), listPeriodsHandler)
router.post("/periods/:id/close", requireAuth, requireRole(...ADMIN), closePeriodHandler)
router.post("/periods/:id/reopen", requireAuth, requireRole(...ADMIN), reopenPeriodHandler)

// ── read models, before /journals/:id so none of these is read as an id ──
router.get("/ledger", requireAuth, requireRole(...ACCESS), ledgerHandler)
router.get("/cash-book", requireAuth, requireRole(...ACCESS), cashBookHandler)
router.get("/bank-book", requireAuth, requireRole(...ACCESS), bankBookHandler)
router.get("/cash-accounts", requireAuth, requireRole(...ACCESS), cashAccountsHandler)
router.get("/trial-balance", requireAuth, requireRole(...ACCESS), trialBalanceHandler)

// ── journals ──
router.get("/journals", requireAuth, requireRole(...ACCESS), listJournalsHandler)
router.post("/journals", requireAuth, requireRole(...ACCESS), createJournalHandler)
router.get("/journals/:id", requireAuth, requireRole(...ACCESS), getJournalHandler)
router.patch("/journals/:id", requireAuth, requireRole(...ACCESS), updateJournalHandler)
router.delete("/journals/:id", requireAuth, requireRole(...ACCESS), deleteJournalHandler)

router.post("/journals/:id/submit", requireAuth, requireRole(...ACCESS), submitJournalHandler)
router.post("/journals/:id/approve", requireAuth, requireRole(...ADMIN), approveJournalHandler)
router.post("/journals/:id/reject", requireAuth, requireRole(...ADMIN), rejectJournalHandler)
router.post("/journals/:id/reverse", requireAuth, requireRole(...ACCESS), reverseJournalHandler)

// ── attachments ──
// journalUpload is already a complete handler with .single("file") baked in;
// calling .single() on it again throws at request time.
router.get("/journals/:id/attachments", requireAuth, requireRole(...ACCESS), listAttachmentsHandler)
router.post(
  "/journals/:id/attachments",
  requireAuth,
  requireRole(...ACCESS),
  journalUpload,
  uploadAttachmentHandler
)
router.get(
  "/attachments/:attachmentId/url",
  requireAuth,
  requireRole(...ACCESS),
  getAttachmentUrlHandler
)
router.delete(
  "/attachments/:attachmentId",
  requireAuth,
  requireRole(...ACCESS),
  deleteAttachmentHandler
)

export default router
