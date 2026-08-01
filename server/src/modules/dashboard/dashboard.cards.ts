/**
 * Per-card isolation.
 *
 * A dashboard that fails wholesale because one of eight queries timed out is
 * worse than one that shows seven numbers and an error. Every card settles
 * independently, and a failed card still names itself — `label` lives
 * *outside* the builder precisely so it survives the rejection. A card
 * reading "Something went wrong" with no label tells the user nothing about
 * *what* is missing.
 */

import type { DashboardStat } from "./dashboard.types"

export interface CardBuilder {
  label: string
  build: () => Promise<DashboardStat>
}

export async function settleCards(builders: CardBuilder[]): Promise<DashboardStat[]> {
  const settled = await Promise.allSettled(builders.map((b) => b.build()))

  return settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value

    // Logged rather than swallowed: a card silently failing for a month
    // because nobody saw a stack trace is how a dashboard becomes furniture.
    console.error(`Dashboard card "${builders[i].label}" failed`, result.reason)

    return {
      label: builders[i].label,
      // Not "0" and not "—": both read as a real answer. This one reads as
      // an absence of one.
      value: "Unavailable",
      sub: "Could not be loaded",
      tag: "Error",
      tone: "red",
      failed: true,
    }
  })
}
