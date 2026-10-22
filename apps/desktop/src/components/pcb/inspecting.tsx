// What is said over a board drawn as it is made of what the pointer is over, as
// tscircuit's own viewer says it (see inspect.ts): a pad, boxed, with the names its pin
// has over it; a hole through the board, with how big it is drilled; a trace, gone over,
// with how long it is and what it is; and with a pad, a hole or a part, the box the part
// takes and, where it is placed by the board or a group of parts, how far from that,
// along and up, as dashed lines from there to where it is put. A hole of the board's own
// is boxed and measured so itself. All of it at the size it is read at, however near the
// board is seen.
import * as React from "react"

import type { Circuit } from "./boards"
import {
  cornersOf,
  holeSaid,
  mmSaid,
  type Box,
  type Part,
  type Spot,
  type Under,
} from "./inspect"
import { partsOf } from "./parts"
import type { placeOf } from "./place"

/**
 * How a drawing is seen: the middle of what is shown and its units to the view's pixel
 * (see board-mode.tsx), how big the view is, px, and how the board's millimetres lie in
 * the drawing.
 */
export type Seen = {
  at: { x: number; y: number; scale: number }
  width: number
  height: number
  place: NonNullable<ReturnType<typeof placeOf>>
}

/** Where a place on the board is in the view, px from its top left. */
export const inView = (seen: Seen, { x, y }: Spot): [number, number] => [
  (seen.place.a * x + seen.place.e - seen.at.x) / seen.at.scale +
    seen.width / 2,
  (seen.place.d * y + seen.place.f - seen.at.y) / seen.at.scale +
    seen.height / 2,
]

/** And where on the board a place in the view is. */
export const onBoardAt = (seen: Seen, px: number, py: number): Spot => ({
  x:
    ((px - seen.width / 2) * seen.at.scale + seen.at.x - seen.place.e) /
    seen.place.a,
  y:
    ((py - seen.height / 2) * seen.at.scale + seen.at.y - seen.place.f) /
    seen.place.d,
})

/** How many of the view's pixels a millimetre of the board is. */
export const pixelsPerMm = (seen: Seen) =>
  Math.abs(seen.place.a) / seen.at.scale

/** The colour of the place a part is put, as tscircuit's viewer marks it. */
const PUT = "#66ccff"
/** How far out from a pad its box is drawn, px. */
const PAD_OUT = 3
/** How long each dash of the lines is, and the gap after it, px. */
const DASHES = "4 3"

/** What is written over the board: small, plain, and seen on any ground. */
const MEASURE =
  "pointer-events-none absolute text-[11px] font-medium whitespace-nowrap text-foreground tabular-nums [text-shadow:0_0_3px_var(--background),0_0_2px_var(--background)]"
/** And what is said of a pad or a trace, in a label of its own. */
const LABEL =
  "pointer-events-none absolute max-w-72 rounded-lg bg-foreground px-2.5 py-1.5 text-center text-xs font-medium text-balance text-background shadow-md ring-1 ring-background/25"

/** What the pointer is over on a board, said over it. */
export function Inspecting({
  under,
  pointer,
  seen,
  circuit,
}: {
  under: Under
  /** where the pointer is, px from the view's top left */
  pointer: [number, number]
  seen: Seen
  circuit: Circuit
}) {
  const titles = React.useMemo(() => partsOf(circuit), [circuit])
  const part = under.kind === "trace" ? null : under.part
  const perMm = pixelsPerMm(seen)
  /** the pad or the hole pointed at, and its corners a little way out from it */
  const shape =
    under.kind === "pad" ? under.pad : under.kind === "hole" ? under.hole : null
  const corners = shape && cornersOf(shape, PAD_OUT / perMm)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 size-full">
        {part && <PartLines part={part} seen={seen} />}
        {shape?.round ? (
          <circle
            cx={inView(seen, shape)[0]}
            cy={inView(seen, shape)[1]}
            r={(shape.w / 2) * perMm + PAD_OUT}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
        ) : (
          corners && (
            <polygon
              points={corners
                .map((corner) => inView(seen, corner).join(","))
                .join(" ")}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={1.5}
            />
          )
        )}
        {under.kind === "trace" && (
          <polyline
            points={under.trace.points
              .map((point) => inView(seen, point).join(","))
              .join(" ")}
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.4}
            strokeWidth={
              Math.max(...under.trace.points.map((point) => point.width)) *
                perMm +
              4
            }
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {part && <PartMeasures part={part} seen={seen} />}
      {corners && (under.kind !== "pad" || under.pad.names.length > 0) && (
        <PadLabel corners={corners} seen={seen} pointer={pointer}>
          {under.kind === "pad"
            ? under.pad.names.join(", ")
            : under.kind === "hole" && holeSaid(under.hole)}
        </PadLabel>
      )}
      {under.kind === "trace" && (
        <div
          className={LABEL}
          style={{ left: pointer[0] + 14, top: pointer[1] + 14 }}
        >
          {under.trace.name && <div>{under.trace.name}</div>}
          <div className={under.trace.name ? "text-background/65" : ""}>
            {mmSaid(under.trace.length)}
          </div>
        </div>
      )}
      {under.kind === "part" && under.part.name && (
        <div
          className={LABEL}
          style={{ left: pointer[0] + 14, top: pointer[1] + 14 }}
        >
          {[
            under.part.name,
            titles.find((one) => one.names.includes(under.part.name!))?.title,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
    </div>
  )
}

/** The box round a part, in the view. */
function boxInView(seen: Seen, box: Box) {
  const [x1, y1] = inView(seen, { x: box.x - box.w / 2, y: box.y - box.h / 2 })
  const [x2, y2] = inView(seen, { x: box.x + box.w / 2, y: box.y + box.h / 2 })
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

/** Where a part is placed from, and where it is put, in the view: null for one placed by nothing. */
function placedInView(seen: Seen, part: Part) {
  if (!part.anchor || !part.offset) return null
  const from = inView(seen, part.anchor)
  const to = inView(seen, {
    x: part.anchor.x + part.offset[0],
    y: part.anchor.y + part.offset[1],
  })
  return { from, to }
}

/**
 * A part's box, dashed, and where it is placed by: a cross, with a line along from it
 * and up to the place the part is put, a dot.
 */
function PartLines({ part, seen }: { part: Part; seen: Seen }) {
  const placed = placedInView(seen, part)
  const line = {
    stroke: "var(--foreground)",
    strokeWidth: 1.25,
    strokeDasharray: DASHES,
    fill: "none",
  }
  return (
    <g>
      <rect {...boxInView(seen, part.box)} {...line} />
      {placed && (
        <>
          <polyline
            points={`${placed.from[0]},${placed.from[1]} ${placed.to[0]},${placed.from[1]} ${placed.to[0]},${placed.to[1]}`}
            {...line}
          />
          <path
            d={`M${placed.from[0] - 6} ${placed.from[1]}h12M${placed.from[0]} ${placed.from[1] - 6}v12`}
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
          <circle
            cx={placed.to[0]}
            cy={placed.to[1]}
            r={3.5}
            fill={PUT}
            stroke="var(--foreground)"
            strokeWidth={1}
          />
        </>
      )}
    </g>
  )
}

/**
 * How far a part is put from what it is placed by, along and up, as it was said where
 * it is placed: each over the middle of its line, on the side of it the part is not.
 */
function PartMeasures({ part, seen }: { part: Part; seen: Seen }) {
  const placed = placedInView(seen, part)
  if (!placed || !part.offset) return null
  const [along, up] = part.offset.map((value) => Math.round(value * 100))
  const { from, to } = placed
  const above = to[1] < from[1]
  const right = to[0] > from[0]
  return (
    <>
      {along !== 0 && (
        <div
          className={MEASURE}
          style={{
            left: (from[0] + to[0]) / 2,
            top: from[1],
            transform: above
              ? "translate(-50%, calc(-100% - 3px))"
              : "translate(-50%, 3px)",
          }}
        >
          {mmSaid(part.offset[0])}
        </div>
      )}
      {up !== 0 && (
        <div
          className={MEASURE}
          style={{
            left: to[0],
            top: (from[1] + to[1]) / 2,
            transform: right
              ? "translate(6px, -50%)"
              : "translate(calc(-100% - 6px), -50%)",
          }}
        >
          {mmSaid(part.offset[1])}
        </div>
      )}
    </>
  )
}

/** How much room a label over a pad wants over it, px: or it goes by the pointer. */
const LABEL_ROOM = 72

/**
 * What a pad is called, over the top of its box: or, where the pad is seen so near that
 * its top is out of the view, beside the pointer.
 */
function PadLabel({
  corners,
  seen,
  pointer,
  children,
}: {
  corners: Spot[]
  seen: Seen
  pointer: [number, number]
  children: React.ReactNode
}) {
  const inThe = corners.map((corner) => inView(seen, corner))
  const x = inThe.reduce((sum, [cx]) => sum + cx, 0) / inThe.length
  const top = Math.min(...inThe.map(([, cy]) => cy))
  return (
    <div
      className={LABEL}
      style={
        top < LABEL_ROOM
          ? { left: pointer[0] + 14, top: pointer[1] + 14 }
          : { left: x, top: top - 8, transform: "translate(-50%, -100%)" }
      }
    >
      {children}
    </div>
  )
}
