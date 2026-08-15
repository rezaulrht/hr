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

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const availableKey = React.useMemo(() => helpKeyFor(pathname ?? ""), [pathname])

  const [isOpen, setIsOpen] = React.useState(false)
  const [openKey, setOpenKey] = React.useState<string | null>(null)

  const open = React.useCallback((key?: string) => {
    const target = key ?? availableKey
    if (!target || !(target in HELP)) return
    setOpenKey(target)
    setIsOpen(true)
  }, [availableKey])

  const close = React.useCallback(() => setIsOpen(false), [])

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
