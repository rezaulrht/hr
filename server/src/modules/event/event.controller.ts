import type { NextFunction, Request, Response } from "express"

import { listEvents, listOwnActions } from "./event.service"
import { eventQuery } from "./event.validators"

export async function listEventsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listEvents(req.user!, eventQuery.parse(req.query)))
  } catch (err) {
    return next(err)
  }
}

/**
 * The caller's own actions. There is no id in the path and there must never
 * be one — the subject is the token, so this cannot be aimed at anybody else.
 */
export async function listOwnActionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listOwnActions(req.user!, eventQuery.parse(req.query)))
  } catch (err) {
    return next(err)
  }
}
