import { Router } from "express"

import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import {
  createDepartmentHandler,
  deleteDepartmentHandler,
  listDepartmentsHandler,
  updateDepartmentHandler,
} from "./department.controller"

const router = Router()

// HR owns the org chart; Finance and managers read it. The read stays open to
// any authenticated role because every employee form has a department picker.
const WRITE_ROLES = [Role.HR_ADMIN, Role.SUPER_ADMIN] as const

router.get("/", requireAuth, listDepartmentsHandler)
router.post("/", requireAuth, requireRole(...WRITE_ROLES), createDepartmentHandler)
router.patch("/:id", requireAuth, requireRole(...WRITE_ROLES), updateDepartmentHandler)
router.delete("/:id", requireAuth, requireRole(...WRITE_ROLES), deleteDepartmentHandler)

export default router
