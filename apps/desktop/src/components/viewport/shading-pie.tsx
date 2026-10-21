// How the model is drawn - solid, glass, pattern, wireframe or outline - chosen the way
// Blender has it chosen. Z brings the choices up round the pointer. Held, a flick towards one and letting
// go of the key takes it; tapped, they stay up to be clicked. A choice is pointed at by
// direction, not by getting the pointer onto it.
import * as React from "react"
import { cn } from "cn"

import {
  GlassIcon,
  OutlineIcon,
  PatternIcon,
  SolidIcon,
  WireframeIcon,
} from "@/components/icons"
import { spokenFor } from "@/lib/keys"
import { useStore, type DisplayMode } from "@/lib/store"

// where each choice sits, in degrees anticlockwise from the right: evenly, all the way
// round, with solid at the top
const CHOICES: {
  mode: DisplayMode
  label: string
  icon: React.ReactNode
  at: number
}[] = [
  { mode: "solid", label: "Solid", icon: <SolidIcon />, at: 90 },
  { mode: "glass", label: "Glass", icon: <GlassIcon />, at: 18 },
  { mode: "pattern", label: "Pattern", icon: <PatternIcon />, at: -54 },
  { mode: "outline", label: "Outline", icon: <OutlineIcon />, at: 234 },
  { mode: "wireframe", label: "Wireframe", icon: <WireframeIcon />, at: 162 },
]

/** How far the choices sit from the pointer, in pixels, and how big each is across. */
const RADIUS = 62
const SIZE = 48
/** How far the pointer has to go, in pixels, before it points at anything. */
const THRESHOLD = 12
/** A press shorter than this, in ms, is a tap. */
const TAP = 200
/** The ring the pointer starts in, and the arc on it that shows which way it has gone. */
const RING = { radius: 23, width: 4, arc: 64 }
/** How far under the pointer the name of a choice is: clear of the lowest of them. */
const NAMED =
  Math.max(
    ...CHOICES.map(({ at }) => -RADIUS * Math.sin((at * Math.PI) / 180))
  ) +
  SIZE / 2 +
  10
/** How near the edges of the window the menu may be drawn: it has to fit. */
const ROOM = { side: 90, above: 100, below: NAMED + 28 }

type Point = { x: number; y: number }

/** Which way one point is from another, in degrees anticlockwise from the right. */
const bearing = (from: Point, to: Point) =>
  (Math.atan2(from.y - to.y, to.x - from.x) * 180) / Math.PI

/**
 * The choice a pointer that started at `from` and is now at `to` points at: the nearest
 * round the circle, whichever way it has gone.
 */
function pointedAt(from: Point, to: Point): DisplayMode | null {
  if (Math.hypot(to.x - from.x, to.y - from.y) < THRESHOLD) return null
  const way = bearing(from, to)
  // how far round from each choice, the short way
  const off = (at: number) => Math.abs(((way - at + 540) % 360) - 180)
  return CHOICES.reduce((a, b) => (off(b.at) < off(a.at) ? b : a)).mode
}

type Shown = {
  /** where it is drawn */
  at: Point
  /** where the pointer was when it came up: directions are measured from here */
  from: Point
}

export function ShadingPie({
  enabled,
  tap,
}: {
  enabled: boolean
  /**
   * What a quick tap of Z does instead, while the key has another meaning. The menu then
   * waits to see whether the key is held, or the pointer moves, before it comes up.
   */
  tap: (() => void) | null
}) {
  const current = useStore((state) => state.view.mode)
  const [shown, setShown] = React.useState<Shown | null>(null)
  const [pointer, setPointer] = React.useState<Point>({ x: 0, y: 0 })
  /** what the menu does when it is clicked on, or dismissed: set while it is up */
  const menu = React.useRef<{
    click: (on: DisplayMode | null) => void
    dismiss: () => void
  } | null>(null)

  const onTap = React.useRef(tap)
  React.useEffect(() => {
    onTap.current = tap
  }, [tap])

  React.useEffect(() => {
    if (!enabled) return
    let last: Point = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    /** Z is down: since when, where the pointer was, and what is waiting to see */
    let down: { since: number; from: Point; wait: number | null } | null = null
    let up: Shown | null = null

    const close = () => {
      if (down?.wait) window.clearTimeout(down.wait)
      down = null
      up = null
      menu.current = null
      setShown(null)
    }
    const choose = (mode: DisplayMode) => {
      useStore.getState().setView({ mode })
      close()
    }
    const show = () => {
      if (!down || up) return
      if (down.wait) window.clearTimeout(down.wait)
      down.wait = null
      const { from } = down
      const fit = (value: number, low: number, high: number) =>
        Math.min(Math.max(value, low), Math.max(low, high))
      up = {
        from,
        at: {
          x: fit(from.x, ROOM.side, window.innerWidth - ROOM.side),
          y: fit(from.y, ROOM.above, window.innerHeight - ROOM.below),
        },
      }
      menu.current = {
        click: (on) => {
          const mode = on ?? (up ? pointedAt(up.from, last) : null)
          if (mode) choose(mode)
          else close()
        },
        dismiss: close,
      }
      setPointer(last)
      setShown(up)
    }

    const keydown = (event: KeyboardEvent) => {
      const z = event.key.toLowerCase() === "z"
      if (up) {
        if (event.metaKey || event.ctrlKey) return
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat && (z || event.key === "Escape")) close()
        return
      }
      const plain =
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
      if (!z || !plain || spokenFor(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat || down) return
      down = { since: performance.now(), from: last, wait: null }
      if (onTap.current) down.wait = window.setTimeout(show, TAP)
      else show()
    }
    const keyup = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !down) return
      const held = performance.now() - down.since
      if (!up) {
        // let go before the menu came up: a tap, where a tap means something else
        close()
        onTap.current?.()
        return
      }
      const mode = pointedAt(up.from, last)
      if (mode) choose(mode)
      // a tap leaves it up to be clicked; a hold that has gone nowhere takes nothing
      else if (held < TAP) down = null
      else close()
    }
    const move = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY }
      if (down && !up) {
        const { from } = down
        if (Math.hypot(last.x - from.x, last.y - from.y) >= THRESHOLD) show()
      }
      if (up) setPointer(last)
    }

    // capturing: Z and Esc are taken here before anything else in the window hears them
    window.addEventListener("keydown", keydown, true)
    window.addEventListener("keyup", keyup, true)
    window.addEventListener("pointermove", move, true)
    window.addEventListener("blur", close)
    return () => {
      window.removeEventListener("keydown", keydown, true)
      window.removeEventListener("keyup", keyup, true)
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("blur", close)
      close()
    }
  }, [enabled])

  if (!shown) return null

  const pointed = pointedAt(shown.from, pointer)
  const moved =
    Math.hypot(pointer.x - shown.from.x, pointer.y - shown.from.y) >= 2
  const round = 2 * Math.PI * RING.radius
  const arc = (RING.arc / 360) * round
  const named = CHOICES.find((choice) => choice.mode === (pointed ?? current))

  return (
    // over everything, so that a click anywhere is the menu's and not the model's
    <div
      className="fixed inset-0 z-50"
      onClick={(event) => {
        const on = (event.target as Element)
          .closest("[data-shading]")
          ?.getAttribute("data-shading")
        menu.current?.click((on as DisplayMode | undefined) ?? null)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        menu.current?.dismiss()
      }}
    >
      <div
        role="menu"
        aria-label="Shading"
        className="absolute animate-in duration-100 zoom-in-90 fade-in"
        style={{ left: shown.at.x, top: shown.at.y }}
      >
        <svg
          // with room round the ring for the width of its line
          viewBox="-28 -28 56 56"
          className="absolute size-14 -translate-1/2"
          aria-hidden
        >
          {/* a dark ring under the pale one, so it shows over a pale part too */}
          <circle
            r={RING.radius}
            fill="none"
            strokeWidth={RING.width + 1.5}
            className="stroke-background/70"
          />
          <circle
            r={RING.radius}
            fill="none"
            strokeWidth={RING.width}
            className="stroke-foreground/20"
          />
          {moved && (
            <circle
              r={RING.radius}
              fill="none"
              strokeWidth={RING.width}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${round - arc}`}
              // drawn clockwise from the right: turn it to straddle the pointer's way
              transform={`rotate(${-bearing(shown.from, pointer) - RING.arc / 2})`}
              className="stroke-foreground/80"
            />
          )}
        </svg>
        {CHOICES.map(({ mode, label, icon, at }) => (
          <div
            key={mode}
            role="menuitemradio"
            aria-checked={mode === current}
            aria-label={label}
            data-shading={mode}
            className={cn(
              "glass absolute flex -translate-1/2 items-center justify-center rounded-full bg-background/60 shadow-sm ring-1 ring-foreground/10 transition-[background-color,box-shadow,scale] [&_svg]:size-5",
              mode === current && "bg-primary text-primary-foreground",
              mode === pointed && "scale-105 ring-2 ring-foreground/70",
              mode === pointed && mode !== current && "bg-foreground/15"
            )}
            style={{
              width: SIZE,
              height: SIZE,
              left: RADIUS * Math.cos((at * Math.PI) / 180),
              top: -RADIUS * Math.sin((at * Math.PI) / 180),
            }}
          >
            {icon}
          </div>
        ))}
        {/* the icons alone do not say what they are: the one pointed at is named, and
            otherwise the one in use */}
        <span
          className={cn(
            "glass absolute -translate-x-1/2 rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-foreground/10",
            pointed ? "text-foreground" : "text-muted-foreground"
          )}
          style={{ top: NAMED }}
        >
          {named?.label}
        </span>
      </div>
    </div>
  )
}
