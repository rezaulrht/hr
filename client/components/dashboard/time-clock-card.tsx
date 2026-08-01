"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { TimeClockState } from "@/lib/api/types"

/**
 * The ticking display is **seeded from the server's instant**, never from
 * `new Date()`.
 *
 * Lateness is decided server-side against the shift. A browser clock four
 * minutes fast would show "09:14, you're on time" while the server records
 * 09:17 and flags a late arrival the UI promised would not happen. What ticks
 * locally is the *elapsed* time since the payload arrived, added to the
 * server's own reading.
 */
function useServerClock(serverNow: string): Date {
  // Seeded with the server's own instant, so the first paint — including the
  // server render — is that value exactly, with no hydration mismatch and no
  // clock read during render.
  const [now, setNow] = useState(() => new Date(serverNow))

  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now()
    const tick = () => setNow(new Date(Date.now() + offset))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [serverNow])

  return now
}

const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null

export function TimeClockCard({
  state,
  pending,
  error,
  onCheckIn,
  onCheckOut,
}: {
  state: TimeClockState
  pending: boolean
  error: string | null
  onCheckIn: () => void
  onCheckOut: () => void
}) {
  const now = useServerClock(state.serverNow)
  const checkedInAt = clock(state.checkIn)

  return (
    <div className="flex min-w-70 max-w-90 flex-1 flex-col gap-3.5 rounded-md bg-linear-to-br from-[#17191C] to-[#0E1012] p-5.5 text-white">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-white/75">Time clock</div>
        <span
          className="rounded px-2.5 py-0.5 text-[11px] font-bold"
          style={{ background: state.checkedIn ? "#2FA75C" : "rgba(255,255,255,0.18)" }}
        >
          {state.checkedIn ? "Checked in" : "Checked out"}
        </span>
      </div>

      <div>
        <div className="font-heading text-[32px] font-bold tracking-tight tabular-nums">
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </div>
        <div className="mt-0.5 text-[12.5px] text-white/65">
          {state.detail
            ? state.detail
            : checkedInAt
              ? `Checked in at ${checkedInAt}`
              : "You have not checked in yet"}
        </div>
      </div>

      {error ? <div className="text-[12px] font-semibold text-[#FFB4B4]">{error}</div> : null}

      <Button
        disabled={pending || (!state.canCheckIn && !state.canCheckOut)}
        onClick={state.canCheckOut ? onCheckOut : onCheckIn}
        className="h-auto rounded-md bg-white px-3 py-3 text-sm font-bold text-[#17191C] hover:brightness-[1.06] disabled:opacity-50"
      >
        {pending ? "Saving…" : state.canCheckOut ? "Check out" : "Check in"}
      </Button>

      <div className="flex justify-between border-t border-white/15 pt-3 text-xs text-white/65">
        <span>{state.shift}</span>
        <span>{state.hoursToday === null ? "—" : `${state.hoursToday}h today`}</span>
      </div>
    </div>
  )
}
