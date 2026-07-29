import type { NextFunction, Request, Response } from "express"

import {
  getEmployeeAttendance,
  getMyAttendance,
  getToday,
} from "./attendance.service"
import { getDailySummary, getMonthlySummary } from "./attendance.summary"
import {
  dailyQuerySchema,
  dateRangeQuerySchema,
  monthQuerySchema,
} from "./attendance.validators"

/**
 * `:employeeId` is a plain named param, so it is always a single string,
 * never a splat array. Express 5 types bare `req.params` as the union.
 */
type RequestWithEmployeeId = Request<{ employeeId: string }>

export async function getTodayHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getToday(req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function getMyAttendanceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = dateRangeQuerySchema.parse(req.query)
    return res.status(200).json(await getMyAttendance(req.user!.sub, from, to))
  } catch (err) {
    return next(err)
  }
}

export async function getEmployeeAttendanceHandler(
  req: RequestWithEmployeeId,
  res: Response,
  next: NextFunction
) {
  try {
    const { from, to } = dateRangeQuerySchema.parse(req.query)
    const days = await getEmployeeAttendance(req.user!, req.params.employeeId, from, to)
    return res.status(200).json(days)
  } catch (err) {
    return next(err)
  }
}

export async function getDailySummaryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { date } = dailyQuerySchema.parse(req.query)
    return res.status(200).json(await getDailySummary(req.user!, date))
  } catch (err) {
    return next(err)
  }
}

export async function getMonthlySummaryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year } = monthQuerySchema.parse(req.query)
    return res.status(200).json(await getMonthlySummary(req.user!, month, year))
  } catch (err) {
    return next(err)
  }
}
