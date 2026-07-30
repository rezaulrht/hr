import type { NextFunction, Request, Response } from "express"

import { exitDetailsBody } from "../settlement/settlement.validators"
import {
  createStaffAccount,
  listEmployees,
  setExitDetails,
  setSalaryStructure,
} from "./employee.service"
import { createStaffAccountSchema, setSalaryStructureSchema } from "./employee.validators"

export async function createStaffAccountHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = createStaffAccountSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    const result = await createStaffAccount(parsed.data)
    return res.status(201).json(result)
  } catch (err) {
    return next(err)
  }
}

export async function listEmployeesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const employees = await listEmployees()
    return res.status(200).json(employees)
  } catch (err) {
    return next(err)
  }
}

export async function setSalaryStructureHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  const parsed = setSalaryStructureSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    return res.status(200).json(await setSalaryStructure(req.params.id, req.user!.sub, parsed.data))
  } catch (err) {
    return next(err)
  }
}

export async function setExitDetailsHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const body = exitDetailsBody.parse(req.body)
    return res.status(200).json(await setExitDetails(req.params.id, req.user!.sub, body))
  } catch (err) {
    return next(err)
  }
}
