import * as React from "react"
import { cn } from "cn"

import {
  beads,
  choreograph,
  ends,
  EXTENT,
  letter,
  LETTER_WIDTH,
  LOOP,
  MARK,
  REST,
  rests,
  viewAt,
  type Axis,
  type View,
} from "@/lib/mark"

/** Where the mark rests between its moves, the last of them being where it began. */
const RESTS = rests(REST, choreograph(LOOP.seed, LOOP.moves))

/** Where the mark is seen from, as time passes: it is turned over like a cube in the hand. */
function useTurning(moving: boolean): View {
  const [view, setView] = React.useState(REST)
  React.useEffect(() => {
    if (!moving || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return
    let frame = 0
    const started = performance.now()
    const draw = (now: number) => {
      setView(viewAt(RESTS, (now - started) / 1000, LOOP.turn, LOOP.hold))
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      setView(REST)
    }
  }, [moving])
  return view
}

/** How long the bar of a minus is, and how far it stands from its letter: shares of the height. */
const MINUS = { bar: 0.4, gap: 0.22 }

/**
 * An axis' letter as the brand draws it, `height` tall with its middle at (x, y): for
 * wherever the axes are named. With a `minus` before it, it names the end an axis points
 * away from.
 */
export function Letter({
  axis,
  x,
  y,
  height,
  minus = false,
  rise = MARK.labelRise,
  ...props
}: {
  axis: Axis
  x: number
  y: number
  height: number
  minus?: boolean
  /** how long the uprights its diagonals start and end with are, as a share of the height */
  rise?: number
} & Omit<React.SVGProps<SVGPathElement>, "x" | "y" | "height">) {
  const stroke = MARK.labelWeight * height
  const bar = minus ? MINUS.bar * height : 0
  const before = minus ? bar + MINUS.gap * height : 0
  const left = x - (before + LETTER_WIDTH * height) / 2
  return (
    <path
      d={
        (minus ? `M${left} ${y}h${bar}` : "") +
        letter(axis, x + before / 2, y, height, stroke, rise * height)
      }
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      {...props}
    />
  )
}

/**
 * The mark drawn in a square `size` px a side, seen from `view`: each axis a line to the
 * end it points to and a row of dots to the end it points away from, with a dot at both.
 */
function Drawn({
  view,
  size,
  className,
}: {
  view: View
  size: number
  className?: string
}) {
  return (
    <svg
      viewBox={`${-EXTENT} ${-EXTENT} ${2 * EXTENT} ${2 * EXTENT}`}
      width={size}
      height={size}
      aria-hidden
      fill="currentColor"
      className={cn("shrink-0", className)}
    >
      {ends(view).map(({ axis, sign, x, y }) => {
        const cx = x * MARK.length
        const cy = y * MARK.length
        // how much of its length the axis keeps on the page
        const seen = Math.hypot(x, y)
        return (
          <g key={`${axis}${sign > 0 ? "+" : "-"}`}>
            {sign > 0 ? (
              <line
                x2={cx}
                y2={cy}
                stroke="currentColor"
                strokeWidth={MARK.weight}
                strokeLinecap="round"
              />
            ) : (
              beads(seen).map((far, index) => (
                <circle
                  key={index}
                  cx={(x / seen) * far}
                  cy={(y / seen) * far}
                  r={MARK.weight / 2}
                />
              ))
            )}
            <circle cx={cx} cy={cy} r={MARK.dot} />
          </g>
        )
      })}
    </svg>
  )
}

type MarkProps = {
  /** how big the square it turns in is, px: at rest it is narrower (`RESTING_WIDTH`) */
  size?: number
  className?: string
}

/**
 * The Enclose mark: the model's three axes as a camera sees them, each a line to the end
 * it points to and a row of dots to the end it points away from, with a dot at both. It
 * is drawn in the colour of the words around it. `moving` turns it over and over, for as
 * long as something is being waited for.
 */
export function Mark({
  moving = false,
  size = 64,
  className,
}: MarkProps & { moving?: boolean }) {
  const view = useTurning(moving)
  return <Drawn view={view} size={size} className={className} />
}

/**
 * The mark as the app's name goes with it: the one on its icon, still, where the app
 * says who it is and nothing is waited for.
 */
export function Logo({ size = 64, className }: MarkProps) {
  return <Drawn view={REST} size={size} className={className} />
}
