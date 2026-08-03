import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { Role } from "../../generated/prisma/client"
import { avatarUpload, documentUpload } from "../media/media.upload"
import {
  clearAvatarHandler,
  createStaffAccountHandler,
  deleteDocumentHandler,
  getDocumentUrlHandler,
  listDocumentsHandler,
  listEmployeesHandler,
  setExitDetailsHandler,
  setSalaryStructureHandler,
  uploadAvatarHandler,
  uploadDocumentHandler,
} from "./employee.controller"

const router = Router()

router.get("/", requireAuth, requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN), listEmployeesHandler)

router.post(
  "/staff",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN),
  createStaffAccountHandler
)

// Finance authors salary structures (see payroll.routes); HR puts people on
// them. Splitting the two is what stops either role defining a salary and
// paying it on its own.
router.patch(
  "/:id/salary-structure",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN),
  setSalaryStructureHandler
)

// HR owns exit details; the enum drives gratuity and notice pay, so this
// is a money decision rather than a filing category.
router.patch(
  "/:id/exit",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN),
  setExitDetailsHandler
)

// No `requireRole`: what a caller may do depends on the relationship between
// them and the subject, not on the role alone.
//
// Order is `requireAuth` -> multer -> handler. multer must run before the
// handler to populate `req.file`, and Express cannot know the caller's tier
// until requireAuth has run. An unauthorised caller therefore still has their
// file buffered before being refused — the size cap is what bounds that.
router.get("/:id/documents", requireAuth, listDocumentsHandler)
router.post("/:id/documents", requireAuth, documentUpload, uploadDocumentHandler)
router.get("/:id/documents/:docId/url", requireAuth, getDocumentUrlHandler)
router.delete("/:id/documents/:docId", requireAuth, deleteDocumentHandler)
router.patch("/:id/avatar", requireAuth, avatarUpload, uploadAvatarHandler)
router.delete("/:id/avatar", requireAuth, clearAvatarHandler)

export default router
