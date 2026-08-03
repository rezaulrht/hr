import type { NextFunction, Request, Response } from "express"

import {
  getEmployeeAttendance,
  getMyAttendance,
  getToday,
  listShifts,
} from "./attendance.service"
import {
  createHoliday,
  deleteHoliday,
  listHolidays,
  updateHoliday,
} from "./attendance.holidays"
import {
  approveAttendance,
  bulkDecide,
  listApprovals,
  rejectAttendance,
} from "./attendance.approval"
import {
  correctAttendance,
  createManualAttendance,
  getAuditTrail,
  regulariseAttendance,
} from "./attendance.corrections"
import { checkIn, checkOut } from "./attendance.punch"
import { getDailySummary, getMonthlySummary } from "./attendance.summary"
import {
  approvalsQuerySchema,
  approveSchema,
  bulkDecisionSchema,
  correctionSchema,
  dailyQuerySchema,
  dateRangeQuerySchema,
  holidaySchema,
  holidayUpdateSchema,
  manualAttendanceSchema,
  monthQuerySchema,
  regulariseSchema,
  rejectSchema,
  yearQuerySchema,
} from "./attendance.validators"

/**
 * `:employeeId` is a plain named param, so it is always a single string,
 * never a splat array. Express 5 types bare `req.params` as the union.
 */
type RequestWithEmployeeId = Request<{ employeeId: string }>
type RequestWithId = Request<{ id: string }>

export async function listShiftsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listShifts())
  } catch (err) {
    return next(err)
  }
}

export async function getTodayHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getToday(req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function checkInHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // No body is read at all — the server owns the time.
    return res.status(201).json(await checkIn(req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function checkOutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await checkOut(req.user!.sub))
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

export async function regulariseHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = regulariseSchema.parse(req.body)
    return res.status(200).json(await regulariseAttendance(req.user!.sub, req.params.id, body))
  } catch (err) {
    return next(err)
  }
}

export async function correctAttendanceHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = correctionSchema.parse(req.body)
    return res.status(200).json(await correctAttendance(req.user!, req.params.id, body))
  } catch (err) {
    return next(err)
  }
}

export async function createManualAttendanceHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = manualAttendanceSchema.parse(req.body)
    return res.status(201).json(await createManualAttendance(req.user!, body))
  } catch (err) {
    return next(err)
  }
}

export async function getAuditTrailHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getAuditTrail(req.user!, req.params.id))
  } catch (err) {
    return next(err)
  }
}

export async function listApprovalsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, minAgingDays } = approvalsQuerySchema.parse(req.query)
    return res.status(200).json(await listApprovals(req.user!, status, minAgingDays))
  } catch (err) {
    return next(err)
  }
}

export async function approveAttendanceHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const { note } = approveSchema.parse(req.body ?? {})
    return res.status(200).json(await approveAttendance(req.user!, req.params.id, note))
  } catch (err) {
    return next(err)
  }
}

export async function rejectAttendanceHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const { note } = rejectSchema.parse(req.body)
    return res.status(200).json(await rejectAttendance(req.user!, req.params.id, note))
  } catch (err) {
    return next(err)
  }
}

export async function bulkDecideHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { ids, decision, note } = bulkDecisionSchema.parse(req.body)
    // 200 with a per-id result list: one bad id must not void the batch.
    return res.status(200).json(await bulkDecide(req.user!, ids, decision, note))
  } catch (err) {
    return next(err)
  }
}

export async function listHolidaysHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { year } = yearQuerySchema.parse(req.query)
    return res.status(200).json(await listHolidays(year))
  } catch (err) {
    return next(err)
  }
}

export async function createHolidayHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(201).json(await createHoliday(holidaySchema.parse(req.body)))
  } catch (err) {
    return next(err)
  }
}

export async function updateHolidayHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = holidayUpdateSchema.parse(req.body)
    return res.status(200).json(await updateHoliday(req.params.id, body))
  } catch (err) {
    return next(err)
  }
}

export async function deleteHolidayHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    // 200 with the impact block rather than 204: the caller needs to be
    // told how many people's totals just changed.
    return res.status(200).json(await deleteHoliday(req.params.id))
  } catch (err) {
    return next(err)
  }
}
