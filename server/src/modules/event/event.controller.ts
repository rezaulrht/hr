import type { NextFunction, Request, Response } from "express"

import { listEvents } from "./event.service"
import { eventQuery } from "./event.validators"

export async function listEventsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listEvents(req.user!, eventQuery.parse(req.query)))
  } catch (err) {
    return next(err)
  }
}
