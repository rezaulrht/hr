"use client"

import * as React from "react"

import type { Lang } from "@/lib/help/types"

const STORAGE_KEY = "help-lang"

interface HelpLangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
}

const HelpLangContext = React.createContext<HelpLangContextValue | null>(null)

/**
 * The chosen language of the help panel, remembered locally.
 *
 * Deliberately not a `User.locale` column (spec Decision 4): the panel is the
 * only surface this applies to, and a per-device reading preference is not an
 * account setting. Deliberately not browser-language detection — a shared
 * finance-desk machine would flip on its own.
 *
 * Hydration-safe: always "en" on the first render, with the stored choice
 * applied in an effect. Reading localStorage during render would make the
 * server and client markup disagree.
 */
export function HelpLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>("en")

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === "bn" || stored === "en") setLangState(stored)
    } catch {
      // Private mode, or storage disabled. English for this session; the
      // toggle still works, it just does not persist.
    }
  }, [])

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }, [])

  const value = React.useMemo(() => ({ lang, setLang }), [lang, setLang])
  return <HelpLangContext value={value}>{children}</HelpLangContext>
}

export function useHelpLang(): HelpLangContextValue {
  const ctx = React.useContext(HelpLangContext)
  if (!ctx) throw new Error("useHelpLang must be used within a HelpLangProvider")
  return ctx
}
