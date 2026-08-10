import type { NextFunction, Request, Response } from "express"

import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from "./department.service"
import { createDepartmentSchema, updateDepartmentSchema } from "./department.validators"

type RequestWithId = Request<{ id: string }>

export async function listDepartmentsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listDepartments())
  } catch (err) {
    return next(err)
  }
}

export async function createDepartmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createDepartmentSchema.parse(req.body)
    return res.status(201).json(await createDepartment(body, req.user!))
  } catch (err) {
    return next(err)
  }
}

export async function updateDepartmentHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    const body = updateDepartmentSchema.parse(req.body)
    return res.json(await updateDepartment(req.params.id, body, req.user!))
  } catch (err) {
    return next(err)
  }
}

export async function deleteDepartmentHandler(
  req: RequestWithId,
  res: Response,
  next: NextFunction
) {
  try {
    await deleteDepartment(req.params.id, req.user!)
    return res.status(204).send()
  } catch (err) {
    return next(err)
  }
}
