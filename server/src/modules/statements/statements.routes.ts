import { Router } from "express"

import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import {
  changesInEquityHandler,
  financialPositionHandler,
  profitOrLossHandler,
  cashFlowHandler,
  notesHandler,
  annexureHandler,
  listPolicyNotesHandler,
  createPolicyNoteHandler,
  updatePolicyNoteHandler,
  deletePolicyNoteHandler,
} from "./statements.controller"

const router = Router()

// The same two roles as the ledger, for the same reason: a set of accounts
// is the company's whole financial position, and HR Admin's read-only
// payroll access does not extend to it. There are no write routes in this
// module at all.
const ACCESS = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const

router.get("/profit-or-loss", requireAuth, requireRole(...ACCESS), profitOrLossHandler)
router.get("/financial-position", requireAuth, requireRole(...ACCESS), financialPositionHandler)
router.get("/changes-in-equity", requireAuth, requireRole(...ACCESS), changesInEquityHandler)
router.get("/cash-flow", requireAuth, requireRole(...ACCESS), cashFlowHandler)
router.get("/notes", requireAuth, requireRole(...ACCESS), notesHandler)
router.get("/annexure-a", requireAuth, requireRole(...ACCESS), annexureHandler)
router.get("/policy-notes", requireAuth, requireRole(...ACCESS), listPolicyNotesHandler)
router.post("/policy-notes", requireAuth, requireRole(...ACCESS), createPolicyNoteHandler)
router.patch("/policy-notes/:id", requireAuth, requireRole(...ACCESS), updatePolicyNoteHandler)
router.delete("/policy-notes/:id", requireAuth, requireRole(...ACCESS), deletePolicyNoteHandler)

export default router
