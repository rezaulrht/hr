"use client"

import * as React from "react"
import { RiQuestionLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { FLOW, HELP, type FlowStepId } from "@/lib/help/accounting-help"
import { splitOnTerms } from "@/lib/help/glossary"
import { Term } from "@/components/help/term"
import { useHelp } from "@/components/help/help-provider"

/**
 * A panel, not a modal.
 *
 * The reader's question is "what am I looking at", and the answer is worth
 * nothing if it covers up the thing they are asking about. A sheet keeps the
 * page visible beside it, survives being left open while they work, and
 * becomes a full-height surface on a phone without any extra handling.
 *
 * Controlled by the HelpProvider: the trigger in the header opens it, and so
 * do the empty states, the keyboard shortcut and the `?help=` URL — all
 * through the same context, so the open state lives in exactly one place.
 */

/** Renders one string with glossary terms marked. `alreadyMarked` is shared
 *  across every paragraph in the entry, so a term is underlined on its first
 *  use in the whole entry and not again. */
function Marked({
  text,
  alreadyMarked,
}: {
  text: string
  alreadyMarked: Set<string>
}) {
  const parts = splitOnTerms(text, alreadyMarked)
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <React.Fragment key={i}>{part}</React.Fragment>
        ) : (
          <Term key={i} term={part.term} definition={part.definition} />
        )
      )}
    </>
  )
}

function FlowRail({ current }: { current: FlowStepId }) {
  const currentIndex = FLOW.findIndex((s) => s.id === current)

  return (
    <ol className="relative">
      {FLOW.map((step, i) => {
        const isCurrent = step.id === current
        const isPast = i < currentIndex

        return (
          <li key={step.id} className="relative pb-5 pl-7 last:pb-0">
            {/* The rail, drawn per item so the last one does not trail off
                below the final marker. */}
            {i < FLOW.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-4.5 bottom-0 left-[7px] w-px bg-[#E4E9EF]"
              />
            ) : null}

            <span
              aria-hidden
              className={
                isCurrent
                  ? "absolute top-1 left-0 grid size-3.5 place-items-center rounded-full bg-[#17191C] ring-4 ring-white"
                  : isPast
                    ? "absolute top-1 left-0 size-3.5 rounded-full border-2 border-[#B8C1CE] bg-white ring-4 ring-white"
                    : "absolute top-1 left-0 size-3.5 rounded-full border border-[#E4E9EF] bg-white ring-4 ring-white"
              }
            >
              {isCurrent ? <span className="size-1 rounded-full bg-white" /> : null}
            </span>

            <div className="flex items-baseline gap-2">
              <span
                className={
                  isCurrent
                    ? "text-[13px] font-bold text-[#17191C]"
                    : "text-[13px] font-semibold text-[#55657A]"
                }
              >
                {i + 1}. {step.title}
              </span>
              {isCurrent ? (
                <span className="rounded-sm bg-[#17191C] px-1.5 py-px text-[10px] font-bold tracking-wide whitespace-nowrap text-white uppercase">
                  You are here
                </span>
              ) : null}
            </div>

            <p
              className={
                isCurrent
                  ? "mt-1 text-[12.5px] leading-[1.6] text-[#3B4757]"
                  : "mt-1 text-[12.5px] leading-[1.6] text-[#6B7787]"
              }
            >
              {step.body}
            </p>

            {/* Suggestion 1: the pages that belong to this step, as text. */}
            {isCurrent && step.pages.length > 0 ? (
              <p className="mt-1.5 text-[12px] leading-[1.6] text-[#6B7787]">
                {step.pages.join(" · ")}
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-bold tracking-[0.08em] text-[#8792A3] uppercase">
      {children}
    </h3>
  )
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admins only",
  FINANCE_OFFICER: "Finance and admins only",
  HR_ADMIN: "HR and admins only",
  REPORTING_MANAGER: "Managers only",
  EMPLOYEE: "Employees only",
}

/** A one-line marker for a function the reader may not be able to perform. */
function RoleMarker({ roles }: { roles: string[] }) {
  const label = roles
    .map((r) => ROLE_LABEL[r])
    .filter(Boolean)
    .join(", ")
  return (
    <span className="ml-2 inline-block rounded-sm bg-[#F1F4F8] px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-[#55657A]">
      {label || roles.join(", ")}
    </span>
  )
}

/** The `?` control in the header. Renders nothing where there is no help. */
export function HelpTrigger() {
  const { availableKey, open } = useHelp()
  if (!availableKey) return null

  const title = HELP[availableKey].title

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={`How ${title} works`}
      title={`How ${title} works`}
      className="size-8.5 rounded border-[#E4E9EF] text-[#55657A] hover:bg-[#F4F6F9]"
      onClick={() => open()}
    >
      <RiQuestionLine className="size-4" />
    </Button>
  )
}

export function HelpSheet() {
  const { isOpen, close, openKey } = useHelp()
  const entry = openKey ? HELP[openKey] : null

  // One set per entry render, shared across every section below, so a term is
  // marked on its first use in the whole entry and not again. Keyed by
  // openKey by re-creating it on each render — a fresh entry remounts this
  // section anyway, and the Set carries no state worth memoising.
  const markedTerms = new Set<string>()
  const mark = (text: string) => <Marked text={text} alreadyMarked={markedTerms} />

  return (
    <Sheet open={isOpen} onOpenChange={(next) => !next && close()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {entry ? (
          <>
            <SheetHeader className="border-b border-[#EEF1F5]">
              <SheetTitle className="text-[15px] font-bold text-[#17191C]">
                How this works
              </SheetTitle>
              <SheetDescription className="text-[12.5px] text-[#5F6B7C]">
                {entry.title} — {mark(entry.lede)}
              </SheetDescription>
            </SheetHeader>

            <div className="px-4 pt-5 pb-8">
              <section>
                <SectionHeading>The accounting flow</SectionHeading>
                <FlowRail current={entry.step} />
              </section>

              <section className="mt-8 border-t border-[#EEF1F5] pt-6">
                <SectionHeading>On this page</SectionHeading>
                <dl>
                  {entry.does.map((fn) => (
                    <div key={fn.name} className="mb-4 last:mb-0">
                      <dt className="text-[13px] font-bold text-[#1C2733]">
                        {fn.name}
                        {fn.roles ? <RoleMarker roles={fn.roles} /> : null}
                      </dt>
                      <dd className="mt-1 text-[12.5px] leading-[1.65] text-[#5F6B7C]">
                        {mark(fn.body)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="mt-8 border-t border-[#EEF1F5] pt-6">
                <SectionHeading>Worked example</SectionHeading>
                <p className="text-[13px] font-bold text-[#1C2733]">{entry.scenario.title}</p>
                <ol className="mt-2.5 border-l border-[#E4E9EF] pl-4">
                  {entry.scenario.steps.map((line, i) => (
                    <li
                      key={line}
                      className="mb-2.5 text-[12.5px] leading-[1.65] text-[#5F6B7C] last:mb-0"
                    >
                      <span className="mr-1.5 font-bold text-[#55657A]">{i + 1}.</span>
                      {mark(line)}
                    </li>
                  ))}
                </ol>
              </section>

              {entry.watchFor && entry.watchFor.length > 0 ? (
                <section className="mt-8 border-t border-[#EEF1F5] pt-6">
                  <SectionHeading>Worth knowing</SectionHeading>
                  <ul>
                    {entry.watchFor.map((line) => (
                      <li
                        key={line}
                        className="mb-3 flex gap-2.5 text-[12.5px] leading-[1.65] text-[#5F6B7C] last:mb-0"
                      >
                        <span
                          aria-hidden
                          className="mt-[7px] size-1 shrink-0 rounded-full bg-[#C98A15]"
                        />
                        <span>
                          {mark(line)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
