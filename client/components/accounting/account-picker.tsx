"use client"

import { useMemo, useState } from "react"
import { RiArrowDownSLine, RiCheckLine } from "@remixicon/react"

import type { Account } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * The account picker. There is no combobox in this shadcn install, so it is
 * a popover with an input and a filtered list.
 *
 * The one rule that matters: it matches on **code or name**, so "5201" and
 * "salary" both find Salary and Allowances. Someone entering forty journals
 * a week knows the codes; someone entering their first does not, and the
 * picker must not force either of them to learn the other's habit.
 *
 * Groups are filtered out entirely rather than shown-and-disabled: a journal
 * line cannot point at one, so offering it is offering a dead end.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  placeholder = "Account",
  disabled,
  className,
}: {
  accounts: Account[]
  value: string | null
  onChange: (accountId: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const postable = useMemo(
    () => accounts.filter((a) => !a.isGroup && a.isActive),
    [accounts]
  )

  const selected = useMemo(
    () => postable.find((a) => a.id === value) ?? null,
    [postable, value]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return postable.slice(0, 50)
    return postable
      .filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 50)
  }, [postable, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("w-full justify-between font-normal", className)}
          />
        }
      >
        {selected ? (
          <span className="truncate">
            <span className="text-muted-foreground tabular-nums">{selected.code}</span>{" "}
            {selected.name}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <RiArrowDownSLine className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Code or name…"
            className="h-8"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No account matches “{query}”.
            </p>
          ) : (
            matches.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => {
                  onChange(account.id)
                  setQuery("")
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <RiCheckLine
                  className={cn("size-4 shrink-0", account.id === value ? "opacity-100" : "opacity-0")}
                />
                <span className="w-12 shrink-0 text-muted-foreground tabular-nums">
                  {account.code}
                </span>
                <span className="truncate">{account.name}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
