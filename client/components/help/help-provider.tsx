"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { HELP, helpKeyFor } from "@/lib/help/accounting-help"
import { HelpSheet } from "@/components/help/help-sheet"

interface HelpContextValue {
  /** The key for the current route, or null when it has no entry. */
  availableKey: string | null
  /** Open the current page's entry, or a named one. */
  open: (key?: string) => void
  close: () => void
  isOpen: boolean
  openKey: string | null
}

const HelpContext = React.createContext<HelpContextValue | null>(null)

/** True when the event target is somewhere the `?` key must be typed. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const availableKey = React.useMemo(() => helpKeyFor(pathname ?? ""), [pathname])

  const [isOpen, setIsOpen] = React.useState(false)
  const [openKey, setOpenKey] = React.useState<string | null>(null)

  // The keydown handler reads the latest open state via a ref so the effect
  // does not need `isOpen` in its dependency list (which would re-subscribe on
  // every toggle).
  const isOpenRef = React.useRef(isOpen)
  React.useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  const open = React.useCallback((key?: string) => {
    const target = key ?? availableKey
    if (!target || !(target in HELP)) return
    setOpenKey(target)
    setIsOpen(true)
  }, [availableKey])

  const close = React.useCallback(() => setIsOpen(false), [])

  // `?` opens the panel from the keyboard. It must not fire while the user is
  // typing — otherwise it eats the character in the middle of a narration —
  // nor with a modifier held, nor when the panel is already open.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?") return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (isTypingTarget(event.target)) return
      if (isOpenRef.current) return
      setOpenKey(availableKey)
      setIsOpen(true)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [availableKey])

  // `?help=<key>` opens the panel to that entry on load, then clears the
  // parameter so a refresh does not reopen it and the URL stays clean.
  // A mount-only effect is the right shape for "open once on load" — the
  // initial state is deliberately null/false everywhere so SSR and the first
  // client render agree (reading window during render would mismatch).
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requested = params.get("help")
    if (!requested || !(requested in HELP)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenKey(requested)
    setIsOpen(true)
    params.delete("help")
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
  }, [pathname])

  const value = React.useMemo<HelpContextValue>(
    () => ({ availableKey, open, close, isOpen, openKey }),
    [availableKey, open, close, isOpen, openKey]
  )

  // The panel is rendered once here, above every page, not per page. The
  // trigger lives in the header and opens it through the context.
  return (
    <HelpContext.Provider value={value}>
      {children}
      <HelpSheet />
    </HelpContext.Provider>
  )
}

export function useHelp(): HelpContextValue {
  const ctx = React.useContext(HelpContext)
  if (!ctx) throw new Error("useHelp must be used within a HelpProvider")
  return ctx
}
