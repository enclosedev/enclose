import * as React from "react"
import { cn } from "cn"
import { BookOpenIcon, BoxIcon, SlashIcon, type LucideIcon } from "lucide-react"

import type { Calling } from "@/lib/mentions"

/** One thing a name being written could be: what goes into the message, and what is shown. */
export type Choice = {
  /** what is written after the mark: a part's id, a skill's or a command's name */
  name: string
  /** what else it is found by, and shown as instead: a part's label */
  also?: string
  detail: string
  /** where a picture from the inspiration board is shown from, for one that is one */
  picture?: string
}

const WHAT: Record<Calling, { title: string; none: string; icon: LucideIcon }> =
  {
    part: {
      title: "Parts",
      none: "The model has no parts yet.",
      icon: BoxIcon,
    },
    skill: {
      title: "Skills",
      none: "Claude Code has no skills installed.",
      icon: BookOpenIcon,
    },
    command: {
      title: "Commands",
      none: "Claude Code has no commands to offer.",
      icon: SlashIcon,
    },
  }

/**
 * What a name being written in the message could be, as a list over the message box.
 * The keys stay with the writing: the box moves through the list and chooses from it,
 * and a press here chooses without taking the caret out of the box.
 */
export function MentionMenu({
  kind,
  choices,
  any,
  asking,
  active,
  onActive,
  onPick,
}: {
  kind: Calling
  /** the ones that what has been written could be */
  choices: Choice[]
  /** there are some of this kind at all, whatever has been written */
  any: boolean
  /** Claude Code is still being asked what there is */
  asking: boolean
  active: number
  onActive: (index: number) => void
  onPick: (choice: Choice) => void
}) {
  const { title, none, icon: Icon } = WHAT[kind]
  const list = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    list.current
      ?.querySelector("[aria-selected=true]")
      ?.scrollIntoView({ block: "nearest" })
  }, [active, choices])

  // a picture of the inspiration board's is in the list before the parts, and is shown
  // as one: big enough to tell which it is
  const pictures = choices.filter((choice) => choice.picture)
  const rest = choices.filter((choice) => !choice.picture)
  const option = (choice: Choice, index: number, className: string) => ({
    role: "option",
    "aria-selected": index === active,
    onMouseMove: () => index !== active && onActive(index),
    onClick: () => onPick(choice),
    className,
  })

  return (
    <div
      role="listbox"
      aria-label={title}
      className="absolute inset-x-0 bottom-full z-20 mb-2 flex max-h-96 flex-col rounded-2xl bg-popover p-1 text-popover-foreground shadow-2xl ring-1 ring-foreground/10"
      // a press here is not to take the caret out of the message
      onMouseDown={(event) => event.preventDefault()}
    >
      <div ref={list} className="min-h-0 overflow-y-auto">
        {pictures.length > 0 && (
          <>
            <div className="px-3 pt-1.5 pb-1 text-xs text-muted-foreground">
              Inspiration board
            </div>
            <PictureRow>
              {pictures.map((choice, index) => (
                <div
                  key={choice.name}
                  {...option(
                    choice,
                    index,
                    cn(
                      "shrink-0 cursor-default rounded-xl p-0.5 ring-2 ring-transparent transition-shadow",
                      index === active && "ring-foreground/70"
                    )
                  )}
                  title={choice.also ?? choice.name}
                >
                  <img
                    src={choice.picture}
                    alt={choice.also ?? choice.name}
                    draggable={false}
                    decoding="async"
                    className="block size-20 rounded-[0.6rem] bg-foreground/5 object-cover"
                  />
                </div>
              ))}
            </PictureRow>
          </>
        )}
        {(rest.length > 0 || pictures.length === 0) && (
          <div className="px-3 pt-1.5 pb-1 text-xs text-muted-foreground">
            {title}
          </div>
        )}
        {rest.length === 0 && pictures.length === 0 ? (
          <div className="px-3 pt-1 pb-2 text-sm text-muted-foreground">
            {asking ? (
              <span className="shimmer shimmer-color-foreground">
                Asking Claude Code what it has
              </span>
            ) : any ? (
              "Nothing by that name."
            ) : (
              none
            )}
          </div>
        ) : (
          rest.map((choice, at) => (
            <div
              key={choice.name}
              {...option(
                choice,
                pictures.length + at,
                cn(
                  "flex cursor-default items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm",
                  pictures.length + at === active &&
                    "bg-accent text-accent-foreground"
                )
              )}
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-[60%] shrink-0 truncate">
                {choice.also ?? choice.name}
              </span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {choice.detail}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/** How far in from an edge of the row of pictures it fades out, where there are more past it, px. */
const FADE = 40

/**
 * The pictures in one row, which goes sideways where there are more than fit: it fades
 * out at either end where there are more past it, and a wheel turned over it goes along
 * it.
 */
function PictureRow({ children }: { children: React.ReactNode }) {
  const row = React.useRef<HTMLDivElement>(null)
  const [more, setMore] = React.useState({ before: false, after: false })
  const look = React.useCallback(() => {
    const at = row.current
    if (!at) return
    const before = at.scrollLeft > 1
    const after = at.scrollLeft + at.clientWidth < at.scrollWidth - 1
    setMore((was) =>
      was.before === before && was.after === after ? was : { before, after }
    )
  }, [])
  React.useLayoutEffect(look, [look, children])
  React.useEffect(() => {
    const at = row.current
    if (!at) return
    const sized = new ResizeObserver(look)
    sized.observe(at)
    // (a wheel that turns up and down goes along it: a trackpad already goes sideways)
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      if (at.scrollWidth <= at.clientWidth) return
      event.preventDefault()
      at.scrollLeft += event.deltaY
    }
    at.addEventListener("wheel", wheel, { passive: false })
    return () => {
      sized.disconnect()
      at.removeEventListener("wheel", wheel)
    }
  }, [look])
  const mask = `linear-gradient(to right, ${more.before ? "transparent" : "black"}, black ${FADE}px, black calc(100% - ${FADE}px), ${more.after ? "transparent" : "black"})`
  return (
    <div
      ref={row}
      onScroll={look}
      className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-2 pt-0.5 pb-2"
      style={{ maskImage: mask }}
    >
      {children}
    </div>
  )
}
