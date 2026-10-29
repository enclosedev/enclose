// A colour picked by hand: how much colour it has and how light it is, across a square
// of its hue, and the hue along a bar under that; or its "#rrggbb", typed. One that says
// how much of it shows as well has a bar for that under the hue's, and is "#rrggbbaa".
import * as React from "react"
import { cn } from "cn"

import { Input } from "@/components/ui/input"

/** A colour as its hue (0 to 360), how much colour it has and how light it is (0 to 1). */
type Hsv = { h: number; s: number; v: number }

const HEX = /^#?([0-9a-f]{6})$/i
/** And one with how much of it shows: all of it, where that is not said. */
const HEXA = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i

/** How much of a colour shows, 0 to 1, as "#rrggbbaa" says it: all of it, if it does not. */
function alphaOf(hex: string): number {
  const found = HEXA.exec(hex.trim())?.[2]
  return found === undefined ? 1 : parseInt(found, 16) / 255
}

/** A colour with how much of it shows, 0 to 1, after it. */
const withAlpha = (hex: string, alpha: number) =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`

function hsvOf(hex: string): Hsv {
  const found = HEXA.exec(hex.trim())
  const value = found ? parseInt(found[1], 16) : 0
  const [r, g, b] = [value >> 16, (value >> 8) & 255, value & 255].map(
    (part) => part / 255
  )
  const most = Math.max(r, g, b)
  const spread = most - Math.min(r, g, b)
  const sixth =
    spread === 0
      ? 0
      : most === r
        ? ((g - b) / spread + 6) % 6
        : most === g
          ? (b - r) / spread + 2
          : (r - g) / spread + 4
  return { h: sixth * 60, s: most === 0 ? 0 : spread / most, v: most }
}

function hexOf({ h, s, v }: Hsv): string {
  const at = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return `#${[at(5), at(3), at(1)]
    .map((part) =>
      Math.round(part * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

const within = (n: number) => Math.min(1, Math.max(0, n))

/** Where on something a pointer is, across it and down it, each 0 to 1. */
function placeOf(event: React.PointerEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect()
  return {
    x: within((event.clientX - box.left) / box.width),
    y: within((event.clientY - box.top) / box.height),
  }
}

/** Have something dragged on: where it is pressed, and wherever it is drawn to after. */
function dragging(to: (event: React.PointerEvent<HTMLElement>) => void) {
  return {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      event.currentTarget.setPointerCapture(event.pointerId)
      to(event)
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) to(event)
    },
  }
}

/** How far an arrow key moves a thumb, of the whole way; with Shift, ten times as far. */
const STEP = 0.01

export function ColourPicker({
  value,
  onChange,
  label,
  alpha: showing = false,
  className,
}: {
  /** "#rrggbb"; or, with `alpha`, "#rrggbbaa" */
  value: string
  onChange: (value: string) => void
  /** what the colour is of, for those who hear the page read */
  label: string
  /** how much of the colour shows is picked too */
  alpha?: boolean
  className?: string
}) {
  const pattern = showing ? HEXA : HEX
  // Kept as hue, colour and lightness, so that what has no colour, or no light, keeps the
  // hue it had: from the colour it is given only when that is not the one it gave.
  const [hsv, setHsv] = React.useState(() => hsvOf(value))
  const [alpha, setAlpha] = React.useState(() => alphaOf(value))
  const [typed, setTyped] = React.useState<string | null>(null)
  const given = (hsv: Hsv, alpha: number) =>
    showing ? withAlpha(hexOf(hsv), alpha) : hexOf(hsv)
  const said = (hex: string) =>
    showing ? withAlpha(hex.slice(0, 7), alphaOf(hex)) : hex
  if (given(hsv, alpha) !== said(value.toLowerCase()) && pattern.test(value)) {
    setHsv(hsvOf(value))
    setAlpha(alphaOf(value))
  }
  // a colour typed whole that is not the colour any more was changed from elsewhere
  const typedWhole = typed === null ? null : pattern.exec(typed.trim())
  if (
    typedWhole &&
    said(`#${typedWhole[0].replace("#", "").toLowerCase()}`) !==
      said(value.toLowerCase())
  )
    setTyped(null)
  const change = (next: Hsv, nextAlpha = alpha) => {
    setHsv(next)
    setAlpha(nextAlpha)
    onChange(given(next, nextAlpha))
  }
  const pure = hexOf({ h: hsv.h, s: 1, v: 1 })
  const solid = hexOf(hsv)
  const arrows =
    (move: (by: number, key: string) => Hsv | null) =>
    (event: React.KeyboardEvent) => {
      const next = move(event.shiftKey ? STEP * 10 : STEP, event.key)
      if (!next) return
      event.preventDefault()
      change(next)
    }

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${label}: how much colour, and how light`}
        aria-valuetext={`${Math.round(hsv.s * 100)}% colour, ${Math.round(hsv.v * 100)}% light`}
        className="relative aspect-[4/3] w-full cursor-crosshair touch-none rounded-lg ring-1 ring-foreground/10 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})`,
        }}
        {...dragging((event) => {
          const { x, y } = placeOf(event)
          change({ h: hsv.h, s: x, v: 1 - y })
        })}
        onKeyDown={arrows((by, key) =>
          key === "ArrowLeft"
            ? { ...hsv, s: within(hsv.s - by) }
            : key === "ArrowRight"
              ? { ...hsv, s: within(hsv.s + by) }
              : key === "ArrowUp"
                ? { ...hsv, v: within(hsv.v + by) }
                : key === "ArrowDown"
                  ? { ...hsv, v: within(hsv.v - by) }
                  : null
        )}
      >
        <span
          className="pointer-events-none absolute size-4 -translate-1/2 rounded-full shadow-sm ring-3 ring-white"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: solid,
          }}
        />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${label}: hue`}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        className="relative h-4 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={{
          background:
            "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
        {...dragging((event) => change({ ...hsv, h: placeOf(event).x * 360 }))}
        onKeyDown={arrows((by, key) =>
          key === "ArrowLeft" || key === "ArrowDown"
            ? { ...hsv, h: Math.max(0, hsv.h - by * 360) }
            : key === "ArrowRight" || key === "ArrowUp"
              ? { ...hsv, h: Math.min(360, hsv.h + by * 360) }
              : null
        )}
      >
        <span
          className="pointer-events-none absolute top-1/2 size-4 -translate-1/2 rounded-full shadow-sm ring-3 ring-white"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }}
        />
      </div>
      {showing && (
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${label}: how much of it shows`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(alpha * 100)}
          aria-valuetext={`${Math.round(alpha * 100)}%`}
          className="relative h-4 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          style={{
            // the colour from none of it to all, over squares that show through it
            background: `linear-gradient(to right, transparent, ${solid}), repeating-conic-gradient(#c8c8c8 0 25%, #ffffff 0 50%) 0 0 / 8px 8px`,
          }}
          {...dragging((event) => change(hsv, placeOf(event).x))}
          onKeyDown={(event) => {
            const by = event.shiftKey ? STEP * 10 : STEP
            const next =
              event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? within(alpha - by)
                : event.key === "ArrowRight" || event.key === "ArrowUp"
                  ? within(alpha + by)
                  : null
            if (next === null) return
            event.preventDefault()
            change(hsv, next)
          }}
        >
          <span
            className="pointer-events-none absolute top-1/2 size-4 -translate-1/2 rounded-full shadow-sm ring-3 ring-white"
            style={{ left: `${alpha * 100}%`, background: solid }}
          />
        </div>
      )}
      <Input
        aria-label={`${label}, as ${showing ? "#rrggbbaa" : "#rrggbb"}`}
        spellCheck={false}
        value={typed ?? value}
        onChange={(event) => {
          const text = event.target.value
          setTyped(text)
          const found = pattern.exec(text.trim())
          if (found)
            onChange(said(`#${found[0].replace("#", "").toLowerCase()}`))
        }}
        onBlur={() => setTyped(null)}
        className="h-7 font-mono text-xs uppercase select-text"
      />
    </div>
  )
}
