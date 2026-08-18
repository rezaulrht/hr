import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import {
  changePasswordHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutEverywhereHandler,
  logoutHandler,
  refreshHandler,
  resetPasswordHandler,
  staffLoginHandler,
} from "./auth.controller"

const router = Router()

router.post("/login", loginHandler)
router.post("/staff-login", staffLoginHandler)
router.post("/refresh", refreshHandler)
router.post("/logout", logoutHandler)
router.post("/logout-all", requireAuth, logoutEverywhereHandler)
router.post("/forgot-password", forgotPasswordHandler)
router.post("/reset-password", resetPasswordHandler)
router.post("/change-password", requireAuth, changePasswordHandler)

export default router
