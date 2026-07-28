import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { Role } from "../../generated/prisma/client"
import {
  applyForLeaveHandler,
  approveLeaveRequestHandler,
  cancelLeaveRequestHandler,
  getMyBalancesHandler,
  getTeamStatusHandler,
  listLeaveRequestsHandler,
  listLeaveTypesHandler,
  rejectLeaveRequestHandler,
  revertLeaveRequestHandler,
} from "./leave.controller"

const router = Router()

/** Roles that hold leave of their own — the only ones with an Employee profile. */
const STAFF_ROLES = [Role.EMPLOYEE, Role.REPORTING_MANAGER] as const

/** Roles that decide on leave. Reporting managers are read-only here. */
const REVIEWER_ROLES = [Role.HR_ADMIN, Role.SUPER_ADMIN] as const

router.get("/types", requireAuth, listLeaveTypesHandler)
router.get("/balances/me", requireAuth, requireRole(...STAFF_ROLES), getMyBalancesHandler)
router.get("/requests", requireAuth, listLeaveRequestsHandler)
router.get("/team-status", requireAuth, requireRole(Role.REPORTING_MANAGER), getTeamStatusHandler)
router.post("/requests", requireAuth, requireRole(...STAFF_ROLES), applyForLeaveHandler)

router.patch(
  "/requests/:id/approve",
  requireAuth,
  requireRole(...REVIEWER_ROLES),
  approveLeaveRequestHandler
)
router.patch(
  "/requests/:id/reject",
  requireAuth,
  requireRole(...REVIEWER_ROLES),
  rejectLeaveRequestHandler
)
router.patch(
  "/requests/:id/revert",
  requireAuth,
  requireRole(...REVIEWER_ROLES),
  revertLeaveRequestHandler
)
router.patch("/requests/:id/cancel", requireAuth, requireRole(...STAFF_ROLES), cancelLeaveRequestHandler)

export default router
