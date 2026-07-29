import type { NextFunction, Request, Response } from "express"

import type { Role } from "../generated/prisma/client"
import { AppError } from "./errorHandler"

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Authentication required"))
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "You do not have permission to perform this action"))
    }
    return next()
  }
}
