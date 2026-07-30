import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { Role } from "../../generated/prisma/client"
import {
  createStaffAccountHandler,
  listEmployeesHandler,
  setExitDetailsHandler,
} from "./employee.controller"

const router = Router()

router.get("/", requireAuth, requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN), listEmployeesHandler)

router.post(
  "/staff",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN),
  createStaffAccountHandler
)

// HR owns exit details; the enum drives gratuity and notice pay, so this
// is a money decision rather than a filing category.
router.patch(
  "/:id/exit",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN),
  setExitDetailsHandler
)

export default router
