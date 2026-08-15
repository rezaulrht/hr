"use client"

import * as React from "react"

import { GLOSSARY_BN } from "@/lib/help/glossary.bn"
import { Term } from "@/components/help/term"

/**
 * Decision 3's mechanism. Inside Bangla prose, anything the reader must find
 * on screen is written between double asterisks — `**Trial balance**` — and
 * this turns each token into a `<span lang="en">` in the Latin face. The Bangla
 * sentence explains; the English token identifies.
 *
 * The glossary composes with it rather than competing: a marked token that is
 * also a glossary term renders as a `Term`, showing the Bangla definition.
 *
 * `**` is free — the English content uses no markdown.
 */
const TOKEN = /\*\*(.+?)\*\*/g

export function InlineEn({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index!
    if (at > cursor) parts.push(text.slice(cursor, at))
    const token = match[1]
    const definition = GLOSSARY_BN[token.toLowerCase()]
    parts.push(
      definition ? (
        <Term key={at} term={token} definition={definition} lang="en" />
      ) : (
        <span key={at} lang="en" className="font-sans">
          {token}
        </span>
      )
    )
    cursor = at + match[0].length
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}
