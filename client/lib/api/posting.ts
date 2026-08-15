import { apiFetch } from "./client"
import type { PostingRule, UnresolvedKey } from "./types"
import { listAccountsFlat } from "./accounting"
export { listAccountsFlat }
export function listPostingRules(token: string) { return apiFetch<PostingRule[]>("/api/posting-rules", { accessToken: token }) }
export function listUnresolvedKeys(token: string) { return apiFetch<UnresolvedKey[]>("/api/posting-rules/unresolved", { accessToken: token }) }
export function updatePostingRule(token: string, id: string, input: { accountId: string; note?: string | null }) { return apiFetch<PostingRule>(`/api/posting-rules/${id}`, { method: "PATCH", accessToken: token, body: JSON.stringify(input) }) }
