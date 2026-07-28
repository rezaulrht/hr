import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { Role } from "../../generated/prisma/client"
import { createStaffAccountHandler, listEmployeesHandler } from "./employee.controller"

const router = Router()

router.get("/", requireAuth, requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN), listEmployeesHandler)

router.post(
  "/staff",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN),
  createStaffAccountHandler
)

export default router
