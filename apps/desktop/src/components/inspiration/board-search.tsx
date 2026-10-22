// Looking through a board: the inspiration board (see inspiration-mode.tsx), and a
// circuit board in PCB mode (see pcb/board-mode.tsx).
import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { spokenFor } from "@/lib/keys"
import { MAC } from "@/lib/platform"
import { useStore } from "@/lib/store"

/**
 * Where a board is looked through, at the top of it: the inspiration board's pictures,
 * by what they were called, the group they are in, what was noted on them, and what the
 * agent said of them; or what is on a circuit board, by name. What does not go by what
 * is typed fades back as it is; Enter goes to what does.
 */
export function BoardSearch({
  what,
  said,
  onShow,
  keysKept = false,
}: {
  /** what is looked for: "images" */
  what: string
  /** how much was found, "2 images", or that nothing was: null while nothing is looked for */
  said: string | null
  onShow: () => void
  /**
   * What is typed while it is up goes into it, wherever the pointer has been since: the
   * board was moved, perhaps. The letters are not the board's keys meanwhile.
   */
  keysKept?: boolean
}) {
  const finding = useStore((state) => state.finding)
  const find = useStore((state) => state.find)
  const box = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    box.current?.focus()
  }, [])
  React.useEffect(() => {
    if (!keysKept) return
    const key = (event: KeyboardEvent) => {
      if (useStore.getState().finding === null) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.length !== 1 && event.key !== "Backspace") return
      if (spokenFor(event.target)) return
      box.current?.focus()
      event.stopPropagation()
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [keysKept])
  if (finding === null) return null
  return (
    <div className="glass @container pointer-events-auto absolute top-3 left-[max(calc(50%-9.375rem),16.5rem)] flex h-10 w-[min(18.75rem,calc(100%-20rem))] animate-in items-center gap-2.5 rounded-full bg-background/60 pr-1 pl-4 shadow-sm ring-1 ring-foreground/15 duration-150 fade-in slide-in-from-top-2">
      <SearchIcon className="size-4 shrink-0" />
      <input
        ref={box}
        type="text"
        aria-label={`Find ${what}`}
        placeholder={`Type to find ${what}`}
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
      {said !== null && (
        <span className="hidden shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums @[16rem]:inline">
          {said || "Nothing found"}
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
 * parts otherwise: listened for here, where the model's own box is not. Not while there
 * is nothing to look through (`on`).
 */
export function useBoardFinding(on = true) {
  React.useEffect(() => {
    if (!on) return
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
  }, [on])
}
