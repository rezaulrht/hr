import type { NextFunction, Request, Response } from "express"

import { getDashboard } from "./dashboard.service"

// No validators file, and no query parsing. There is no request body and no
// query parameter here — the role comes from the JWT. If a parameter ever
// appears, the design has gone wrong.
export async function getDashboardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getDashboard(req.user!))
  } catch (err) {
    return next(err)
  }
}
