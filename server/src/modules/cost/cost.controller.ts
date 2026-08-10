/**
 * Thin handlers: parse with the Zod schema, call the service, `next(err)`.
 * No business logic here — that all lives in `cost.service.ts`,
 * `cost.summary.ts`, `cost.media.ts` and `cost.import.ts`. Follows
 * `asset.controller.ts`.
 */

import type { NextFunction, Request, Response } from "express"

import { AppError } from "../../middleware/errorHandler"
import { monthlySummary } from "./cost.summary"
import { commitCostImport, previewCostImport } from "./cost.import"
import { deleteReceipt, getReceiptUrl, uploadReceipt } from "./cost.media"
import {
  createCategory,
  createCommitment,
  createCost,
  deleteCategory,
  getCost,
  listCategories,
  listCommitments,
  listCosts,
  payCost,
  updateCategory,
  updateCommitment,
  updateCost,
} from "./cost.service"
import {
  createCommitmentSchema,
  createCostCategorySchema,
  createCostSchema,
  listCommitmentsQuery,
  listCostsQuery,
  payCostSchema,
  summaryQuery,
  updateCommitmentSchema,
  updateCostCategorySchema,
  updateCostSchema,
} from "./cost.validators"

type RequestWithId = Request<{ id: string }>

/** multer puts the parsed file here, matching asset.controller.ts's requireFile. */
function requireFile(req: Request): Express.Multer.File {
  if (!req.file) throw new AppError(400, "No file was uploaded")
  return req.file
}

// ── Categories ──────────────────────────────────────────────────────────

export async function listCategoriesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await listCategories())
  } catch (err) {
    next(err)
  }
}

export async function createCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createCostCategorySchema.parse(req.body)
    res.status(201).json(await createCategory(body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function updateCategoryHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = updateCostCategorySchema.parse(req.body)
    res.json(await updateCategory(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function deleteCategoryHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    await deleteCategory(req.params.id, req.user!)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ── Commitments ─────────────────────────────────────────────────────────

export async function listCommitmentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listCommitmentsQuery.parse(req.query)
    res.json(await listCommitments(query))
  } catch (err) {
    next(err)
  }
}

export async function createCommitmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createCommitmentSchema.parse(req.body)
    res.status(201).json(await createCommitment(body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function updateCommitmentHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = updateCommitmentSchema.parse(req.body)
    res.json(await updateCommitment(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

// ── Summary ─────────────────────────────────────────────────────────────

export async function summaryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = summaryQuery.parse(req.query)
    res.json(await monthlySummary(query.year, query.month))
  } catch (err) {
    next(err)
  }
}

// ── Import ──────────────────────────────────────────────────────────────

export async function importPreviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const file = requireFile(req)
    res.json(await previewCostImport(file.buffer, file.originalname))
  } catch (err) {
    next(err)
  }
}

export async function importCommitHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const file = requireFile(req)
    res.status(201).json(await commitCostImport(file.buffer, file.originalname, req.user!))
  } catch (err) {
    next(err)
  }
}

// ── Receipts ────────────────────────────────────────────────────────────

export async function uploadReceiptHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const file = requireFile(req)
    res.status(201).json(await uploadReceipt(req.params.id, file, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function getReceiptUrlHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    res.json(await getReceiptUrl(req.params.id))
  } catch (err) {
    next(err)
  }
}

export async function deleteReceiptHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    await deleteReceipt(req.params.id, req.user!)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ── Bills ───────────────────────────────────────────────────────────────

export async function listCostsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listCostsQuery.parse(req.query)
    res.json(await listCosts(query))
  } catch (err) {
    next(err)
  }
}

export async function createCostHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createCostSchema.parse(req.body)
    res.status(201).json(await createCost(body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function getCostHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    res.json(await getCost(req.params.id))
  } catch (err) {
    next(err)
  }
}

export async function updateCostHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = updateCostSchema.parse(req.body)
    res.json(await updateCost(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function payCostHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = payCostSchema.parse(req.body)
    res.json(await payCost(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}
