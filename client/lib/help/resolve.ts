import { FLOW, HELP, type FlowStep, type HelpEntry } from "./accounting-help"
import { HELP_BN } from "./accounting-help.bn"
import type { Lang, Translated } from "./types"

/** English when there is no translation. Per string, not per page — but a page
 *  with no overlay at all resolves entirely to English, which is the point. */
const pick = (en: string, t: Translated | undefined) => t?.bn ?? en

export function resolveFlow(lang: Lang): FlowStep[] {
  if (lang === "en") return FLOW
  return FLOW.map((step) => {
    const o = HELP_BN.flow?.[step.id]
    return {
      ...step,
      title: pick(step.title, o?.title),
      body: pick(step.body, o?.body),
      // pages stay English — Decision 3.
    }
  })
}

export function resolveEntry(key: string, lang: Lang): HelpEntry {
  const entry = HELP[key]
  if (lang === "en") return entry
  const o = HELP_BN.entries?.[key]
  if (!o) return entry

  return {
    ...entry,
    title: pick(entry.title, o.title),
    lede: pick(entry.lede, o.lede),
    connects: entry.connects && {
      fedBy: entry.connects.fedBy?.map((s, i) => pick(s, o.connects?.fedBy?.[i])),
      feeds: entry.connects.feeds?.map((s, i) => pick(s, o.connects?.feeds?.[i])),
    },
    reading: entry.reading?.map((fn) => ({
      ...fn,
      name: pick(fn.name, o.reading?.[fn.name]?.name),
      body: pick(fn.body, o.reading?.[fn.name]?.body),
    })),
    does: entry.does.map((fn) => ({
      ...fn,
      name: pick(fn.name, o.does?.[fn.name]?.name),
      body: pick(fn.body, o.does?.[fn.name]?.body),
    })),
    scenarios: entry.scenarios.map((s) => ({
      title: pick(s.title, o.scenarios?.[s.title]?.title),
      steps: s.steps.map((line, i) => pick(line, o.scenarios?.[s.title]?.steps?.[i])),
    })),
    watchFor: entry.watchFor?.map((line, i) => pick(line, o.watchFor?.[i])),
  }
}
