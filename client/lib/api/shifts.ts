import { apiFetch } from "./client"

export interface ShiftOption {
  id: string
  name: string
  startTime: string
  endTime: string
}

export function listShifts(accessToken: string): Promise<ShiftOption[]> {
  return apiFetch<ShiftOption[]>("/api/attendance/shifts", { accessToken })
}
