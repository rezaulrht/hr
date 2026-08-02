import { apiFetch } from "./client"
import type {
  AnnouncementItem,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "./types"

export function listAnnouncements(
  accessToken: string,
  limit?: number
): Promise<AnnouncementItem[]> {
  const qs = limit === undefined ? "" : `?limit=${limit}`
  return apiFetch<AnnouncementItem[]>(`/api/announcements${qs}`, { accessToken })
}

export function getAnnouncement(accessToken: string, id: string): Promise<AnnouncementItem> {
  return apiFetch<AnnouncementItem>(`/api/announcements/${id}`, { accessToken })
}

export function createAnnouncement(
  accessToken: string,
  input: CreateAnnouncementInput
): Promise<AnnouncementItem> {
  return apiFetch<AnnouncementItem>("/api/announcements", {
    method: "POST",
    accessToken,
    // `JSON.stringify` drops `undefined` but keeps an explicit `null`, which
    // is exactly the distinction the server relies on: omitted publishes now,
    // null keeps it a draft.
    body: JSON.stringify(input),
  })
}

export function updateAnnouncement(
  accessToken: string,
  id: string,
  input: UpdateAnnouncementInput
): Promise<AnnouncementItem> {
  return apiFetch<AnnouncementItem>(`/api/announcements/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export async function deleteAnnouncement(accessToken: string, id: string): Promise<void> {
  await apiFetch<void>(`/api/announcements/${id}`, { method: "DELETE", accessToken })
}
