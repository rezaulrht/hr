import type { NextFunction, Request, Response } from "express"
import { createRule, deleteRule, listRules, unresolvedKeys, updateRule } from "./posting.service"
import { ruleBody, ruleUpdateBody } from "./posting.validators"
export async function listRulesHandler(_req: Request, res: Response, next: NextFunction) { try { res.json(await listRules()) } catch (e) { next(e) } }
export async function unresolvedHandler(_req: Request, res: Response, next: NextFunction) { try { res.json(await unresolvedKeys()) } catch (e) { next(e) } }
export async function createRuleHandler(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await createRule(ruleBody.parse(req.body), req.user!)) } catch (e) { next(e) } }
export async function updateRuleHandler(req: Request<{ id: string }>, res: Response, next: NextFunction) { try { res.json(await updateRule(req.params.id, ruleUpdateBody.parse(req.body), req.user!)) } catch (e) { next(e) } }
export async function deleteRuleHandler(req: Request<{ id: string }>, res: Response, next: NextFunction) { try { await deleteRule(req.params.id, req.user!); res.status(204).send() } catch (e) { next(e) } }
