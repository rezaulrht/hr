import type { NextFunction, Request, Response } from "express"

import { verifyAccessToken } from "../modules/auth/auth.utils"
import { AppError } from "./errorHandler"

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing or malformed Authorization header"))
  }
  const token = header.slice("Bearer ".length)
  try {
    req.user = verifyAccessToken(token)
    return next()
  } catch {
    return next(new AppError(401, "Invalid or expired access token"))
  }
}
