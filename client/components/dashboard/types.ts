import type { IconName } from "@/components/dashboard/icons"

export type Tone = "green" | "yellow" | "red" | "neutral"

export const tones: Record<Tone, { bg: string; color: string }> = {
  green: { bg: "#E3F3E8", color: "#1E7A3C" },
  yellow: { bg: "#FBF0D9", color: "#9A6B10" },
  red: { bg: "#FBE4E4", color: "#B03A3A" },
  neutral: { bg: "#ECEEF1", color: "#17191C" },
}

export type Stat = {
  label: string
  value: string
  sub: string
  tag: string
  tone: Tone
  bars: number[]
  hotBar: number
}

export type ActivityItem = {
  initial: string
  tone: Tone
  title: string
  meta: string
  status?: string
  statusTone?: Tone
  time: string
}

export type TableCell = {
  text?: string
  sub?: string
  weight?: number
  tag?: string
  tone?: Tone
}

export type SubpageData = {
  kicker: string
  title: string
  sub: string
  cta: string
  stats: { label: string; value: string; sub: string }[]
  tableTitle: string
  cols: string
  headers: string[]
  rows: TableCell[][]
}

export type ChartBar = {
  label: string
  display: string
  height: number
}

export type NavItem = {
  label: string
  href: string
  icon: IconName
  badge?: number
}

export type NavGroup = {
  label: string
  items: NavItem[]
}
