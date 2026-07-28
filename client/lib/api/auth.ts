import { apiFetch } from "./client"
import type { LoginResponse, PublicUser } from "./types"

export function loginAdmin(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export function loginStaff(employeeId: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/auth/staff-login", {
    method: "POST",
    body: JSON.stringify({ employeeId, password }),
  })
}

export function refreshSession(): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/auth/refresh", { method: "POST" })
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/auth/logout", { method: "POST" })
}

export function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string
): Promise<{ accessToken: string; user: PublicUser }> {
  return apiFetch("/api/auth/change-password", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}
