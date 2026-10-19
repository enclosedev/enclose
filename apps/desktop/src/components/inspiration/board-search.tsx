// Looking through the inspiration board: see inspiration-mode.tsx.
import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MAC } from "@/lib/platform"
import { useStore } from "@/lib/store"

const counted = (many: number, what: string) =>
  `${many} ${what}${many === 1 ? "" : "s"}`

/**
 * Where the board's pictures are looked for, at the top of it: by what they were
 * called, the group they are in, what was noted on them, and what the agent said of
 * them. What does not go by it fades back as it is typed; Enter goes to what does.
 */
export function BoardSearch({
  found,
  onShow,
}: {
  found: Set<string> | null
  onShow: () => void
}) {
  const finding = useStore((state) => state.finding)
  const find = useStore((state) => state.find)
  const box = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    box.current?.focus()
  }, [])
  if (finding === null) return null
  return (
    <div className="glass @container pointer-events-auto absolute top-3 left-[max(calc(50%-9.375rem),16.5rem)] flex h-10 w-[min(18.75rem,calc(100%-20rem))] animate-in items-center gap-2.5 rounded-full bg-background/60 pr-1 pl-4 shadow-sm ring-1 ring-foreground/15 duration-150 fade-in slide-in-from-top-2">
      <SearchIcon className="size-4 shrink-0" />
      <input
        ref={box}
        type="text"
        aria-label="Find images"
        placeholder="Type to find images"
        spellCheck={false}
        autoComplete="off"
        value={finding}
        onChange={(event) => find(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === "Escape") {
            event.preventDefault()
            find(null)
          } else if (event.key === "Enter") {
            event.preventDefault()
            onShow()
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {found !== null && (
        <span className="hidden shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums @[16rem]:inline">
          {found.size > 0 ? counted(found.size, "image") : "Nothing found"}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 rounded-full text-muted-foreground"
        onClick={() => find(null)}
      >
        <XIcon />
        <span className="sr-only">Stop looking</span>
      </Button>
    </div>
  )
}

/**
 * Cmd+F looks through the board while it is on screen, as it looks through the model's
 * parts otherwise: listened for here, where the model's own box is not.
 */
export function useBoardFinding() {
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const { finding, find, settingsOpen } = useStore.getState()
      if (settingsOpen || event.altKey) return
      const held = MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey
      if (!held || event.shiftKey || event.key.toLowerCase() !== "f") return
      event.preventDefault()
      if (finding === null) find("")
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [])
}
