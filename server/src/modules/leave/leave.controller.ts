import type { NextFunction, Request, Response } from "express"

import { getMyBalances, listLeaveTypes } from "./leave.service"

export async function listLeaveTypesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listLeaveTypes())
  } catch (err) {
    return next(err)
  }
}

export async function getMyBalancesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getMyBalances(req.user!.sub))
  } catch (err) {
    return next(err)
  }
}
