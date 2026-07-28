import type { NextFunction, Request, Response } from "express"

import {
  applyForLeave,
  getMyBalances,
  getTeamStatus,
  listLeaveRequests,
  listLeaveTypes,
} from "./leave.service"
import { applyLeaveSchema } from "./leave.validators"

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

export async function listLeaveRequestsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listLeaveRequests(req.user!))
  } catch (err) {
    return next(err)
  }
}

export async function getTeamStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getTeamStatus(req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function applyForLeaveHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = applyLeaveSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    return res.status(201).json(await applyForLeave(req.user!.sub, parsed.data))
  } catch (err) {
    return next(err)
  }
}
