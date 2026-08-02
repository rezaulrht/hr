import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { requireRole } from "../../middleware/requireRole"
import {
  createAnnouncementHandler,
  deleteAnnouncementHandler,
  getAnnouncementHandler,
  listAnnouncementsHandler,
  updateAnnouncementHandler,
} from "./announcement.controller"
import { PUBLISHER_ROLES } from "./announcement.service"

const router = Router()

// `requireRole` gates the *role*; the service gates *which announcement*. A
// manager passes this middleware and still cannot touch another department's
// post, because the department is read from their employee record rather
// than from the body.
router.get("/", requireAuth, listAnnouncementsHandler)
router.get("/:id", requireAuth, getAnnouncementHandler)
router.post("/", requireAuth, requireRole(...PUBLISHER_ROLES), createAnnouncementHandler)
router.patch("/:id", requireAuth, requireRole(...PUBLISHER_ROLES), updateAnnouncementHandler)
router.delete("/:id", requireAuth, requireRole(...PUBLISHER_ROLES), deleteAnnouncementHandler)

export default router
