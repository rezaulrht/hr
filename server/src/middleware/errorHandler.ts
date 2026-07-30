import type { NextFunction, Request, Response } from "express"
import { ZodError } from "zod"

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = "AppError"
  }
}

/**
 * Turns a Zod failure into the first issue, prefixed with the field it came
 * from: `startDate: Expected a YYYY-MM-DD date`.
 *
 * One issue rather than all of them, because the client renders this as a
 * single inline string; the field prefix is what makes it actionable.
 */
function validationMessage(err: ZodError): string {
  const issue = err.issues[0]
  if (!issue) return "Invalid request"
  const field = issue.path.join(".")
  return field ? `${field}: ${issue.message}` : issue.message
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message })
  }
  // Controllers call `schema.parse(...)` and pass the throw to next(), so
  // without this branch every malformed request body or query string
  // surfaced as a 500 — an input mistake reported as a server fault, with
  // the real reason buried in the server log.
  if (err instanceof ZodError) {
    return res.status(400).json({ error: validationMessage(err) })
  }
  console.error(err)
  return res.status(500).json({ error: "Internal server error" })
}
