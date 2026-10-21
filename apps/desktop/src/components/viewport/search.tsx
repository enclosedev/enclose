import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { howMany, type Finds, type Found } from "@/lib/find"
import { spokenFor } from "@/lib/keys"
import { MAC } from "@/lib/platform"
import { useStore } from "@/lib/store"

/**
 * Where parts and groups are looked for by name: a box at the top of the view, in the
 * middle, brought up by Cmd+F (Ctrl+F, off a Mac) or by its button among those that say
 * how the model is looked at. What goes by the name lights up in the view as it is
 * typed, each thing with its name beside it. Enter shows all that was found on its own;
 * Esc, or the cross, puts the box away and leaves the view as it was.
 *
 * It is there for as long as there is a model to look through, and draws nothing until
 * it is brought up: the key is listened for here either way.
 */
export function Search({
  finds,
  onShow,
}: {
  /** what goes by the name so far; null while nothing is looked for */
  finds: Finds | null
  /** show these on their own, and be done with looking */
  onShow: (things: Found[]) => void
}) {
  const finding = useStore((state) => state.finding)
  const find = useStore((state) => state.find)
  const box = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const { finding, find, settingsOpen } = useStore.getState()
      if (settingsOpen || event.altKey) return
      // Ctrl+F on a Mac is a key for moving through text: left to do that
      const held = MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey
      if (held) {
        if (event.shiftKey || event.key.toLowerCase() !== "f") return
        event.preventDefault()
        if (finding === null) find("")
        else box.current?.select()
        return
      }
      // While it is up, what is typed goes on going into it, wherever the pointer has
      // been since: the view was turned, perhaps. The letters are not the view's keys
      // meanwhile, and are not heard as such by whoever else listens for them.
      if (finding === null || event.metaKey || event.ctrlKey) return
      if (event.key.length !== 1 && event.key !== "Backspace") return
      if (spokenFor(event.target)) return
      box.current?.focus()
      event.stopPropagation()
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [])

  if (finding === null) return null
  const things = finds?.things ?? []
  return (
    // In the middle of the view, unless that would put it over the projects' cards: then
    // as near the middle as they leave room for, and no wider than fits between them and
    // the buttons down the other edge.
    <div className="glass @container pointer-events-auto absolute top-3 left-[max(calc(50%-9.375rem),16.5rem)] flex h-10 w-[min(18.75rem,calc(100%-20rem))] animate-in items-center gap-2.5 rounded-full bg-background/60 pr-1 pl-4 shadow-sm ring-1 ring-foreground/15 duration-150 fade-in slide-in-from-top-2">
      <SearchIcon className="size-4 shrink-0" />
      <input
        ref={box}
        autoFocus
        type="text"
        aria-label="Find parts or groups"
        placeholder="Type to find parts or groups"
        spellCheck={false}
        autoComplete="off"
        value={finding}
        onChange={(event) => find(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === "Escape") {
            event.preventDefault()
            find(null)
          } else if (event.key === "Enter" && things.length > 0) {
            event.preventDefault()
            onShow(things)
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {/* how much was found, where the box is wide enough to say so and be typed in */}
      {finding.trim() !== "" && (
        <span className="hidden shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums @[16rem]:inline">
          {howMany(things) || "Nothing found"}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        // as far in from the end of the box as from its top and bottom
        className="shrink-0 rounded-full text-muted-foreground"
        onClick={() => find(null)}
      >
        <XIcon />
        <span className="sr-only">Stop looking</span>
      </Button>
    </div>
  )
}
