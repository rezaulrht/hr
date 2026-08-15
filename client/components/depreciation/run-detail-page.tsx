"use client"

import { RunDetail } from "./run-detail"

export function RunDetailPage({ id }: { id: string }) {
  return <RunDetail runId={id} onBack={() => (window.location.href = "/finance/depreciation")} />
}
