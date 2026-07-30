import type { NextFunction, Request, Response } from "express"

import {
  createExchangeRate,
  createSalaryStructure,
  listExchangeRates,
  listSalaryStructures,
  updateExchangeRate,
  updateSalaryStructure,
} from "./payroll.service"
import {
  exchangeRateBody,
  exchangeRateUpdateBody,
  salaryStructureBody,
  salaryStructureUpdateBody,
} from "./payroll.validators"

type RequestWithId = Request<{ id: string }>

export async function listRatesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listExchangeRates())
  } catch (err) {
    return next(err)
  }
}

export async function createRateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = exchangeRateBody.parse(req.body)
    return res.status(201).json(await createExchangeRate(req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}

export async function updateRateHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = exchangeRateUpdateBody.parse(req.body)
    return res.status(200).json(await updateExchangeRate(req.params.id, req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}

export async function listStructuresHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listSalaryStructures())
  } catch (err) {
    return next(err)
  }
}

export async function createStructureHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = salaryStructureBody.parse(req.body)
    return res.status(201).json(await createSalaryStructure(req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}

export async function updateStructureHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = salaryStructureUpdateBody.parse(req.body)
    return res.status(200).json(await updateSalaryStructure(req.params.id, req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}
