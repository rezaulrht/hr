import { Router } from "express"

import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import {
  createRateHandler,
  createStructureHandler,
  listRatesHandler,
  listStructuresHandler,
  updateRateHandler,
  updateStructureHandler,
} from "./payroll.controller"

const router = Router()

const FINANCE_ROLES = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const
const READ_ROLES = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN, Role.HR_ADMIN] as const

// Open to any authenticated role, not just READ_ROLES: an employee's own
// payslip quotes the rate, and a figure they cannot check is a figure they
// will dispute.
router.get("/exchange-rates", requireAuth, listRatesHandler)
router.post("/exchange-rates", requireAuth, requireRole(...FINANCE_ROLES), createRateHandler)
router.patch("/exchange-rates/:id", requireAuth, requireRole(...FINANCE_ROLES), updateRateHandler)

// Finance owns structures, not HR: HR owns adjustments (Task 10), but a
// salary structure is a treasury fact, not a benefit decision.
router.get("/salary-structures", requireAuth, requireRole(...READ_ROLES), listStructuresHandler)
router.post("/salary-structures", requireAuth, requireRole(...FINANCE_ROLES), createStructureHandler)
router.patch(
  "/salary-structures/:id",
  requireAuth,
  requireRole(...FINANCE_ROLES),
  updateStructureHandler
)

export default router
