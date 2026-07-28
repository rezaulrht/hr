import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { listDepartmentsHandler } from "./department.controller"

const router = Router()

router.get("/", requireAuth, listDepartmentsHandler)

export default router
