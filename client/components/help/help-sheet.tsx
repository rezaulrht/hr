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
import { HELP, type FlowStepId, type FlowStep } from "@/lib/help/accounting-help"
import { resolveEntry, resolveFlow } from "@/lib/help/resolve"
import { splitOnTerms } from "@/lib/help/glossary"
import { useHelpLang } from "@/lib/help/lang-context"
import type { Lang } from "@/lib/help/types"
import { Term } from "@/components/help/term"
import { InlineEn } from "@/components/help/inline-en"
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
 *
 * English and Bangla are read from the same resolved entry; the overlay
 * falls back to English per string when a translation is missing.
 */

/**
 * Bangla needs more room than Latin at the same nominal size: vowel signs sit
 * above and below the baseline and conjuncts stack. 12.5px is comfortable for
 * Latin and ambiguous in Bengali.
 *
 * Section headings drop uppercase and tracking entirely. Both are Latin
 * devices — Bengali has no capitals, and tracking pulls conjuncts apart.
 */
const TYPE = {
  en: {
    body: "text-[12.5px] leading-[1.65]",
    name: "text-[13px] font-bold",
    heading: "text-[11px] font-bold tracking-[0.08em] uppercase",
    step: "text-[13px]",
  },
  bn: {
    body: "font-bengali text-[14px] leading-[1.9]",
    name: "font-bengali text-[14.5px] font-bold",
    heading: "font-bengali text-[12px] font-bold",
    step: "font-bengali text-[14px]",
  },
} as const

/** Renders one English string with glossary terms marked on first use. */
function English({
  text,
  alreadyMarked,
  lang,
}: {
  text: string
  alreadyMarked: Set<string>
  lang: Lang
}) {
  const parts = splitOnTerms(text, alreadyMarked)
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <React.Fragment key={i}>{part}</React.Fragment>
        ) : (
          <Term key={i} term={part.term} definition={part.definition} lang={lang === "bn" ? "en" : undefined} />
        )
      )}
    </>
  )
}

/** One entry's text, in the reader's language. Bangla prose marks the
 *  on-screen names with `**`; English prose uses the glossary scanner. */
function EntryText({ text, lang, alreadyMarked }: { text: string; lang: Lang; alreadyMarked: Set<string> }) {
  return lang === "bn" ? (
    <InlineEn text={text} />
  ) : (
    <English text={text} lang={lang} alreadyMarked={alreadyMarked} />
  )
}

function FlowRail({
  steps,
  current,
  lang,
}: {
  steps: FlowStep[]
  current: FlowStepId
  lang: Lang
}) {
  const currentIndex = steps.findIndex((s) => s.id === current)
  const t = TYPE[lang]

  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const isCurrent = step.id === current
        const isPast = i < currentIndex

        return (
          <li key={step.id} className="relative pb-5 pl-7 last:pb-0">
            {/* The rail, drawn per item so the last one does not trail off
                below the final marker. */}
            {i < steps.length - 1 ? (
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
                lang={lang}
                className={
                  isCurrent
                    ? `${t.step} font-bold text-[#17191C]`
                    : `${t.step} font-semibold text-[#55657A]`
                }
              >
                {i + 1}. {step.title}
              </span>
              {isCurrent ? (
                <span
                  lang={lang}
                  className="rounded-sm bg-[#17191C] px-1.5 py-px text-[10px] font-bold tracking-wide whitespace-nowrap text-white uppercase"
                >
                  {lang === "bn" ? "আপনি এখানে আছেন" : "You are here"}
                </span>
              ) : null}
            </div>

            <p
              lang={lang}
              className={
                isCurrent
                  ? `mt-1 ${t.body} text-[#3B4757]`
                  : `mt-1 ${t.body} text-[#6B7787]`
              }
            >
              <EntryText text={step.body} lang={lang} alreadyMarked={new Set()} />
            </p>

            {/* Suggestion 1: the pages that belong to this step, as text.
                Decision 3 keeps them English in both languages. */}
            {isCurrent && step.pages.length > 0 ? (
              <p lang="en" className="mt-1.5 font-sans text-[12px] leading-[1.6] text-[#6B7787]">
                {step.pages.join(" · ")}
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function SectionHeading({ children, lang }: { children: React.ReactNode; lang: Lang }) {
  return (
    <h3 lang={lang} className={`mb-3 ${TYPE[lang].heading} text-[#8792A3]`}>
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
function RoleMarker({ roles, lang }: { roles: string[]; lang: Lang }) {
  const label = roles
    .map((r) => ROLE_LABEL[r])
    .filter(Boolean)
    .join(", ")
  return (
    <span
      lang={lang}
      className={`ml-2 inline-block rounded-sm bg-[#F1F4F8] px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-[#55657A] ${lang === "bn" ? "font-bengali" : ""}`}
    >
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

/** EN / বাংলা in the panel header. Selected carries the same `bg-[#17191C]
 *  text-white` treatment the "You are here" chip uses — one idiom for "this
 *  one". */
function LangToggle() {
  const { lang, setLang } = useHelpLang()
  const base =
    "rounded-sm px-2 py-0.5 text-[11px] font-bold transition-colors"
  const on = "bg-[#17191C] text-white"
  const off = "text-[#55657A] hover:bg-[#F4F6F9]"

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-[#E4E9EF] p-0.5" role="group" aria-label="Language">
      <button
        type="button"
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
        className={`${base} ${lang === "en" ? on : off}`}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={lang === "bn"}
        onClick={() => setLang("bn")}
        className={`${base} font-bengali ${lang === "bn" ? on : off}`}
      >
        বাংলা
      </button>
    </div>
  )
}

export function HelpSheet() {
  const { isOpen, close, openKey } = useHelp()
  const { lang } = useHelpLang()
  const entry = openKey ? resolveEntry(openKey, lang) : null
  const flow = resolveFlow(lang)
  const t = TYPE[lang]

  // One set per entry render, shared across every English section, so a term
  // is marked on its first use in the whole entry and not again.
  const markedTerms = new Set<string>()
  const text = (s: string) => <EntryText text={s} lang={lang} alreadyMarked={markedTerms} />

  return (
    <Sheet open={isOpen} onOpenChange={(next) => !next && close()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {entry ? (
          <>
            <SheetHeader className="border-b border-[#EEF1F5]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SheetTitle lang={lang} className="text-[15px] font-bold text-[#17191C]">
                    {lang === "bn" ? "এটা কীভাবে কাজ করে" : "How this works"}
                  </SheetTitle>
                  <SheetDescription lang={lang} className={`mt-0.5 ${t.body} text-[#5F6B7C]`}>
                    {entry.title} — {text(entry.lede)}
                  </SheetDescription>
                </div>
                <LangToggle />
              </div>
            </SheetHeader>

            {/* lang on the subtree, not the document — the sidebar beside the
                panel stays English (Decision 8). */}
            <div lang={lang} className="px-4 pt-5 pb-8">
              <section>
                <SectionHeading lang={lang}>
                  {lang === "bn" ? "হিসাবের প্রবাহ" : "The accounting flow"}
                </SectionHeading>
                <FlowRail steps={flow} current={entry.step} lang={lang} />
              </section>

              {entry.connects ? (
                <section className="mt-8 border-t border-[#EEF1F5] pt-6">
                  <SectionHeading lang={lang}>
                    {lang === "bn" ? "এটার সাথে কী যুক্ত" : "What connects to this"}
                  </SectionHeading>
                  <dl className={`${t.body} text-[#5F6B7C]`}>
                    {entry.connects.fedBy && entry.connects.fedBy.length > 0 ? (
                      <div className="mb-3 last:mb-0">
                        <dt lang={lang} className="text-[12px] font-bold text-[#55657A]">
                          {lang === "bn" ? "যা থেকে আসে" : "Fed by"}
                        </dt>
                        <dd className="mt-0.5">
                          {entry.connects.fedBy.map((s, i) => (
                            <React.Fragment key={i}>
                              {i > 0 ? " · " : null}
                              {text(s)}
                            </React.Fragment>
                          ))}
                        </dd>
                      </div>
                    ) : null}
                    {entry.connects.feeds && entry.connects.feeds.length > 0 ? (
                      <div>
                        <dt lang={lang} className="text-[12px] font-bold text-[#55657A]">
                          {lang === "bn" ? "যা এটা থেকে যায়" : "Feeds"}
                        </dt>
                        <dd className="mt-0.5">
                          {entry.connects.feeds.map((s, i) => (
                            <React.Fragment key={i}>
                              {i > 0 ? " · " : null}
                              {text(s)}
                            </React.Fragment>
                          ))}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>
              ) : null}

              {entry.reading && entry.reading.length > 0 ? (
                <section className="mt-8 border-t border-[#EEF1F5] pt-6">
                  <SectionHeading lang={lang}>
                    {lang === "bn" ? "পর্দায় যা দেখছেন" : "Reading what is on screen"}
                  </SectionHeading>
                  <dl>
                    {entry.reading.map((fn) => (
                      <div key={fn.name} className="mb-4 last:mb-0">
                        <dt lang={lang} className={`${t.name} text-[#1C2733]`}>
                          {fn.name}
                        </dt>
                        <dd lang={lang} className={`mt-1 ${t.body} text-[#5F6B7C]`}>
                          {text(fn.body)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}

              <section className="mt-8 border-t border-[#EEF1F5] pt-6">
                <SectionHeading lang={lang}>
                  {lang === "bn" ? "এখানে কী করতে পারেন" : "What you can do here"}
                </SectionHeading>
                <dl>
                  {entry.does.map((fn) => (
                    <div key={fn.name} className="mb-4 last:mb-0">
                      <dt lang={lang} className={`${t.name} text-[#1C2733]`}>
                        {fn.name}
                        {fn.roles ? <RoleMarker roles={fn.roles} lang={lang} /> : null}
                      </dt>
                      <dd lang={lang} className={`mt-1 ${t.body} text-[#5F6B7C]`}>
                        {text(fn.body)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="mt-8 border-t border-[#EEF1F5] pt-6">
                <SectionHeading lang={lang}>
                  {entry.scenarios.length > 1
                    ? lang === "bn"
                      ? "কাজের উদাহরণ"
                      : "Worked examples"
                    : lang === "bn"
                      ? "কাজের উদাহরণ"
                      : "Worked example"}
                </SectionHeading>
                {entry.scenarios.map((scenario) => (
                  <div key={scenario.title} className="mb-6 last:mb-0">
                    <p lang={lang} className={`${t.name} text-[#1C2733]`}>
                      {scenario.title}
                    </p>
                    <ol className="mt-2.5 border-l border-[#E4E9EF] pl-4">
                      {scenario.steps.map((line, i) => (
                        <li
                          key={line}
                          lang={lang}
                          className={`mb-2.5 ${t.body} text-[#5F6B7C] last:mb-0`}
                        >
                          <span className="mr-1.5 font-bold text-[#55657A]">{i + 1}.</span>
                          {text(line)}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </section>

              {entry.watchFor && entry.watchFor.length > 0 ? (
                <section className="mt-8 border-t border-[#EEF1F5] pt-6">
                  <SectionHeading lang={lang}>
                    {lang === "bn" ? "জেনে রাখা ভালো" : "Worth knowing"}
                  </SectionHeading>
                  <ul>
                    {entry.watchFor.map((line) => (
                      <li
                        key={line}
                        lang={lang}
                        className={`mb-3 flex gap-2.5 ${t.body} text-[#5F6B7C] last:mb-0`}
                      >
                        <span
                          aria-hidden
                          className="mt-[7px] size-1 shrink-0 rounded-full bg-[#C98A15]"
                        />
                        <span>{text(line)}</span>
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
