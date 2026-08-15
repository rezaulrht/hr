"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * One accounting term inside help copy, marked with a dotted underline.
 *
 * Click opens a popover with the one-line definition; hover shows it as a
 * tooltip. The two are composed on the same trigger so both paths exist — a
 * mouse gets the quick answer, a deliberate read gets the stable one.
 */
export function Term({ term, definition }: { term: string; definition: string }) {
  return (
    <Tooltip>
      <Popover>
        <PopoverTrigger
          render={
            <TooltipTrigger
              render={
                <span className="cursor-help border-b border-dotted border-[#8792A3]">
                  {term}
                </span>
              }
            />
          }
        />
        <PopoverContent className="w-64">
          <p className="text-[12.5px] leading-[1.6] text-[#3B4757]">{definition}</p>
        </PopoverContent>
      </Popover>
      <TooltipContent>
        <span className="text-[11.5px]">{definition}</span>
      </TooltipContent>
    </Tooltip>
  )
}
