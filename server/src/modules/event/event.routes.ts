import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { listEventsHandler, listOwnActionsHandler } from "./event.controller"

const router = Router()

// Before "/", which would otherwise never match it.
//
// Scoped by `actorUserId` from the token rather than by audience — a
// different mandatory filter, not a missing one. No `requireRole`: every
// role has its own actions to read.
router.get("/mine", requireAuth, listOwnActionsHandler)

// No `requireRole`, on purpose. Every role reads the same endpoint and sees a
// different feed, because scoping is `visibleToFilter` — which is not a
// parameter that can be omitted. A role gate here would imply the filter is
// optional for whoever passes it.
router.get("/", requireAuth, listEventsHandler)

export default router
