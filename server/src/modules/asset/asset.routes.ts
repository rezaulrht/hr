import { Router } from "express"

import { Role } from "../../generated/prisma/client"
import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import { assetUpload, spreadsheetUpload } from "../media/media.upload"
import {
  acknowledgeHandler,
  approveRequestHandler,
  assetValueReportHandler,
  assignHandler,
  cancelRequestHandler,
  capitaliseHandler,
  createAssetHandler,
  createCategoryHandler,
  deleteAttachmentHandler,
  deleteCategoryHandler,
  disposeHandler,
  fulfilRequestHandler,
  getAssetHandler,
  getAttachmentUrlHandler,
  importCommitHandler,
  importPreviewHandler,
  listAssetsHandler,
  listCategoriesHandler,
  listRepairsHandler,
  listRequestsHandler,
  listUnacknowledgedHandler,
  markLostHandler,
  myHoldingsHandler,
  payAssetHandler,
  receiveRepairHandler,
  rejectRequestHandler,
  retireHandler,
  returnHandler,
  sendRepairHandler,
  submitRequestHandler,
  updateAssetHandler,
  updateCategoryHandler,
  uploadAssetAttachmentHandler,
  uploadAssignmentAttachmentHandler,
} from "./asset.controller"

const router = Router()

/** Roles with an Employee profile, and therefore holdings of their own. */
const STAFF_ROLES = [Role.EMPLOYEE, Role.REPORTING_MANAGER] as const
const HR_ROLES = [Role.HR_ADMIN, Role.SUPER_ADMIN] as const
/** Finance joins HR for disposal, the one asset action with an accounting
 *  consequence — but not for custody. */
const DISPOSAL_ROLES = [Role.HR_ADMIN, Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const
/** The ledger actions: only people authorised to move the ledger. */
const LEDGER_ROLES = [Role.FINANCE_OFFICER, Role.SUPER_ADMIN] as const

// Literal paths before /:id, or Express matches "me" and "categories" as ids.
router.get("/categories", requireAuth, listCategoriesHandler)
router.post("/categories", requireAuth, requireRole(...HR_ROLES), createCategoryHandler)
router.patch("/categories/:id", requireAuth, requireRole(...HR_ROLES), updateCategoryHandler)
router.delete("/categories/:id", requireAuth, requireRole(...HR_ROLES), deleteCategoryHandler)

// The book-value report is read-only and finance + HR both need it — HR
// prices a lost laptop from it, Finance files it. Nobody below that sees it.
router.get(
  "/value",
  requireAuth,
  requireRole(Role.FINANCE_OFFICER, Role.HR_ADMIN, Role.SUPER_ADMIN),
  assetValueReportHandler
)

// Ledger actions: capitalise (move cost onto the balance sheet), pay (clear
// the payable), dispose (book the gain or loss). Finance and admin only.
router.post("/:id/capitalise", requireAuth, requireRole(...LEDGER_ROLES), capitaliseHandler)
router.post("/:id/pay", requireAuth, requireRole(...LEDGER_ROLES), payAssetHandler)
router.post("/:id/dispose", requireAuth, requireRole(...LEDGER_ROLES), disposeHandler)

router.get("/me", requireAuth, requireRole(...STAFF_ROLES), myHoldingsHandler)
router.get("/unacknowledged", requireAuth, requireRole(...HR_ROLES), listUnacknowledgedHandler)
router.get(
  "/repairs",
  requireAuth,
  requireRole(Role.HR_ADMIN, Role.FINANCE_OFFICER, Role.SUPER_ADMIN),
  listRepairsHandler
)

router.post("/requests", requireAuth, requireRole(...STAFF_ROLES), submitRequestHandler)
router.get("/requests", requireAuth, listRequestsHandler)
router.patch("/requests/:id/approve", requireAuth, approveRequestHandler)
router.patch("/requests/:id/reject", requireAuth, rejectRequestHandler)
router.patch("/requests/:id/cancel", requireAuth, requireRole(...STAFF_ROLES), cancelRequestHandler)
router.post("/requests/:id/fulfil", requireAuth, requireRole(...HR_ROLES), fulfilRequestHandler)

// Approve/reject carry no requireRole: the approver is resolved from the org
// chart, not from a role. A Reporting Manager approving their report and an
// HR_ADMIN overriding are both legitimate, and the 403 lives in the service
// where the reporting line is known.

// spreadsheetUpload, not assetUpload: these carry an .xlsx/.csv register,
// not a photo. assetUpload's document filter rejected every import.
router.post(
  "/import/preview",
  requireAuth,
  requireRole(...HR_ROLES),
  spreadsheetUpload,
  importPreviewHandler
)
router.post(
  "/import/commit",
  requireAuth,
  requireRole(...HR_ROLES),
  spreadsheetUpload,
  importCommitHandler
)

router.post(
  "/assignments/:id/acknowledge",
  requireAuth,
  requireRole(...STAFF_ROLES),
  acknowledgeHandler
)
router.post(
  "/assignments/:id/attachments",
  requireAuth,
  requireRole(...HR_ROLES),
  assetUpload,
  uploadAssignmentAttachmentHandler
)

router.get("/attachments/:id/url", requireAuth, getAttachmentUrlHandler)
router.delete("/attachments/:id", requireAuth, requireRole(...HR_ROLES), deleteAttachmentHandler)

router.get("/", requireAuth, listAssetsHandler)
router.post("/", requireAuth, requireRole(...HR_ROLES), createAssetHandler)
router.get("/:id", requireAuth, getAssetHandler)
router.patch("/:id", requireAuth, requireRole(...HR_ROLES), updateAssetHandler)
router.post("/:id/assign", requireAuth, requireRole(...HR_ROLES), assignHandler)
router.post("/:id/return", requireAuth, requireRole(...HR_ROLES), returnHandler)
router.post("/:id/retire", requireAuth, requireRole(...DISPOSAL_ROLES), retireHandler)
router.post("/:id/mark-lost", requireAuth, requireRole(...HR_ROLES), markLostHandler)
router.post("/:id/repairs", requireAuth, requireRole(...HR_ROLES), sendRepairHandler)
router.post(
  "/:id/attachments",
  requireAuth,
  requireRole(...HR_ROLES),
  assetUpload,
  uploadAssetAttachmentHandler
)

router.patch("/repairs/:id/receive", requireAuth, requireRole(...HR_ROLES), receiveRepairHandler)

export default router
