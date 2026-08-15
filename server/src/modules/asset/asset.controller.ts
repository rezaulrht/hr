import type { NextFunction, Request, Response } from "express"

import type { AssetAttachmentKind } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { capitaliseAsset, disposeAsset, payForAsset } from "./asset.capitalise"
import {
  acknowledgeAssignment,
  assignAsset,
  listUnacknowledged,
  myHoldings,
  returnAsset,
} from "./asset.assignments"
import { commitAssetImport, previewAssetImport } from "./asset.import"
import {
  deleteAttachment,
  getAttachmentUrl,
  uploadAssetAttachment,
  uploadAssignmentAttachment,
} from "./asset.media"
import { listRepairs, receiveFromRepair, sendForRepair } from "./asset.repairs"
import {
  approveRequest,
  cancelRequest,
  fulfilRequest,
  listRequests,
  rejectRequest,
  submitRequest,
} from "./asset.requests"
import {
  createAsset,
  createCategory,
  deleteCategory,
  getAsset,
  listAssets,
  listCategories,
  markAssetLost,
  retireAsset,
  updateAsset,
  updateCategory,
} from "./asset.service"
import { assetValueReport } from "./asset.value"
import { exitChecklistFor } from "./asset.exit"
import {
  createRecovery,
  listRecoveries,
  recoverFromPayroll,
  updateRecovery,
  waiveRecovery,
} from "./asset.recoveries"
import {
  createRecoverySchema,
  recoveryQuerySchema,
  updateRecoverySchema,
  waiveRecoverySchema,
} from "./asset.recoveries.validators"
import { disposeSchema, payAssetSchema, valueReportQuerySchema } from "../depreciation/depreciation.validators"
import {
  approveRequestSchema,
  assignSchema,
  attachmentKindSchema,
  createAssetSchema,
  createCategorySchema,
  fulfilRequestSchema,
  lifecycleSchema,
  listAssetsQuery,
  receiveRepairSchema,
  rejectRequestSchema,
  returnSchema,
  sendRepairSchema,
  submitRequestSchema,
  updateAssetSchema,
  updateCategorySchema,
} from "./asset.validators"

type RequestWithId = Request<{ id: string }>

/** multer puts the parsed file here, matching employee.controller.ts's requireFile. */
function requireFile(req: Request): Express.Multer.File {
  if (!req.file) throw new AppError(400, "No file was uploaded")
  return req.file
}

/** The attachment kind arrives as a multipart TEXT field alongside the file. */
function requireKind(req: Request): AssetAttachmentKind {
  const parsed = attachmentKindSchema.safeParse(req.body?.kind)
  if (!parsed.success) throw new AppError(400, "Choose a valid attachment kind")
  return parsed.data
}

/** Read: parse the query, hand the viewer to the service, let it scope. */
export async function listAssetsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listAssetsQuery.parse(req.query)
    res.json(await listAssets(req.user!, query))
  } catch (err) {
    next(err)
  }
}

/** Write: parse the body, then the service owns every guard. */
export async function createAssetHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createAssetSchema.parse(req.body)
    res.status(201).json(await createAsset(body, req.user!))
  } catch (err) {
    next(err)
  }
}

/** Upload: multer put the file on req.file, and its absence is a 400 here
 *  rather than a TypeError three frames deep in the parser. */
export async function importPreviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file
    if (!file) throw new AppError(400, "No file was uploaded")
    res.json(await previewAssetImport(file.buffer, file.originalname))
  } catch (err) {
    next(err)
  }
}

export async function importCommitHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file
    if (!file) throw new AppError(400, "No file was uploaded")
    res.status(201).json(await commitAssetImport(file.buffer, file.originalname, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function getAssetHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    res.json(await getAsset(req.params.id, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function updateAssetHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = updateAssetSchema.parse(req.body)
    res.json(await updateAsset(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function retireHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = lifecycleSchema.parse(req.body)
    res.json(await retireAsset(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function markLostHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = lifecycleSchema.parse(req.body)
    res.json(await markAssetLost(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function listCategoriesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await listCategories())
  } catch (err) {
    next(err)
  }
}

export async function createCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createCategorySchema.parse(req.body)
    res.status(201).json(await createCategory(body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function updateCategoryHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = updateCategorySchema.parse(req.body)
    res.json(await updateCategory(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function deleteCategoryHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    await deleteCategory(req.params.id, req.user!)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export async function assignHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = assignSchema.parse(req.body)
    res.status(201).json(await assignAsset(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function returnHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = returnSchema.parse(req.body)
    res.json(await returnAsset(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function acknowledgeHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    res.json(await acknowledgeAssignment(req.params.id, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function myHoldingsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await myHoldings(req.user!))
  } catch (err) {
    next(err)
  }
}

export async function listUnacknowledgedHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    res.json(await listUnacknowledged())
  } catch (err) {
    next(err)
  }
}

export async function submitRequestHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = submitRequestSchema.parse(req.body)
    res.status(201).json(await submitRequest(body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function listRequestsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await listRequests(req.user!))
  } catch (err) {
    next(err)
  }
}

// Approve/reject/cancel carry no requireRole in the routes — the approver is
// resolved from the org chart by the service, not from the caller's role.
export async function approveRequestHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = approveRequestSchema.parse(req.body ?? {})
    res.json(await approveRequest(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function rejectRequestHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = rejectRequestSchema.parse(req.body)
    res.json(await rejectRequest(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function cancelRequestHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    res.json(await cancelRequest(req.params.id, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function fulfilRequestHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = fulfilRequestSchema.parse(req.body)
    res.json(await fulfilRequest(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function sendRepairHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = sendRepairSchema.parse(req.body)
    res.status(201).json(
      await sendForRepair(
        req.params.id,
        {
          ...body,
          expectedBack: body.expectedBack
            ? new Date(`${body.expectedBack}T00:00:00.000Z`)
            : undefined,
        },
        req.user!
      )
    )
  } catch (err) {
    next(err)
  }
}

export async function receiveRepairHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = receiveRepairSchema.parse(req.body)
    res.json(await receiveFromRepair(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function listRepairsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const open =
      req.query.open === "true" ? true : req.query.open === "false" ? false : undefined
    res.json(await listRepairs({ open }))
  } catch (err) {
    next(err)
  }
}

export async function uploadAssetAttachmentHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const kind = requireKind(req)
    const file = requireFile(req)
    res.status(201).json(await uploadAssetAttachment(req.params.id, kind, file, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function uploadAssignmentAttachmentHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const kind = requireKind(req)
    const file = requireFile(req)
    res.status(201).json(await uploadAssignmentAttachment(req.params.id, kind, file, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function getAttachmentUrlHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    res.json(await getAttachmentUrl(req.params.id))
  } catch (err) {
    next(err)
  }
}

export async function deleteAttachmentHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    await deleteAttachment(req.params.id, req.user!)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ── the ledger actions ──
// Capitalise, pay and dispose move the balance sheet; the value report reads
// it. All four are asset routes but they exist only because the asset module
// now talks to the ledger.

export async function capitaliseHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await capitaliseAsset(req.params.id, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function payAssetHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = payAssetSchema.parse(req.body)
    res.status(201).json(await payForAsset(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function disposeHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = disposeSchema.parse(req.body)
    res.status(201).json(await disposeAsset(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function assetValueReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = valueReportQuerySchema.parse(req.query)
    res.json(await assetValueReport(query))
  } catch (err) {
    next(err)
  }
}

// ── recoveries ──
// HR creates, corrects and waives; Finance reads. The split mirrors
// payroll.routes.ts, and Decision 3 depends on it — recovery from payroll is
// an act somebody takes, and Finance cannot move money alone.

export async function listRecoveriesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = recoveryQuerySchema.parse(req.query)
    res.json(await listRecoveries(query, req.user))
  } catch (err) {
    next(err)
  }
}

export async function createRecoveryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createRecoverySchema.parse(req.body)
    res.status(201).json(await createRecovery(body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function updateRecoveryHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = updateRecoverySchema.parse(req.body)
    res.json(await updateRecovery(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function waiveRecoveryHandler(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const body = waiveRecoverySchema.parse(req.body)
    res.json(await waiveRecovery(req.params.id, body, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function recoverFromPayrollHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    res.json(await recoverFromPayroll(req.params.id, req.user!))
  } catch (err) {
    next(err)
  }
}

export async function exitChecklistHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const employeeId = req.params.employeeId
    if (typeof employeeId !== "string") {
      throw new AppError(400, "A single employee id is required")
    }
    res.json(await exitChecklistFor(employeeId))
  } catch (err) {
    next(err)
  }
}
