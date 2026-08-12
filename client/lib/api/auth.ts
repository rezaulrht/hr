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

/**
 * Always resolves for a well-formed email, whether or not an account exists.
 * The server will not say which, so neither can the screen: a reset form that
 * answered "no such user" would be a membership oracle for anyone who can
 * reach the login page.
 */
export function forgotPassword(email: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

/**
 * Unauthenticated by design: the token in the link is the credential, which is
 * the whole point of the flow. Succeeding revokes every refresh token the user
 * holds, so the caller must send them back to sign in rather than assume the
 * session it may have had is still good.
 *
 * A 400 here is always about the token (unknown, already used, expired) and
 * carries a message written for the person reading it.
 */
export function resetPassword(token: string, newPassword: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  })
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
