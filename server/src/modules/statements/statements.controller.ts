import type { NextFunction, Request, Response } from "express"

import { loadChart } from "./statements.balances"
import { buildEquity } from "./statements.equity"
import { buildPnl } from "./statements.pnl"
import { buildPosition } from "./statements.position"
import { cashFlowStatement } from "./statements.cashflow"
import { statementNotes } from "./statements.notes"
import { annexureA, assertAnnexureTiesToPosition, positionPpe } from "./statements.annexure"
import { listPolicyNotes, createPolicyNote, updatePolicyNote, deletePolicyNote } from "./statements.policy.service"
import { renderStatementsPdf } from "./statements.pdf"
import { rangeQuerySchema, createPolicyNoteSchema, updatePolicyNoteSchema } from "./statements.validators"

/**
 * Express 5 still does not forward a rejected promise to the error
 * middleware, so every handler is wrapped. Without this the guard's 409
 * hangs the request instead of reaching the client.
 */
const wrap =
  <R extends Request>(fn: (req: R, res: Response) => Promise<unknown>) =>
  (req: R, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

type RequestWithId = Request<{ id: string }>

export const profitOrLossHandler = wrap(async (req, res) => {
  res.json(await buildPnl(rangeQuerySchema.parse(req.query)))
})

export const financialPositionHandler = wrap(async (req, res) => {
  res.json(await buildPosition(rangeQuerySchema.parse(req.query)))
})

export const changesInEquityHandler = wrap(async (req, res) => {
  res.json(await buildEquity(rangeQuerySchema.parse(req.query)))
})

export const cashFlowHandler = wrap(async (req, res) => res.json(await cashFlowStatement(rangeQuerySchema.parse(req.query))))
export const notesHandler = wrap(async (req, res) => res.json(await statementNotes(rangeQuerySchema.parse(req.query))))
export const annexureHandler = wrap(async (req, res) => {
  const range = rangeQuerySchema.parse(req.query)
  const [chart, annexure, position] = await Promise.all([loadChart(), annexureA(range), buildPosition(range)])
  assertAnnexureTiesToPosition(annexure, positionPpe(chart, position))
  res.json(annexure)
})
export const listPolicyNotesHandler = wrap(async (_req, res) => res.json(await listPolicyNotes()))
export const createPolicyNoteHandler = wrap(async (req, res) => res.status(201).json(await createPolicyNote(createPolicyNoteSchema.parse(req.body), req.user!)))
export const updatePolicyNoteHandler = wrap(async (req: RequestWithId, res) => res.json(await updatePolicyNote(req.params.id, updatePolicyNoteSchema.parse(req.body), req.user!)))
export const deletePolicyNoteHandler = wrap(async (req: RequestWithId, res) => { await deletePolicyNote(req.params.id, req.user!); res.status(204).send() })
export const pdfHandler = wrap(async (req, res) => {
  const pdf = await renderStatementsPdf(rangeQuerySchema.parse(req.query))
  res.type("application/pdf").send(pdf)
})
