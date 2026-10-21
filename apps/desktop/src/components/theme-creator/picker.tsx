// A colour picked by hand: how much colour it has and how light it is, across a square
// of its hue, and the hue along a bar under that; or its "#rrggbb", typed.
import * as React from "react"
import { cn } from "cn"

import { Input } from "@/components/ui/input"

/** A colour as its hue (0 to 360), how much colour it has and how light it is (0 to 1). */
type Hsv = { h: number; s: number; v: number }

const HEX = /^#?([0-9a-f]{6})$/i

function hsvOf(hex: string): Hsv {
  const found = HEX.exec(hex.trim())
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
  className,
}: {
  /** "#rrggbb" */
  value: string
  onChange: (value: string) => void
  /** what the colour is of, for those who hear the page read */
  label: string
  className?: string
}) {
  // Kept as hue, colour and lightness, so that what has no colour, or no light, keeps the
  // hue it had: from the colour it is given only when that is not the one it gave.
  const [hsv, setHsv] = React.useState(() => hsvOf(value))
  const [typed, setTyped] = React.useState<string | null>(null)
  if (hexOf(hsv) !== value.toLowerCase() && HEX.test(value)) {
    setHsv(hsvOf(value))
  }
  // a colour typed whole that is not the colour any more was changed from elsewhere
  const typedWhole = typed === null ? null : HEX.exec(typed.trim())
  if (typedWhole && `#${typedWhole[1].toLowerCase()}` !== value.toLowerCase())
    setTyped(null)
  const change = (next: Hsv) => {
    setHsv(next)
    onChange(hexOf(next))
  }
  const pure = hexOf({ h: hsv.h, s: 1, v: 1 })
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
            background: value,
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
      <Input
        aria-label={`${label}, as #rrggbb`}
        spellCheck={false}
        value={typed ?? value}
        onChange={(event) => {
          const text = event.target.value
          setTyped(text)
          const found = HEX.exec(text.trim())
          if (found) onChange(`#${found[1].toLowerCase()}`)
        }}
        onBlur={() => setTyped(null)}
        className="h-7 font-mono text-xs uppercase select-text"
      />
    </div>
  )
}
