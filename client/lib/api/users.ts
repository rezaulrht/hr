import { apiFetch } from "./client"
import type { CreateUserInput, CreateUserResult, Role, UserAccount } from "./types"

/** Every endpoint here is SUPER_ADMIN on the server. */
export function listUsers(accessToken: string): Promise<UserAccount[]> {
  return apiFetch<UserAccount[]>("/api/users", { accessToken })
}

export function createUser(
  accessToken: string,
  input: CreateUserInput
): Promise<CreateUserResult> {
  return apiFetch<CreateUserResult>("/api/users", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function setUserRole(
  accessToken: string,
  userId: string,
  role: Role
): Promise<UserAccount> {
  return apiFetch<UserAccount>(`/api/users/${userId}/role`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ role }),
  })
}

/**
 * The soft delete. `false` locks the account out and revokes every session;
 * nothing is dropped. Labelled "Deactivate" in the UI, never "Delete" — the
 * employee detail page already writes this same field under that name.
 */
export function setUserStatus(
  accessToken: string,
  userId: string,
  isActive: boolean
): Promise<UserAccount> {
  return apiFetch<UserAccount>(`/api/users/${userId}/status`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ isActive }),
  })
}
