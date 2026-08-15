import { apiFetch } from "./client"
import type {
  DepreciationPreflight,
  DepreciationRunDetail,
  DepreciationRunStatus,
  DepreciationRunSummary,
} from "./types"

export function listDepreciationRuns(
  accessToken: string,
  query: { year?: number; status?: DepreciationRunStatus } = {}
): Promise<DepreciationRunSummary[]> {
  const params = new URLSearchParams()
  if (query.year) params.set("year", String(query.year))
  if (query.status) params.set("status", query.status)
  const qs = params.toString()
  return apiFetch<DepreciationRunSummary[]>(`/api/depreciation${qs ? `?${qs}` : ""}`, { accessToken })
}

export function getDepreciationRun(accessToken: string, id: string): Promise<DepreciationRunDetail> {
  return apiFetch<DepreciationRunDetail>(`/api/depreciation/${id}`, { accessToken })
}

export function draftDepreciationRun(
  accessToken: string,
  input: { year: number; month: number }
): Promise<DepreciationRunDetail> {
  return apiFetch<DepreciationRunDetail>("/api/depreciation", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function postDepreciationRun(accessToken: string, id: string): Promise<DepreciationRunDetail> {
  return apiFetch<DepreciationRunDetail>(`/api/depreciation/${id}/post`, {
    method: "POST",
    accessToken,
  })
}

export function reverseDepreciationRun(
  accessToken: string,
  id: string,
  reason: string
): Promise<DepreciationRunDetail> {
  return apiFetch<DepreciationRunDetail>(`/api/depreciation/${id}/reverse`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({ reason }),
  })
}

export function deleteDepreciationRun(accessToken: string, id: string): Promise<void> {
  return apiFetch<void>(`/api/depreciation/${id}`, { method: "DELETE", accessToken })
}

export function getDepreciationPreflight(
  accessToken: string,
  query: { year: number; month: number }
): Promise<DepreciationPreflight> {
  const params = new URLSearchParams({ year: String(query.year), month: String(query.month) })
  return apiFetch<DepreciationPreflight>(`/api/depreciation/preflight?${params.toString()}`, {
    accessToken,
  })
}
