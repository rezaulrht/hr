import type { NextFunction, Request, Response } from "express"

import { AppError } from "../../middleware/errorHandler"

import {
  applyForLeave,
  approveLeaveRequest,
  cancelLeaveRequest,
  getHalfDayWindow,
  getMyBalances,
  getTeamStatus,
  listLeaveRequests,
  listLeaveTypes,
  rejectLeaveRequest,
  revertLeaveRequest,
} from "./leave.service"
import { applyLeaveSchema, decisionNoteSchema } from "./leave.validators"

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

export async function getHalfDayWindowHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const date = req.query.date
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, "Expected a YYYY-MM-DD `date` query parameter")
    }
    return res.status(200).json(await getHalfDayWindow(req.user!.sub, date))
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

/** `:id` is a plain named param, so it is always a single string, never a splat array. */
type RequestWithId = Request<{ id: string }>

export async function approveLeaveRequestHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    return res.status(200).json(await approveLeaveRequest(req.params.id, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function rejectLeaveRequestHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  const parsed = decisionNoteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "A reason is required to reject a request" })
  }
  try {
    return res
      .status(200)
      .json(await rejectLeaveRequest(req.params.id, req.user!.sub, parsed.data.note))
  } catch (err) {
    return next(err)
  }
}

export async function cancelLeaveRequestHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    return res.status(200).json(await cancelLeaveRequest(req.params.id, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function revertLeaveRequestHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  const parsed = decisionNoteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "A reason is required to revert an approval" })
  }
  try {
    return res
      .status(200)
      .json(await revertLeaveRequest(req.params.id, req.user!.sub, parsed.data.note))
  } catch (err) {
    return next(err)
  }
}
