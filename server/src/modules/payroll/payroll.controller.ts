import type { NextFunction, Request, Response } from "express"

import {
  approveRun,
  createExchangeRate,
  createRun,
  createSalaryStructure,
  disburseRun,
  getRun,
  getRunPreflight,
  listExchangeRates,
  listRuns,
  listSalaryStructures,
  processRun,
  rejectRun,
  submitRun,
  updateExchangeRate,
  updateSalaryStructure,
} from "./payroll.service"
import {
  createRunBody,
  exchangeRateBody,
  exchangeRateUpdateBody,
  rejectRunBody,
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

export async function listRunsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listRuns())
  } catch (err) {
    return next(err)
  }
}

export async function getRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getRun(req.params.id))
  } catch (err) {
    return next(err)
  }
}

export async function getRunPreflightHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getRunPreflight(req.params.id))
  } catch (err) {
    return next(err)
  }
}

export async function createRunHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createRunBody.parse(req.body)
    return res.status(201).json(await createRun(req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}

export async function processRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await processRun(req.params.id, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function submitRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await submitRun(req.params.id, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function approveRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await approveRun(req.params.id, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}

export async function rejectRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = rejectRunBody.parse(req.body)
    return res.status(200).json(await rejectRun(req.params.id, req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}

export async function disburseRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await disburseRun(req.params.id, req.user!.sub))
  } catch (err) {
    return next(err)
  }
}
