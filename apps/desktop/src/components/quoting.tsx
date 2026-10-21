// Saying something of words picked out of the conversation. Words of an answer that are
// selected have a button come up by them; pressed, it opens a box beside them to write
// in, the one a part has, and what is kept there waits on the message box as a chip, as
// what is said of a part does, to go with the next message.
import * as React from "react"
import { createPortal } from "react-dom"
import { QuoteIcon } from "lucide-react"

import { Writing, WRITING_OVER } from "@/components/writing"
import { beside, inLine, quoteOf, type Box } from "@/lib/quotes"
import { useStore } from "@/lib/store"

/** What marks something said in the conversation as words that can be picked out of it. */
export const QUOTABLE = "data-quotable"

/** How near the edges of the conversation what floats over it may come, px. */
const MARGIN = 12

/** The answer a place in the conversation is in, if it is in one. */
const answerAt = (node: Node | null) =>
  (node instanceof Element ? node : (node?.parentElement ?? null))?.closest(
    `[${QUOTABLE}]`
  ) ?? null

/**
 * The words that are selected, where they are words of one answer in this conversation:
 * with where they are. A selection that runs out of the answer it began in is drawn in
 * to that answer.
 */
function picked(panel: HTMLElement): { words: string; range: Range } | null {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0)
    return null
  const range = selection.getRangeAt(0)
  const answer = answerAt(range.startContainer) ?? answerAt(range.endContainer)
  if (!answer || !panel.contains(answer)) return null
  if (!answer.contains(range.startContainer)) range.setStartBefore(answer)
  if (!answer.contains(range.endContainer)) range.setEndAfter(answer)
  // (as it is seen, a line to a line: what the range itself gives runs them together)
  const words = quoteOf(selection.toString())
  return words ? { words, range: range.cloneRange() } : null
}

/** The words being quoted stay lit while something is written of them (see index.css). */
function light(range: Range | null) {
  if (typeof Highlight === "undefined") return
  if (range) CSS.highlights.set("quoted", new Highlight(range))
  else CSS.highlights.delete("quoted")
}

/**
 * Something that floats over the conversation beside a place in it: over the place or
 * under it, as it would sooner be, and kept where all of it can be seen. It goes with
 * the place as the conversation is moved.
 */
function Beside({
  place,
  within,
  sooner,
  children,
}: {
  /** where the place is now; null once it is gone */
  place: () => DOMRect | null
  within: React.RefObject<HTMLElement | null>
  sooner: "over" | "under"
  children: React.ReactNode
}) {
  const it = React.useRef<HTMLDivElement>(null)
  const [at, setAt] = React.useState<{ left: number; top: number } | null>(null)
  React.useLayoutEffect(() => {
    const el = it.current
    if (!el) return
    const put = () => {
      const words = place()
      const panel = within.current?.getBoundingClientRect()
      if (!words || !panel) return
      const room: Box = {
        left: panel.left + MARGIN,
        top: Math.max(panel.top, 0) + MARGIN,
        right: panel.right - MARGIN,
        bottom: Math.min(panel.bottom, window.innerHeight) - MARGIN,
      }
      const next = beside(
        words,
        { width: el.offsetWidth, height: el.offsetHeight },
        room,
        sooner
      )
      setAt((was) =>
        was?.left === next.left && was.top === next.top ? was : next
      )
    }
    put()
    // it is as big as what is written in it, and that grows
    const sized = new ResizeObserver(put)
    sized.observe(el)
    window.addEventListener("resize", put)
    // (a conversation that is moved says so only to itself: it is listened for on the way)
    document.addEventListener("scroll", put, true)
    return () => {
      sized.disconnect()
      window.removeEventListener("resize", put)
      document.removeEventListener("scroll", put, true)
    }
  }, [place, within, sooner])
  return createPortal(
    <div
      ref={it}
      className="fixed z-50"
      // Not on show until it is known where it goes: but there, so that what is written
      // in can take the caret as it comes.
      style={at ?? { left: 0, top: 0, opacity: 0, pointerEvents: "none" }}
    >
      {children}
    </div>,
    document.body
  )
}

/**
 * What quoting is done with, in the conversation `panel` shows: the button that comes up
 * by words that are selected, and the box in which something is said of them.
 */
export function Quoting({
  panel,
}: {
  panel: React.RefObject<HTMLElement | null>
}) {
  const quoting = useStore((state) => state.quoting)
  const quote = useStore((state) => state.quote)
  // what was said before of words already kept, which is what is carried on from
  const said = useStore((state) =>
    state.quoting?.id && state.activeId
      ? state.quotes[state.activeId]?.find(
          (one) => one.id === state.quoting?.id
        )?.text
      : undefined
  )
  const [offered, setOffered] = React.useState<{
    words: string
    range: Range
  } | null>(null)
  // where the words being quoted are, for as long as the box is by them
  const quoted = React.useRef<Range | null>(null)

  React.useEffect(() => {
    // looked at once the pointer is let go: what is selected is still being made until then
    const look = () =>
      setTimeout(() => setOffered(panel.current ? picked(panel.current) : null))
    const gone = () => {
      if (document.getSelection()?.isCollapsed ?? true) setOffered(null)
    }
    document.addEventListener("pointerup", look)
    document.addEventListener("selectionchange", gone)
    return () => {
      document.removeEventListener("pointerup", look)
      document.removeEventListener("selectionchange", gone)
    }
  }, [panel])

  React.useEffect(
    () => () => {
      light(null)
      useStore.getState().quote(null)
    },
    []
  )
  const fresh = quoting !== null && quoting.id === null
  React.useEffect(() => {
    if (!fresh) return
    light(quoted.current)
    return () => light(null)
  }, [fresh, quoting?.quote])

  const range = offered?.range
  const byButton = React.useCallback(
    // by the first line of them, where the eye is when they have just been picked out
    () => range?.getClientRects()[0] ?? range?.getBoundingClientRect() ?? null,
    [range]
  )
  const id = quoting?.id
  const byBox = React.useCallback(() => {
    // words already kept are on the message box, as a chip
    if (typeof id === "string")
      return (
        document
          .querySelector(`[data-quote="${id}"]`)
          ?.getBoundingClientRect() ?? null
      )
    const words = quoted.current?.getBoundingClientRect()
    // (words that are no longer there, an answer having been drawn again, have no place)
    return words && words.width + words.height > 0 ? words : null
  }, [id])

  return (
    <>
      {quoting && (
        <Beside
          place={byBox}
          within={panel}
          // under the words, which are then still to be read: or over their chip
          sooner={quoting.id === null ? "under" : "over"}
        >
          {/* (with the room its way out takes over its top corner) */}
          <div style={{ paddingTop: WRITING_OVER }}>
            <Writing
              key={quoting.id ?? quoting.quote}
              label={
                <>
                  <QuoteIcon data-icon="inline-start" className="shrink-0" />
                  <span className="min-w-0 truncate">
                    {inLine(quoting.quote)}
                  </span>
                </>
              }
              from={said}
              placeholder="What do you say to this?"
              // (the words alone are something to send: the message can say the rest)
              bare
              solid
              onKeep={(text, now) => {
                const { keepQuote, send } = useStore.getState()
                if (keepQuote(text) && now) send()
              }}
              onCancel={() => quote(null)}
            />
          </div>
        </Beside>
      )}
      {offered && (
        <Beside place={byButton} within={panel} sooner="over">
          <button
            type="button"
            // (a press here is not one that lets go of what is selected)
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              quoted.current = offered.range
              quote({ quote: offered.words })
              setOffered(null)
            }}
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-2.5 text-xs font-medium whitespace-nowrap text-background shadow-md ring-1 ring-background/25 outline-none hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)_15%)]"
          >
            <QuoteIcon className="size-3.5" />
            Quote
          </button>
        </Beside>
      )}
    </>
  )
}
