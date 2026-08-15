import { Router } from "express"
import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { createRuleHandler, deleteRuleHandler, listRulesHandler, unresolvedHandler, updateRuleHandler } from "./posting.controller"
const router = Router(); const ACCESS = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const
router.get("/", requireAuth, requireRole(...ACCESS), listRulesHandler)
router.get("/unresolved", requireAuth, requireRole(...ACCESS), unresolvedHandler)
router.post("/", requireAuth, requireRole(...ACCESS), createRuleHandler)
router.patch("/:id", requireAuth, requireRole(...ACCESS), updateRuleHandler)
router.delete("/:id", requireAuth, requireRole(...ACCESS), deleteRuleHandler)
export default router
