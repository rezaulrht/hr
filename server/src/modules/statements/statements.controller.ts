import type { NextFunction, Request, Response } from "express"

import { buildEquity } from "./statements.equity"
import { buildPnl } from "./statements.pnl"
import { buildPosition } from "./statements.position"
import { rangeQuerySchema } from "./statements.validators"

/**
 * Express 5 still does not forward a rejected promise to the error
 * middleware, so every handler is wrapped. Without this the guard's 409
 * hangs the request instead of reaching the client.
 */
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

export const profitOrLossHandler = wrap(async (req, res) => {
  res.json(await buildPnl(rangeQuerySchema.parse(req.query)))
})

export const financialPositionHandler = wrap(async (req, res) => {
  res.json(await buildPosition(rangeQuerySchema.parse(req.query)))
})

export const changesInEquityHandler = wrap(async (req, res) => {
  res.json(await buildEquity(rangeQuerySchema.parse(req.query)))
})
