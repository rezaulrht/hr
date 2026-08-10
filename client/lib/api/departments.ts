import { apiFetch } from "./client"
import type { Department, DepartmentInput } from "./types"

export function listDepartments(accessToken: string): Promise<Department[]> {
  return apiFetch<Department[]>("/api/departments", { accessToken })
}

export function createDepartment(
  accessToken: string,
  input: DepartmentInput
): Promise<Department> {
  return apiFetch<Department>("/api/departments", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateDepartment(
  accessToken: string,
  id: string,
  input: DepartmentInput
): Promise<Department> {
  return apiFetch<Department>(`/api/departments/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function deleteDepartment(accessToken: string, id: string): Promise<void> {
  return apiFetch<void>(`/api/departments/${id}`, { method: "DELETE", accessToken })
}
