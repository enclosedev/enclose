import * as React from "react"
import { cn } from "cn"
import { ArrowUpIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MAC } from "@/lib/platform"

/** How wide the box that is written in is, px. */
export const WRITING_WIDTH = 288
/** How much room the way out of it takes over its top corner, px. */
export const WRITING_OVER = 30

/**
 * Where something is said of a thing that was picked out: a part of the model, at the
 * place that was clicked, or words of the conversation. Enter keeps it for the next
 * message, as a chip on the message box, where more can be gathered; with Cmd (or Ctrl)
 * held, it and everything waiting are sent at once. Esc, or Cancel, leaves things as they
 * were.
 */
export function Writing({
  label,
  from = "",
  placeholder,
  bare = false,
  solid = false,
  onKeep,
  onCancel,
}: {
  /** what it is said of, for the chip at the head of the box */
  label: React.ReactNode
  /** what was said of it before, where that is being changed */
  from?: string
  placeholder: string
  /** nothing written is something to keep, too */
  bare?: boolean
  /** nothing under it shows through: it is over words, which would read through it */
  solid?: boolean
  /** keep what was written; and send it at once, with everything else waiting (`now`) */
  onKeep: (text: string, now: boolean) => void
  onCancel: () => void
}) {
  const [text, setText] = React.useState(from)
  const nothing = !text.trim() && !bare

  return (
    <div className="relative" style={{ width: WRITING_WIDTH }}>
      <div
        className={cn(
          "flex w-full flex-col gap-2 rounded-2xl border p-3 shadow-xl",
          solid ? "bg-popover" : "bg-popover/95"
        )}
      >
        {/* which thing this is said of: a chip like those on the message box, a little
            lighter, so that it shows on this one */}
        <Badge className="max-w-full self-start bg-foreground/20 text-foreground">
          {label}
        </Badge>
        <textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={(event) => {
            const end = event.target.value.length
            event.target.setSelectionRange(end, end)
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation()
              onCancel()
            }
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return
            event.preventDefault()
            onKeep(text, event.metaKey || event.ctrlKey)
          }}
          placeholder={placeholder}
          rows={2}
          className="field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-end justify-between gap-2">
          {/* in its corner as the button is in its own: the letters stand as far up
              from the bottom of the box as in from its side. Its own box is cut down to
              the letters for that, and it is moved over by the room the sign for the key
              has of its own to its left */}
          <span
            className={cn(
              "text-xs text-muted-foreground [text-box:trim-both_cap_alphabetic]",
              MAC && "-ml-[1.5px]"
            )}
          >
            {MAC ? "⌘" : "Ctrl"} Enter to send now
          </span>
          <Button
            size="icon-sm"
            className="rounded-full"
            disabled={nothing}
            onClick={() => onKeep(text, false)}
          >
            <ArrowUpIcon />
            <span className="sr-only">Add to the message</span>
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="absolute right-0 bottom-full mb-1.5 flex h-6 cursor-pointer items-center gap-1 rounded-full bg-foreground px-2 text-xs font-medium whitespace-nowrap text-background shadow-sm ring-1 ring-background/25 outline-none hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)_15%)]"
      >
        <XIcon className="size-3.5" />
        Cancel
      </button>
    </div>
  )
}
