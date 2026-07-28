import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { Role } from "../../generated/prisma/client"
import {
  applyForLeaveHandler,
  getMyBalancesHandler,
  getTeamStatusHandler,
  listLeaveRequestsHandler,
  listLeaveTypesHandler,
} from "./leave.controller"

const router = Router()

/** Roles that hold leave of their own — the only ones with an Employee profile. */
const STAFF_ROLES = [Role.EMPLOYEE, Role.REPORTING_MANAGER] as const

router.get("/types", requireAuth, listLeaveTypesHandler)
router.get("/balances/me", requireAuth, requireRole(...STAFF_ROLES), getMyBalancesHandler)
router.get("/requests", requireAuth, listLeaveRequestsHandler)
router.get("/team-status", requireAuth, requireRole(Role.REPORTING_MANAGER), getTeamStatusHandler)
router.post("/requests", requireAuth, requireRole(...STAFF_ROLES), applyForLeaveHandler)

export default router
