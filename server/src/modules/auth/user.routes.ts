import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { Role } from "../../generated/prisma"
import { updateUserStatusHandler } from "./user.controller"

const router = Router()

router.patch("/:id/status", requireAuth, requireRole(Role.SUPER_ADMIN), updateUserStatusHandler)

export default router
