import { Router } from "express"

import { requireAuth } from "../../middleware/requireAuth"
import { listEventsHandler } from "./event.controller"

const router = Router()

// No `requireRole`, on purpose. Every role reads the same endpoint and sees a
// different feed, because scoping is `visibleToFilter` — which is not a
// parameter that can be omitted. A role gate here would imply the filter is
// optional for whoever passes it.
router.get("/", requireAuth, listEventsHandler)

export default router
