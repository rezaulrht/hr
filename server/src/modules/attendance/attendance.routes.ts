import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { Role } from "../../generated/prisma/client"
import {
  getEmployeeAttendanceHandler,
  getMyAttendanceHandler,
  getTodayHandler,
} from "./attendance.controller"

const router = Router()

/** Roles with an Employee profile — the only ones who can hold attendance. */
export const STAFF_ROLES = [Role.EMPLOYEE, Role.REPORTING_MANAGER] as const

/** Roles that can decide on an attendance record. */
export const APPROVER_ROLES = [
  Role.REPORTING_MANAGER,
  Role.HR_ADMIN,
  Role.SUPER_ADMIN,
] as const

/** Roles that can correct a record or manage the holiday calendar. */
export const HR_ROLES = [Role.HR_ADMIN, Role.SUPER_ADMIN] as const

router.get("/today", requireAuth, requireRole(...STAFF_ROLES), getTodayHandler)
router.get("/me", requireAuth, requireRole(...STAFF_ROLES), getMyAttendanceHandler)

// A separate /me path rather than a "me" sentinel in a slot that otherwise
// holds a UUID — the same choice as /api/leave/balances/me.
//
// Only requireAuth here: visibility is scoped inside the service, because
// the rule differs per role rather than per route.
router.get("/history/:employeeId", requireAuth, getEmployeeAttendanceHandler)

export default router
