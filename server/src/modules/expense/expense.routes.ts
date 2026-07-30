import { Router } from "express"

import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import {
  approveClaimHandler,
  createClaimHandler,
  getClaimHandler,
  getMyClaimsHandler,
  listClaimsHandler,
  rejectClaimHandler,
} from "./expense.controller"

const router = Router()

/** Roles with an Employee profile, and therefore expenses of their own. */
const STAFF_ROLES = [Role.EMPLOYEE, Role.REPORTING_MANAGER] as const
const FINANCE_ROLES = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const
const READ_ROLES = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN, Role.HR_ADMIN] as const

router.post("/", requireAuth, requireRole(...STAFF_ROLES), createClaimHandler)
// Before /:id, or Express would match "me" as a claim id.
router.get("/me", requireAuth, requireRole(...STAFF_ROLES), getMyClaimsHandler)
router.get("/", requireAuth, requireRole(...READ_ROLES), listClaimsHandler)
router.get("/:id", requireAuth, getClaimHandler)

// REIMBURSED has no route. It is set by a run being disbursed or a
// settlement being paid — a status the system reaches, not one a human
// types. That is the difference between a workflow and a status field.
router.patch("/:id/approve", requireAuth, requireRole(...FINANCE_ROLES), approveClaimHandler)
router.patch("/:id/reject", requireAuth, requireRole(...FINANCE_ROLES), rejectClaimHandler)

export default router
