"use client"

import type { FinancialYear } from "@/lib/api/types"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { presetOptions, type Preset, type Range } from "@/components/statements/statements-shared"

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: "MONTH", label: "Month" },
  { value: "QUARTER", label: "Quarter" },
  { value: "HALF_YEAR", label: "Half-year" },
  { value: "YEAR", label: "Year" },
  { value: "CUSTOM", label: "Custom" },
]

export function PeriodControl({
  years,
  financialYearId,
  onFinancialYearChange,
  preset,
  onPresetChange,
  index,
  onIndexChange,
  range,
  onRangeChange,
  comparativeLabel,
}: {
  years: FinancialYear[]
  financialYearId: string
  onFinancialYearChange: (id: string) => void
  preset: Preset
  onPresetChange: (preset: Preset) => void
  index: number
  onIndexChange: (index: number) => void
  range: Range
  onRangeChange: (range: Range) => void
  /** From the server's response — never re-derived here. */
  comparativeLabel: string | null
}) {
  const fy = years.find((y) => y.id === financialYearId)
  const options = fy ? presetOptions(preset, fy) : []

  // Base UI's Select renders the raw value on the closed trigger unless the
  // root is given `items` — the year's uuid, the preset's enum key, and for
  // the quarter picker a bare "0" where the list read "Q1 Jul–Sep".
  const yearItems = Object.fromEntries(years.map((y) => [y.id, y.name]))
  const presetItems = Object.fromEntries(PRESETS.map((p) => [p.value, p.label]))
  const optionItems = Object.fromEntries(options.map((o) => [String(o.index), o.label]))

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Financial year</Label>
        <Select items={yearItems} value={financialYearId} onValueChange={(v) => v && onFinancialYearChange(v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Period</Label>
        <Select items={presetItems} value={preset} onValueChange={(v) => v && onPresetChange(v as Preset)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {options.length > 0 && (
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">&nbsp;</Label>
          <Select items={optionItems} value={String(index)} onValueChange={(v) => v && onIndexChange(Number(v))}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.index} value={String(o.index)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {preset === "CUSTOM" && (
        <>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground" htmlFor="st-from">From</Label>
            <Input
              id="st-from"
              type="date"
              value={range.from}
              onChange={(e) => onRangeChange({ ...range, from: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground" htmlFor="st-to">To</Label>
            <Input
              id="st-to"
              type="date"
              value={range.to}
              onChange={(e) => onRangeChange({ ...range, to: e.target.value })}
              className="w-40"
            />
          </div>
        </>
      )}

      {comparativeLabel && (
        <p className="ml-auto pb-2 text-sm text-muted-foreground">
          compared with <span className="font-medium text-foreground">{comparativeLabel}</span>
        </p>
      )}
    </div>
  )
}
