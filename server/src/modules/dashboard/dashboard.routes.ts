import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { getDashboardHandler } from "./dashboard.controller"

const router = Router()

// No `requireRole`. One endpoint serves all five roles and shapes itself from
// `req.user.role`; a role gate here would be describing the dispatch twice,
// and the two copies would eventually disagree.
router.get("/", requireAuth, getDashboardHandler)

export default router
