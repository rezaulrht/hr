/**
 * Event rows → feed items.
 *
 * **This is a mapper, not a merger.** If it ever starts querying
 * `LeaveRequest`, `ExpenseClaim`, `Payslip` or `Announcement`, the event log
 * is being bypassed — and with it `visibleToFilter` and the announcement
 * audience resolver, which would be an access-control hole wearing a UI
 * component's clothes.
 *
 * `title`, `meta` and `href` pass through untouched: they were frozen at
 * emit precisely so a feed row survives the thing it describes being renamed
 * or deleted.
 */

import type { EventItem } from "../event/event.types"
import type { ActivityItem, Tone } from "./dashboard.types"

const SEVERITY_TONE: Record<EventItem["severity"], Tone> = {
  INFO: "neutral",
  SUCCESS: "green",
  WARNING: "yellow",
  ERROR: "red",
}

/** `leave.approved` → `L`. The area, not the person: an avatar initial would
 *  need a name lookup, and the whole point is that this needs none. */
const initialFor = (type: string) => (type.split(".")[0][0] ?? "?").toUpperCase()

export function toActivityItems(events: EventItem[]): ActivityItem[] {
  return events.map((e) => ({
    initial: initialFor(e.type),
    tone: SEVERITY_TONE[e.severity],
    title: e.title,
    meta: e.meta ?? "",
    time: e.createdAt,
  }))
}
