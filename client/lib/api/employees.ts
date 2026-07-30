import { apiFetch } from "./client"
import type { CreateStaffAccountInput, CreateStaffAccountResult, Employee } from "./types"

export function listEmployees(accessToken: string): Promise<Employee[]> {
  return apiFetch<Employee[]>("/api/employees", { accessToken })
}

/**
 * HR puts an employee on a band Finance authored. `null` un-assigns, and is
 * sent explicitly — an omitted key is a 400, not a silent un-assign.
 */
export function setSalaryStructure(
  accessToken: string,
  employeeId: string,
  salaryStructureId: string | null
): Promise<Employee> {
  return apiFetch<Employee>(`/api/employees/${employeeId}/salary-structure`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ salaryStructureId }),
  })
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
