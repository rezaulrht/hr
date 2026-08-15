import type { NextFunction, Request, Response } from "express"

import { depreciationPreflight } from "./depreciation.preflight"
import { deleteRun, draftRun, getRun, listRuns, postRun, reverseRun } from "./depreciation.service"
import {
  draftRunSchema,
  preflightQuerySchema,
  reverseRunSchema,
  runQuerySchema,
} from "./depreciation.validators"

type RequestWithId = Request<{ id: string }>

export async function draftRunHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = draftRunSchema.parse(req.body)
    res.status(201).json(await draftRun(body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function listRunsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = runQuerySchema.parse(req.query)
    res.json(await listRuns(query))
  } catch (err) {
    next(err)
  }
}

export async function getRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    res.json(await getRun(req.params.id))
  } catch (err) {
    next(err)
  }
}

export async function postRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    res.json(await postRun(req.params.id, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function reverseRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = reverseRunSchema.parse(req.body)
    res.json(await reverseRun(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function deleteRunHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    await deleteRun(req.params.id, req.user!)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export async function depreciationPreflightHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = preflightQuerySchema.parse(req.query)
    res.json(await depreciationPreflight(query))
  } catch (err) {
    next(err)
  }
}
