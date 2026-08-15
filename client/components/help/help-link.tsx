"use client"

import { useHelp } from "@/components/help/help-provider"

/**
 * An inline "How does this work?" opener for empty states.
 *
 * Suggestion 3, and the highest-value placement in the whole feature: somebody
 * reading "No journals yet" is at the exact moment of needing the explanation,
 * and the `?` in the top-right corner is nowhere near where they are looking.
 * Opens the same panel as the header trigger, through the same provider.
 */
export function HelpLink({ children }: { children: React.ReactNode }) {
  const { open } = useHelp()

  return (
    <button
      type="button"
      onClick={() => open()}
      className="h-auto p-0 text-[12.5px] font-bold text-[#1C2733] underline decoration-[#B8C1CE] underline-offset-2 hover:text-[#0E1012]"
    >
      {children ?? "How does this work?"}
    </button>
  )
}
