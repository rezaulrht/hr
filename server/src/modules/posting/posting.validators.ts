import { z } from "zod"
import { POSTING_EVENTS } from "./posting.types"
export const ruleBody = z.object({ event: z.enum(POSTING_EVENTS as [string, ...string[]]), key: z.string().min(1).max(100), accountId: z.string().uuid(), note: z.string().max(500).nullable().optional() })
export const ruleUpdateBody = ruleBody.pick({ accountId: true, note: true })
