import type { FlowStepId } from "./accounting-help"

export type Lang = "en" | "bn"

/** A translated string and a fingerprint of the English it was written from.
 *  The fingerprint is never checked at runtime — only by the script in Task 6. */
export interface Translated {
  /** First 8 chars of the SHA-256 of the English string at translation time. */
  of: string
  bn: string
}

export interface HelpEntryOverlay {
  title?: Translated
  lede?: Translated
  connects?: {
    fedBy?: Record<number, Translated>
    feeds?: Record<number, Translated>
  }
  /** Keyed by the English `name`. */
  reading?: Record<string, { name?: Translated; body?: Translated }>
  does?: Record<string, { name?: Translated; body?: Translated }>
  /** Keyed by the English scenario `title`; steps by index. */
  scenarios?: Record<string, { title?: Translated; steps?: Record<number, Translated> }>
  watchFor?: Record<number, Translated>
}

export interface HelpOverlay {
  /** `pages` is deliberately absent — those are sidebar labels and Decision 3
   *  keeps them English. The type is what enforces it. */
  flow?: Partial<Record<FlowStepId, { title?: Translated; body?: Translated }>>
  entries?: Record<string, HelpEntryOverlay>
}
