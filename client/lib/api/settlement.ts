import { apiFetch } from "./client"
import type { ExitDetailsInput, Settlement, SettlementOverrideInput } from "./types"

export function listSettlements(accessToken: string): Promise<Settlement[]> {
  return apiFetch<Settlement[]>("/api/settlements", { accessToken })
}

export function getSettlement(accessToken: string, employeeId: string): Promise<Settlement> {
  return apiFetch<Settlement>(`/api/settlements/${employeeId}`, { accessToken })
}

export function calculateSettlement(accessToken: string, employeeId: string): Promise<Settlement> {
  return apiFetch<Settlement>(`/api/settlements/${employeeId}/calculate`, {
    method: "POST",
    accessToken,
  })
}

export function overrideSettlement(
  accessToken: string,
  id: string,
  input: SettlementOverrideInput
): Promise<Settlement> {
  return apiFetch<Settlement>(`/api/settlements/id/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function approveSettlement(accessToken: string, id: string): Promise<Settlement> {
  return apiFetch<Settlement>(`/api/settlements/id/${id}/approve`, {
    method: "POST",
    accessToken,
  })
}

export function rejectSettlement(
  accessToken: string,
  id: string,
  note: string
): Promise<Settlement> {
  return apiFetch<Settlement>(`/api/settlements/id/${id}/reject`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({ note }),
  })
}

export function paySettlement(accessToken: string, id: string): Promise<Settlement> {
  return apiFetch<Settlement>(`/api/settlements/id/${id}/pay`, {
    method: "POST",
    accessToken,
  })
}

/** HR records the exit facts a settlement is computed from. */
export function setExitDetails(
  accessToken: string,
  employeeId: string,
  input: ExitDetailsInput
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/api/employees/${employeeId}/exit`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}
