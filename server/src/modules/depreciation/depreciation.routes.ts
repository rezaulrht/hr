import { Router } from "express"

import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import {
  deleteRunHandler,
  depreciationPreflightHandler,
  draftRunHandler,
  getRunHandler,
  listRunsHandler,
  postRunHandler,
  reverseRunHandler,
} from "./depreciation.controller"

const router = Router()

// Everything under /api/depreciation is a ledger action — a monthly run posts
// to the ledger. HR reads the book-value report on /api/assets/value; HR does
// not post journals.
const LEDGER_ROLES = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const

// Literal paths before /:id, or Express matches "preflight" as an id.
router.get(
  "/preflight",
  requireAuth,
  requireRole(...LEDGER_ROLES),
  depreciationPreflightHandler
)

router.get("/", requireAuth, requireRole(...LEDGER_ROLES), listRunsHandler)
router.post("/", requireAuth, requireRole(...LEDGER_ROLES), draftRunHandler)
router.get("/:id", requireAuth, requireRole(...LEDGER_ROLES), getRunHandler)
router.post("/:id/post", requireAuth, requireRole(...LEDGER_ROLES), postRunHandler)
router.post("/:id/reverse", requireAuth, requireRole(...LEDGER_ROLES), reverseRunHandler)
router.delete("/:id", requireAuth, requireRole(...LEDGER_ROLES), deleteRunHandler)

export default router
