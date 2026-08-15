import { apiFetch } from "./client"
import type { ExpenseCategory, ExpenseClaim, ExpenseClaimInput, ExpenseStatus } from "./types"

export function listExpenseCategories(accessToken: string): Promise<ExpenseCategory[]> {
  return apiFetch<ExpenseCategory[]>("/api/expenses/categories", { accessToken })
}

export function createExpenseClaim(
  accessToken: string,
  input: ExpenseClaimInput
): Promise<ExpenseClaim> {
  return apiFetch<ExpenseClaim>("/api/expenses", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function getMyExpenseClaims(accessToken: string): Promise<ExpenseClaim[]> {
  return apiFetch<ExpenseClaim[]>("/api/expenses/me", { accessToken })
}

export function listExpenseClaims(
  accessToken: string,
  query: { status?: ExpenseStatus; employeeId?: string } = {}
): Promise<ExpenseClaim[]> {
  const params = new URLSearchParams()
  if (query.status) params.set("status", query.status)
  if (query.employeeId) params.set("employeeId", query.employeeId)
  const qs = params.toString()
  return apiFetch<ExpenseClaim[]>(`/api/expenses${qs ? `?${qs}` : ""}`, { accessToken })
}

export function approveExpenseClaim(
  accessToken: string,
  id: string,
  note?: string
): Promise<ExpenseClaim> {
  return apiFetch<ExpenseClaim>(`/api/expenses/${id}/approve`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ note }),
  })
}

export function rejectExpenseClaim(
  accessToken: string,
  id: string,
  note: string
): Promise<ExpenseClaim> {
  return apiFetch<ExpenseClaim>(`/api/expenses/${id}/reject`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ note }),
  })
}
