import { apiFetch } from "./client"
import type { CreateStaffAccountInput, CreateStaffAccountResult, Employee } from "./types"

export function listEmployees(accessToken: string): Promise<Employee[]> {
  return apiFetch<Employee[]>("/api/employees", { accessToken })
}

export function createStaffAccount(
  accessToken: string,
  input: CreateStaffAccountInput
): Promise<CreateStaffAccountResult> {
  return apiFetch<CreateStaffAccountResult>("/api/employees/staff", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}
