import { apiFetch } from "./client"
import type {
  CostAttachment,
  CostBill,
  CostCategory,
  CostCommitment,
  CostImportCommitResult,
  CostImportPreview,
  CostStatus,
  CostSummary,
  CreateCommitmentInput,
  CreateCostCategoryInput,
  CreateCostInput,
  PayCostInput,
  SignedDocumentUrl,
  UpdateCommitmentInput,
  UpdateCostCategoryInput,
  UpdateCostInput,
} from "./types"

// ── Categories ──────────────────────────────────────────────────────────

export function listCostCategories(accessToken: string): Promise<CostCategory[]> {
  return apiFetch<CostCategory[]>("/api/costs/categories", { accessToken })
}

export function createCostCategory(
  accessToken: string,
  input: CreateCostCategoryInput
): Promise<CostCategory> {
  return apiFetch<CostCategory>("/api/costs/categories", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateCostCategory(
  accessToken: string,
  id: string,
  input: UpdateCostCategoryInput
): Promise<CostCategory> {
  return apiFetch<CostCategory>(`/api/costs/categories/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

// ── Commitments ─────────────────────────────────────────────────────────

export function listCostCommitments(
  accessToken: string,
  query: { active?: boolean } = {}
): Promise<CostCommitment[]> {
  const params = new URLSearchParams()
  if (query.active !== undefined) params.set("active", String(query.active))
  const qs = params.toString()
  return apiFetch<CostCommitment[]>(`/api/costs/commitments${qs ? `?${qs}` : ""}`, { accessToken })
}

export function createCostCommitment(
  accessToken: string,
  input: CreateCommitmentInput
): Promise<CostCommitment> {
  return apiFetch<CostCommitment>("/api/costs/commitments", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateCostCommitment(
  accessToken: string,
  id: string,
  input: UpdateCommitmentInput
): Promise<CostCommitment> {
  return apiFetch<CostCommitment>(`/api/costs/commitments/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

// ── Summary ─────────────────────────────────────────────────────────────

export function getCostSummary(
  accessToken: string,
  year: number,
  month: number
): Promise<CostSummary> {
  return apiFetch<CostSummary>(`/api/costs/summary?year=${year}&month=${month}`, { accessToken })
}

// ── Bills ───────────────────────────────────────────────────────────────

export function listCosts(
  accessToken: string,
  query: { year?: number; month?: number; categoryId?: string; status?: CostStatus } = {}
): Promise<CostBill[]> {
  const params = new URLSearchParams()
  if (query.year !== undefined) params.set("year", String(query.year))
  if (query.month !== undefined) params.set("month", String(query.month))
  if (query.categoryId) params.set("categoryId", query.categoryId)
  if (query.status) params.set("status", query.status)
  const qs = params.toString()
  return apiFetch<CostBill[]>(`/api/costs${qs ? `?${qs}` : ""}`, { accessToken })
}

export function getCost(accessToken: string, id: string): Promise<CostBill> {
  return apiFetch<CostBill>(`/api/costs/${id}`, { accessToken })
}

export function createCost(accessToken: string, input: CreateCostInput): Promise<CostBill> {
  return apiFetch<CostBill>("/api/costs", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateCost(
  accessToken: string,
  id: string,
  input: UpdateCostInput
): Promise<CostBill> {
  return apiFetch<CostBill>(`/api/costs/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function payCost(accessToken: string, id: string, input: PayCostInput): Promise<CostBill> {
  return apiFetch<CostBill>(`/api/costs/${id}/pay`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

// ── Receipts ────────────────────────────────────────────────────────────

export function uploadCostReceipt(
  accessToken: string,
  costId: string,
  file: File
): Promise<CostAttachment> {
  const body = new FormData()
  body.append("file", file)
  // No Content-Type header: apiFetch detects FormData and lets the browser
  // set the multipart boundary itself.
  return apiFetch<CostAttachment>(`/api/costs/${costId}/receipts`, {
    method: "POST",
    accessToken,
    body,
  })
}

/** The URL expires five minutes after this call — never prefetch or cache it. */
export function getCostReceiptUrl(accessToken: string, id: string): Promise<SignedDocumentUrl> {
  return apiFetch<SignedDocumentUrl>(`/api/costs/receipts/${id}/url`, { accessToken })
}

export function deleteCostReceipt(accessToken: string, id: string): Promise<void> {
  return apiFetch<void>(`/api/costs/receipts/${id}`, {
    method: "DELETE",
    accessToken,
  })
}

// ── Import ──────────────────────────────────────────────────────────────

export function previewCostImport(accessToken: string, file: File): Promise<CostImportPreview> {
  const body = new FormData()
  body.append("file", file)
  return apiFetch<CostImportPreview>("/api/costs/import/preview", {
    method: "POST",
    accessToken,
    body,
  })
}

export function commitCostImport(
  accessToken: string,
  file: File
): Promise<CostImportCommitResult> {
  const body = new FormData()
  body.append("file", file)
  return apiFetch<CostImportCommitResult>("/api/costs/import/commit", {
    method: "POST",
    accessToken,
    body,
  })
}

export function deleteCostCategory(accessToken: string, id: string): Promise<void> {
  return apiFetch<void>(`/api/costs/categories/${id}`, { method: "DELETE", accessToken })
}
