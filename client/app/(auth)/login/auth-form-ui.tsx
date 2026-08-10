"use client"

import type { ReactNode } from "react"
import { RiErrorWarningLine, RiLoader4Line, type RemixiconComponentType } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * The sign-in form's furniture, shared by the staff and administrator tabs.
 *
 * The two forms differ only in which credential they take, so anything that
 * lives in both belongs here. Previously they carried duplicate copies of the
 * same long className, which had already drifted: only one of them offered any
 * guidance under the button.
 */

/**
 * One input style, at a size meant to be typed into.
 *
 * The placeholder is #6B7789 rather than the usual near-invisible grey: on the
 * staff tab it carries the employee-code format (BS-EMP-00001), which is the
 * only place that format is stated.
 */
export const AUTH_INPUT =
  "h-11 w-full rounded-lg border-[#DDE3EA] bg-white text-[14px] text-[#17191C] placeholder:text-[#6B7789] focus-visible:border-[#17191C] focus-visible:ring-2 focus-visible:ring-[#17191C]/12"

export function AuthField({
  label,
  htmlFor,
  icon: Icon,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  icon: RemixiconComponentType
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-[#1C2733]">
        {label}
      </Label>
      {/* The icon sits on this wrapper rather than inside the control, because
          PasswordInput owns its own relative box for the reveal toggle.

          `z-10` is required, not decorative. That inner box is positioned and
          comes later in the DOM, so it paints over an earlier sibling: without
          it the password icon is drawn and then covered by the input's own
          white background, which is why only that field appeared to lack one. */}
      <div className="relative">
        <Icon
          className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-[#8792A3]"
          aria-hidden
        />
        {children}
      </div>
      {hint ? <p className="text-[11.5px] leading-relaxed text-[#5F6B7C]">{hint}</p> : null}
    </div>
  )
}

/** Padding that clears the leading icon. Applied alongside AUTH_INPUT. */
export const AUTH_INPUT_WITH_ICON = "pl-10"

/**
 * A failed sign-in, stated the way the rest of the app states refusals.
 *
 * This was a bare red sentence. A wrong password is the single most common
 * thing that happens on this screen, so it gets a shape rather than a line of
 * loose text.
 */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-[#F0D2D2] bg-[#FDF6F6] px-3.5 py-2.5 text-[12.5px] leading-relaxed font-semibold text-[#B03A3A]"
    >
      <RiErrorWarningLine className="mt-px size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

/**
 * The spinner is the one piece of motion on this screen, and it earns its
 * place: sign-in is a network round trip with no other sign that it started.
 */
export function AuthSubmit({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <Button
      type="submit"
      disabled={submitting}
      className={cn(
        "h-11 w-full rounded-lg bg-[#17191C] text-[14px] font-bold text-white",
        "hover:bg-[#0E1012] disabled:opacity-60"
      )}
    >
      {submitting ? (
        <>
          <RiLoader4Line className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Signing in…
        </>
      ) : (
        label
      )}
    </Button>
  )
}
