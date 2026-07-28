import { apiFetch } from "./client"
import type { Department } from "./types"

export function listDepartments(accessToken: string): Promise<Department[]> {
  return apiFetch<Department[]>("/api/departments", { accessToken })
}
