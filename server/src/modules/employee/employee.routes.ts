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
  getEmployeeHandler,
  getMyProfileHandler,
  listDocumentsHandler,
  listEmployeesHandler,
  setExitDetailsHandler,
  setSalaryStructureHandler,
  uploadAvatarHandler,
  uploadDocumentHandler,
} from "./employee.controller"

const router = Router()

// requireAuth only. Each row is projected at the caller's tier, so this one
// endpoint serves HR's directory, Finance's (fixing the /finance/employees
// 403) and the company-wide colleague directory.
router.get("/", requireAuth, listEmployeesHandler)

// BEFORE "/:id", or Express matches :id = "me".
router.get("/me", requireAuth, getMyProfileHandler)
router.get("/:id", requireAuth, getEmployeeHandler)

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

// No `requireRole`: listing is self-or-HR, so what a caller may do depends on
// the relationship between them and the subject, not on the role alone. No
// multer here, so there is no buffering concern to weigh against that.
router.get("/:id/documents", requireAuth, listDocumentsHandler)

// Unlike the avatar route below, uploading a document is a pure role check
// (`assertHrOnly` in the handler) — not self-or-HR — so the caller's tier is
// known from the JWT alone, with no DB lookup required. That means
// `requireRole` can run BEFORE multer, refusing a non-HR caller before their
// file is ever buffered into memory, rather than after. `assertHrOnly` stays
// in the handler as defence in depth.
router.post(
  "/:id/documents",
  requireAuth,
  requireRole(Role.SUPER_ADMIN, Role.HR_ADMIN),
  documentUpload,
  uploadDocumentHandler
)
router.get("/:id/documents/:docId/url", requireAuth, getDocumentUrlHandler)
router.delete("/:id/documents/:docId", requireAuth, deleteDocumentHandler)

// No `requireRole` here: who may set this avatar depends on the relationship
// between the caller and the subject (self-or-HR), not on role alone, and
// resolving that tier needs a DB lookup that only the handler can do. multer
// must therefore run before the handler regardless of caller, unlike the
// document route above.
router.patch("/:id/avatar", requireAuth, avatarUpload, uploadAvatarHandler)
router.delete("/:id/avatar", requireAuth, clearAvatarHandler)

export default router
