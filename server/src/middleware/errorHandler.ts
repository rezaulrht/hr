import type { NextFunction, Request, Response } from "express"

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = "AppError"
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message })
  }
  console.error(err)
  return res.status(500).json({ error: "Internal server error" })
}
