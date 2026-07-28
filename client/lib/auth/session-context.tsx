"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

import { logout as apiLogout, refreshSession } from "@/lib/api/auth"
import type { PublicUser } from "@/lib/api/types"

type SessionStatus = "loading" | "authenticated" | "unauthenticated"

interface SessionContextValue {
  user: PublicUser | null
  accessToken: string | null
  status: SessionStatus
  setSession: (accessToken: string, user: PublicUser) => void
  clearSession: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [status, setStatus] = useState<SessionStatus>("loading")

  useEffect(() => {
    let cancelled = false
    refreshSession()
      .then((res) => {
        if (cancelled) return
        setAccessToken(res.accessToken)
        setUser(res.user)
        setStatus("authenticated")
      })
      .catch(() => {
        if (cancelled) return
        setStatus("unauthenticated")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setSession = useCallback((token: string, sessionUser: PublicUser) => {
    setAccessToken(token)
    setUser(sessionUser)
    setStatus("authenticated")
  }, [])

  const clearSession = useCallback(async () => {
    await apiLogout().catch(() => {})
    setAccessToken(null)
    setUser(null)
    setStatus("unauthenticated")
  }, [])

  return (
    <SessionContext.Provider value={{ user, accessToken, status, setSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider")
  }
  return ctx
}
