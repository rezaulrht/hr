import { apiFetch } from "./client"
import type { EventPage, EventSeverity } from "./types"

export interface ListEventsQuery {
  limit?: number
  /** The id of the last item on the previous page. */
  cursor?: string
  entity?: string
  entityId?: string
  /** Narrow to one severity: a month of INFO rows otherwise hides the warnings. */
  severity?: EventSeverity
}

/**
 * The activity feed. Scoping is entirely server-side — there is no way to ask
 * for somebody else's events, and an entity id the caller cannot see returns
 * an empty page rather than a 403.
 */
export function listEvents(accessToken: string, query: ListEventsQuery = {}): Promise<EventPage> {
  return apiFetch<EventPage>(`/api/events${toQuery(query)}`, { accessToken })
}

/**
 * What the caller themselves did, newest first.
 *
 * A different endpoint rather than a flag, mirroring the server: this one is
 * scoped by who acted, not by who may see. There is no id in the path and
 * there must never be one — the subject is the token.
 */
export function listMyActions(accessToken: string, query: ListEventsQuery = {}): Promise<EventPage> {
  return apiFetch<EventPage>(`/api/events/mine${toQuery(query)}`, { accessToken })
}

function toQuery(query: ListEventsQuery): string {
  const params = new URLSearchParams()
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  if (query.cursor) params.set("cursor", query.cursor)
  if (query.entity) params.set("entity", query.entity)
  if (query.entityId) params.set("entityId", query.entityId)
  if (query.severity) params.set("severity", query.severity)

  const qs = params.toString()
  return qs ? `?${qs}` : ""
}
