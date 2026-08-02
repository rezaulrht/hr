import { apiFetch } from "./client"
import type { DashboardPayload } from "./types"

/**
 * One endpoint for all five roles. There is no `role` parameter and there
 * must never be one — the server shapes the payload from the JWT, and a
 * parameter here would imply the client gets a say.
 */
export function getDashboard(accessToken: string): Promise<DashboardPayload> {
  return apiFetch<DashboardPayload>("/api/dashboard", { accessToken })
}
