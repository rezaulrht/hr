import type { NextFunction, Request, Response } from "express"

import { createStaffAccount } from "./employee.service"
import { createStaffAccountSchema } from "./employee.validators"

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
