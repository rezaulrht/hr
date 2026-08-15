/**
 * Decision 2's staleness check for the Bangla help overlay.
 *
 * Walks every English string with the same traversal `resolve.ts` uses,
 * compares each against the overlay's `of` fingerprint (the first 8
 * characters of the SHA-256 of the English at translation time), and reports
 * three things:
 *
 *   Missing  — English string, no Bangla. The expected state during rollout;
 *              listed, never a failure.
 *   Stale    — fingerprint does not match. FAILS, printing the key, the
 *              English, and the Bangla it no longer matches.
 *   Orphaned — a Bangla key with no English. FAILS.
 *
 * Exit non-zero on stale or orphaned; a `n of m translated` summary either
 * way. Run it beside `npm run lint`.
 *
 * Written in tsx because it imports two TypeScript modules — the server's own
 * dev runner, rather than regex-parsing the files (fragile) or depending on
 * whatever Node version somebody happens to run.
 */

import { createHash } from "node:crypto"

import { FLOW, HELP, type HelpEntry, type HelpFunction } from "../lib/help/accounting-help"
import { GLOSSARY } from "../lib/help/glossary"
import { GLOSSARY_BN } from "../lib/help/glossary.bn"
import { HELP_BN } from "../lib/help/accounting-help.bn"
import type { Translated } from "../lib/help/types"

const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 8)

interface Report {
  missing: Array<{ key: string; text: string }>
  stale: Array<{ key: string; en: string; bn: string }>
  orphaned: string[]
  translated: number
}

function checkTranslated(en: string, t: Translated | undefined, report: Report, key: string) {
  if (!t) {
    report.missing.push({ key, text: en })
    return
  }
  if (t.of !== fingerprint(en)) {
    report.stale.push({ key, en, bn: t.bn })
    return
  }
  report.translated += 1
}

function checkFunctions(
  fns: HelpFunction[],
  overlay: Record<string, { name?: Translated; body?: Translated }> | undefined,
  report: Report,
  keyPrefix: string
) {
  for (const fn of fns) {
    checkTranslated(fn.name, overlay?.[fn.name]?.name, report, `${keyPrefix}.name:${fn.name}`)
    checkTranslated(fn.body, overlay?.[fn.name]?.body, report, `${keyPrefix}.body:${fn.name}`)
  }
}

function checkEntry(key: string, entry: HelpEntry) {
  const report: Report = { missing: [], stale: [], orphaned: [], translated: 0 }
  const o = HELP_BN.entries?.[key]

  checkTranslated(entry.title, o?.title, report, `${key}.title`)
  checkTranslated(entry.lede, o?.lede, report, `${key}.lede`)

  if (entry.connects) {
    entry.connects.fedBy?.forEach((s, i) =>
      checkTranslated(s, o?.connects?.fedBy?.[i], report, `${key}.connects.fedBy[${i}]`)
    )
    entry.connects.feeds?.forEach((s, i) =>
      checkTranslated(s, o?.connects?.feeds?.[i], report, `${key}.connects.feeds[${i}]`)
    )
  }

  if (entry.reading) checkFunctions(entry.reading, o?.reading, report, `${key}.reading`)
  checkFunctions(entry.does, o?.does, report, `${key}.does`)

  entry.scenarios.forEach((s) => {
    checkTranslated(s.title, o?.scenarios?.[s.title]?.title, report, `${key}.scenarios.${s.title}.title`)
    s.steps.forEach((line, i) =>
      checkTranslated(line, o?.scenarios?.[s.title]?.steps?.[i], report, `${key}.scenarios.${s.title}.steps[${i}]`)
    )
  })

  entry.watchFor?.forEach((line, i) =>
    checkTranslated(line, o?.watchFor?.[i], report, `${key}.watchFor[${i}]`)
  )

  // Orphaned: every overlay key that has no English counterpart.
  if (o) {
    for (const overlayKey of Object.keys(o)) {
      const exists =
        overlayKey === "title" ||
        overlayKey === "lede" ||
        overlayKey === "connects" ||
        overlayKey === "reading" ||
        overlayKey === "does" ||
        overlayKey === "scenarios" ||
        overlayKey === "watchFor"
      if (!exists) report.orphaned.push(`${key}.${overlayKey}`)
    }
  }

  return report
}

function checkFlow() {
  const report: Report = { missing: [], stale: [], orphaned: [], translated: 0 }
  for (const step of FLOW) {
    const o = HELP_BN.flow?.[step.id]
    checkTranslated(step.title, o?.title, report, `flow.${step.id}.title`)
    checkTranslated(step.body, o?.body, report, `flow.${step.id}.body`)
  }
  return report
}

function checkOverlayKeys() {
  const report: Report = { missing: [], stale: [], orphaned: [], translated: 0 }
  // An overlay entry or flow step with no English counterpart is orphaned.
  if (HELP_BN.flow) {
    for (const stepId of Object.keys(HELP_BN.flow)) {
      if (!FLOW.some((s) => s.id === stepId)) report.orphaned.push(`flow.${stepId}`)
    }
  }
  if (HELP_BN.entries) {
    for (const key of Object.keys(HELP_BN.entries)) {
      if (!(key in HELP)) report.orphaned.push(key)
    }
  }
  return report
}

function checkGlossary() {
  const report: Report = { missing: [], stale: [], orphaned: [], translated: 0 }
  for (const [term, en] of Object.entries(GLOSSARY)) {
    const bn = GLOSSARY_BN[term]
    if (!bn) {
      report.missing.push({ key: `glossary.${term}`, text: en })
      continue
    }
    // The glossary has no fingerprint — the explanation and the English term
    // are tied by the key itself, and the term never changes. Counted as
    // translated, and the presence of a key is the whole check.
    report.translated += 1
  }
  for (const term of Object.keys(GLOSSARY_BN)) {
    if (!(term in GLOSSARY)) report.orphaned.push(`glossary.${term}`)
  }
  return report
}

const reports = [checkFlow(), checkOverlayKeys(), ...Object.entries(HELP).map(([k, e]) => checkEntry(k, e)), checkGlossary()]

const missing = reports.flatMap((r) => r.missing)
const stale = reports.flatMap((r) => r.stale)
const orphaned = reports.flatMap((r) => r.orphaned)
const translated = reports.reduce((t, r) => t + r.translated, 0)

for (const m of missing) console.log(`missing  ${m.key}`)
for (const s of stale) {
  console.log(`STALE    ${s.key}`)
  console.log(`  en: ${s.en}`)
  console.log(`  bn: ${s.bn}`)
}
for (const o of orphaned) console.log(`ORPHANED ${o}`)

// The expected fingerprint for each missing string, so a translator can copy
// it in rather than computing by hand (plan Task 7 Step 3).
for (const m of missing) console.log(`  of "${fingerprint(m.text)}" // ${m.key}`)

const total = missing.length + stale.length + translated
console.log(`${translated} of ${total} strings translated${missing.length ? `, ${missing.length} missing` : ""}`)

if (stale.length > 0 || orphaned.length > 0) {
  console.error(`${stale.length} stale, ${orphaned.length} orphaned — fix before shipping.`)
  process.exit(1)
}
