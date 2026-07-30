import type { NextFunction, Request, Response } from "express"

import {
  approveSettlement,
  calculateSettlement,
  getSettlement,
  listSettlements,
  overrideSettlement,
  paySettlement,
  rejectSettlement,
} from "./settlement.service"
import { overrideSettlementBody, settlementRejectBody } from "./settlement.validators"

type RequestWithId = Request<{ id: string }>
type RequestWithEmployeeId = Request<{ employeeId: string }>

export async function listSettlementsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listSettlements())
  } catch (err) {
    return next(err)
  }
}

export async function calculateHandler(
  req: RequestWithEmployeeId,
  res: Response,
  next: NextFunction
) {
  try {
    return res
      .status(200)
      .json(await calculateSettlement(req.params.employeeId, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function getSettlementHandler(
  req: RequestWithEmployeeId,
  res: Response,
  next: NextFunction
) {
  try {
    return res.status(200).json(await getSettlement(req.params.employeeId))
  } catch (err) {
    return next(err)
  }
}

export async function overrideHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = overrideSettlementBody.parse(req.body)
    return res.status(200).json(await overrideSettlement(req.params.id, req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}

export async function approveSettlementHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await approveSettlement(req.params.id, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function rejectSettlementHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = settlementRejectBody.parse(req.body)
    return res.status(200).json(await rejectSettlement(req.params.id, req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}

export async function payHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await paySettlement(req.params.id, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}
