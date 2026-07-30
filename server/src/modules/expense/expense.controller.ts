import type { NextFunction, Request, Response } from "express"

import {
  approveClaim,
  createClaim,
  getClaim,
  getMyClaims,
  listClaims,
  rejectClaim,
} from "./expense.service"
import {
  approveClaimBody,
  claimQuery,
  createClaimBody,
  rejectClaimBody,
} from "./expense.validators"

type RequestWithId = Request<{ id: string }>

export async function createClaimHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createClaimBody.parse(req.body)
    return res.status(201).json(await createClaim(req.user!, body))
  } catch (err) {
    return next(err)
  }
}

export async function getMyClaimsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getMyClaims(req.user!))
  } catch (err) {
    return next(err)
  }
}

export async function listClaimsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listClaims(claimQuery.parse(req.query)))
  } catch (err) {
    return next(err)
  }
}

export async function getClaimHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await getClaim(req.user!, req.params.id))
  } catch (err) {
    return next(err)
  }
}

export async function approveClaimHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = approveClaimBody.parse(req.body ?? {})
    return res.status(200).json(await approveClaim(req.params.id, req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}

export async function rejectClaimHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = rejectClaimBody.parse(req.body)
    return res.status(200).json(await rejectClaim(req.params.id, req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}
