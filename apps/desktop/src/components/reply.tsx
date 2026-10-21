import * as React from "react"
import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"

import type { ThreadItem } from "@shared/api"
import { replyOf } from "@shared/reply"
import { Markdown } from "@/components/markdown"
import { LINE, LIVE, useKeptInView } from "@/components/steps"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

/**
 * Something Claude said. What it said outright is shown; what it set off from that, for
 * whoever wants it, is behind a line under it that opens as the steps do. Drawn again
 * only when it changes, and not for every word of what is being said after it.
 */
export const Reply = React.memo(function Reply({
  item,
}: {
  item: Extract<ThreadItem, { kind: "assistant" }>
}) {
  const { said, more } = React.useMemo(() => replyOf(item.text), [item.text])
  const [open, setOpen] = React.useState(false)
  const whole = useKeptInView<HTMLDivElement>(open)

  // nothing set off; or a block begun and then left empty
  if (more === null || (!more && !item.streaming))
    return <Markdown>{said}</Markdown>

  return (
    <div ref={whole} className="flex scroll-my-6 flex-col gap-2">
      <Markdown>{said}</Markdown>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className={cn(
            LINE,
            "group/details rounded-md text-left outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          )}
        >
          <span className={cn(item.streaming && LIVE)}>Details</span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-60 transition-transform group-data-panel-open/details:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
          <div className="pt-2">
            <Markdown>{more}</Markdown>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
})
