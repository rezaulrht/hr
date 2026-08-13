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
import { createExpenseCategory, deleteExpenseCategory, listExpenseCategories, updateExpenseCategory } from "./expense.category.service"

type RequestWithId = Request<{ id: string }>

export async function listExpenseCategoriesHandler(_req: Request, res: Response, next: NextFunction) { try { res.json(await listExpenseCategories()) } catch (err) { next(err) } }
export async function createExpenseCategoryHandler(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await createExpenseCategory(req.body, req.user!)) } catch (err) { next(err) } }
export async function updateExpenseCategoryHandler(req: RequestWithId, res: Response, next: NextFunction) { try { res.json(await updateExpenseCategory(req.params.id, req.body, req.user!)) } catch (err) { next(err) } }
export async function deleteExpenseCategoryHandler(req: RequestWithId, res: Response, next: NextFunction) { try { await deleteExpenseCategory(req.params.id, req.user!); res.status(204).send() } catch (err) { next(err) } }

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
