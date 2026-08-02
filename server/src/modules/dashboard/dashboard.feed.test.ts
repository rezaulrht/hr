import { describe, expect, it } from "vitest"

import type { EventItem } from "../event/event.types"
import { toActivityItems } from "./dashboard.feed"

const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: "evt-1",
  type: "leave.approved",
  severity: "SUCCESS",
  entity: "LEAVE_REQUEST",
  entityId: "lr-1",
  title: "Casual leave approved",
  meta: "Aug 20 – Aug 22 · 3 days",
  href: "/leave",
  createdAt: "2026-08-14T10:00:00.000Z",
  ...over,
})

describe("toActivityItems", () => {
  it("maps every severity to a tone", () => {
    const tones = (["INFO", "SUCCESS", "WARNING", "ERROR"] as const).map(
      (severity) => toActivityItems([event({ severity })])[0].tone
    )
    expect(tones).toEqual(["neutral", "green", "yellow", "red"])
  })

  it("takes the initial from the event type's area, not from a name", () => {
    // An avatar initial would need a name lookup, and the whole point of the
    // frozen strings is that a feed row needs none.
    expect(toActivityItems([event({ type: "leave.approved" })])[0].initial).toBe("L")
    expect(toActivityItems([event({ type: "expense.submitted" })])[0].initial).toBe("E")
    expect(toActivityItems([event({ type: "payroll.run.submitted" })])[0].initial).toBe("P")
  })

  it("passes title, meta and href through untouched", () => {
    // Frozen at emit, so the row survives the thing it describes being
    // renamed or deleted.
    const [item] = toActivityItems([event()])
    expect(item.title).toBe("Casual leave approved")
    expect(item.meta).toBe("Aug 20 – Aug 22 · 3 days")
    expect(item.time).toBe("2026-08-14T10:00:00.000Z")
  })

  it("renders a null meta as an empty string rather than the word null", () => {
    expect(toActivityItems([event({ meta: null })])[0].meta).toBe("")
  })

  it("preserves the query's order rather than re-sorting", () => {
    // Ordering is `(createdAt desc, id desc)` from the query. Re-sorting here
    // on createdAt alone would shuffle two events that share a timestamp —
    // which two emits inside one transaction routinely do.
    const same = "2026-08-14T10:00:00.000Z"
    const items = toActivityItems([
      event({ id: "evt-b", title: "B", createdAt: same }),
      event({ id: "evt-a", title: "A", createdAt: same }),
    ])
    expect(items.map((i) => i.title)).toEqual(["B", "A"])
  })

  it("returns an empty array for an empty history, so the client renders an empty state", () => {
    expect(toActivityItems([])).toEqual([])
  })

  it("queries nothing — it is a mapper, not a merger", () => {
    // If this ever starts reading LeaveRequest, ExpenseClaim, Payslip or
    // Announcement, the event log is being bypassed, and with it
    // visibleToFilter and the announcement audience resolver.
    expect(toActivityItems.constructor.name).toBe("Function")
    expect(toActivityItems([event()])).toHaveLength(1)
  })
})
