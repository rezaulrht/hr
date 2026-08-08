import type { NextFunction, Request, Response } from "express"

import prisma from "../../config/prisma"
import { Prisma } from "../../generated/prisma/client"
import { AppError } from "../../middleware/errorHandler"
import { revokeAllUserTokens } from "./auth.service"
import { createUserSchema, updateUserStatusSchema } from "./auth.validators"
import { createUser, listUsers } from "./user.service"

export async function listUsersHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return res.status(200).json(await listUsers())
  } catch (err) {
    return next(err)
  }
}

export async function createUserHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  try {
    return res.status(201).json(await createUser(parsed.data))
  } catch (err) {
    return next(err)
  }
}

export async function updateUserStatusHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = updateUserStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" })
  }
  const userId = req.params.id as string
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: parsed.data.isActive },
      select: { id: true, email: true, isActive: true },
    })
    if (!parsed.data.isActive) {
      await revokeAllUserTokens(userId)
    }
    return res.status(200).json(updated)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return next(new AppError(404, "User not found"))
    }
    return next(err)
  }
}
