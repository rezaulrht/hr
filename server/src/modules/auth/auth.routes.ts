import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { avatarUpload } from "../media/media.upload"
import {
  changePasswordHandler,
  clearOwnAvatarHandler,
  forgotPasswordHandler,
  listSessionsHandler,
  loginHandler,
  logoutEverywhereHandler,
  logoutHandler,
  refreshHandler,
  resetPasswordHandler,
  revokeSessionHandler,
  setDisplayNameHandler,
  staffLoginHandler,
  uploadOwnAvatarHandler,
} from "./auth.controller"

const router = Router()

router.post("/login", loginHandler)
router.post("/staff-login", staffLoginHandler)
router.post("/refresh", refreshHandler)
router.post("/logout", logoutHandler)
router.post("/logout-all", requireAuth, logoutEverywhereHandler)

// Every role, and no `requireRole`: the subject is the token, so this is
// self-scoped by construction and there is no id that could aim it elsewhere.
router.get("/sessions", requireAuth, listSessionsHandler)
router.delete("/sessions/:sessionId", requireAuth, revokeSessionHandler)

// The account's own name and face, for the three roles that have no employee
// record to carry them. The service refuses a staff caller — for them both
// live on the Employee row and belong to HR.
router.patch("/me", requireAuth, setDisplayNameHandler)
router.patch("/me/avatar", requireAuth, avatarUpload, uploadOwnAvatarHandler)
router.delete("/me/avatar", requireAuth, clearOwnAvatarHandler)
router.post("/forgot-password", forgotPasswordHandler)
router.post("/reset-password", resetPasswordHandler)
router.post("/change-password", requireAuth, changePasswordHandler)

export default router
