"use client"

import { useEffect, useRef, useState } from "react"

/**
 * A clock that ticks from the *server's* time, not the browser's.
 *
 * A laptop three minutes fast otherwise shows "09:14 — you're on time", the
 * employee taps check in, the server records 09:17 and flags them late. They
 * then dispute a flag the UI told them they would not get, and nothing in
 * the logs explains it.
 *
 * The offset is recomputed whenever `serverTime` changes — `/today` refetches
 * on window focus — so it cannot drift in a tab left open all day.
 */
export function useServerClock(serverTime: string | undefined): Date {
  const offsetRef = useRef(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!serverTime) return
    offsetRef.current = new Date(serverTime).getTime() - Date.now()
    setNow(new Date(Date.now() + offsetRef.current))
  }, [serverTime])

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date(Date.now() + offsetRef.current))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return now
}

/**
 * The office-local calendar date the corrected clock is currently in.
 *
 * Someone who leaves the dashboard open overnight would otherwise still be
 * offered a check-out for yesterday at 00:01. Callers refetch when this
 * changes rather than trusting their mounted state.
 */
export function useOfficeDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`
}
