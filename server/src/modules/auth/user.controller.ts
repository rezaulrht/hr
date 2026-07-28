import type { NextFunction, Request, Response } from "express"

import prisma from "../../config/prisma"
import { updateUserStatusSchema } from "./auth.validators"

export async function updateUserStatusHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = updateUserStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
      select: { id: true, email: true, isActive: true },
    })
    return res.status(200).json(updated)
  } catch (err) {
    return next(err)
  }
}
