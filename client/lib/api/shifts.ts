import { apiFetch } from "./client"
import type { Shift, ShiftInput, ShiftUpdateInput, ShiftWriteResult } from "./types"

/**
 * Kept as an alias rather than deleted: the employee create/edit forms import
 * `ShiftOption` and read four of these fields. Widening the type is safe;
 * renaming it at every call site is churn this project does not need.
 */
export type ShiftOption = Shift

export function listShifts(accessToken: string): Promise<Shift[]> {
  return apiFetch<Shift[]>("/api/attendance/shifts", { accessToken })
}

export function createShift(accessToken: string, input: ShiftInput): Promise<Shift> {
  return apiFetch<Shift>("/api/attendance/shifts", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateShift(
  accessToken: string,
  id: string,
  input: ShiftUpdateInput
): Promise<ShiftWriteResult> {
  return apiFetch<ShiftWriteResult>(`/api/attendance/shifts/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function deleteShift(accessToken: string, id: string): Promise<void> {
  return apiFetch<void>(`/api/attendance/shifts/${id}`, { method: "DELETE", accessToken })
}
