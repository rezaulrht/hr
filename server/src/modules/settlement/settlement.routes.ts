import { Router } from "express"

import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import {
  approveSettlementHandler,
  calculateHandler,
  getSettlementHandler,
  listSettlementsHandler,
  overrideHandler,
  payHandler,
  rejectSettlementHandler,
} from "./settlement.controller"

const router = Router()

const FINANCE_ROLES = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const
const READ_ROLES = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN, Role.HR_ADMIN] as const

// The employee has no route here, following the permission matrix. The
// statement still reaches them: `pay` emails the PDF. A leaver should
// certainly receive their statement, but they no longer have a dashboard to
// read it in.
router.get("/", requireAuth, requireRole(...READ_ROLES), listSettlementsHandler)
router.post(
  "/:employeeId/calculate",
  requireAuth,
  requireRole(...FINANCE_ROLES),
  calculateHandler
)
router.get("/:employeeId", requireAuth, requireRole(...READ_ROLES), getSettlementHandler)

// Same separation of duties as a payroll run: Finance calculates and pays,
// Super Admin approves and cannot be the calculator.
router.patch("/id/:id", requireAuth, requireRole(...FINANCE_ROLES), overrideHandler)
router.post("/id/:id/approve", requireAuth, requireRole(Role.SUPER_ADMIN), approveSettlementHandler)
router.post("/id/:id/reject", requireAuth, requireRole(Role.SUPER_ADMIN), rejectSettlementHandler)
router.post("/id/:id/pay", requireAuth, requireRole(...FINANCE_ROLES), payHandler)

export default router
