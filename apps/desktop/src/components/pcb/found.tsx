// What was looked for on a board drawn as it is made, lit on it (see finding.ts): the
// rest of the board goes back into its ground, and what was found stays as it is drawn.
// A part is boxed, and a pin boxed as a pad pointed at is, each with its name over it;
// a net is its pads, traces and vias, as they are.
import * as React from "react"

import { ofNet, type Found } from "./finding"
import {
  cornersOf,
  type Box,
  type Inspected,
  type Pad,
  type Spot,
} from "./inspect"
import { inView, pixelsPerMm, type Seen } from "./inspecting"

/** How far back into the ground the rest of the board goes, 0 to 1. */
const BACK = 0.72
/** How far out from what was found the board is left as it is, px. */
const AROUND = 3
/** What a part or a pin found is called by, over it. */
const NAME =
  "pointer-events-none absolute rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-background shadow-sm"

/** Each thing found, as it is drawn over the board: where it is, and what it is called. */
type Lit =
  | { kind: "box"; box: Box; name: string | null }
  | { kind: "pad"; pad: Pad; name: string | null }
  | { kind: "line"; points: Spot[]; width: number }
  | { kind: "dot"; at: Spot; w: number }

/** The corners of a box, a little way out from it (`out`, mm). */
const corners = (box: Box, out = 0) => cornersOf({ ...box, turn: 0 }, out)

/** The board left as it is round each: and boxed, as one pointed at is. */
const PAINT = {
  cut: { fill: "black" },
  boxed: { fill: "none", stroke: "var(--foreground)", strokeWidth: 1.5 },
}

function litOf(found: Found[], board: Inspected): Lit[] {
  return found.flatMap(({ thing, said }): Lit[] => {
    if (thing.kind === "part")
      return [{ kind: "box", box: thing.part.box, name: said }]
    if (thing.kind === "pin")
      return [{ kind: "pad", pad: thing.pad, name: said }]
    const { pads, traces, vias } = ofNet(board, thing.joined)
    return [
      ...traces.map((trace): Lit => ({
        kind: "line",
        points: trace.points,
        width: Math.max(...trace.points.map((point) => point.width)),
      })),
      ...vias.map((via): Lit => ({ kind: "dot", at: via, w: via.w })),
      ...pads.map((pad): Lit => ({ kind: "pad", pad, name: null })),
    ]
  })
}

/** What was found on a board, lit on it, as it is seen. */
export function Finding({
  found,
  board,
  seen,
  ground,
}: {
  found: Found[]
  board: Inspected
  seen: Seen
  /** the colour the board is drawn on, that the rest of it goes back into */
  ground: string
}) {
  const id = `found-${React.useId().replace(/[^\w-]/g, "")}`
  const lit = React.useMemo(() => litOf(found, board), [found, board])
  const perMm = pixelsPerMm(seen)
  const points = (spots: Spot[]) =>
    spots.map((spot) => inView(seen, spot).join(",")).join(" ")
  /** Each, in the view, a little way out from it: cut out of the ground, or boxed. */
  const shapeOf = (one: Lit, paint: keyof typeof PAINT) => {
    const { fill, ...stroke } = PAINT[paint]
    switch (one.kind) {
      case "box":
        return (
          <polygon
            points={points(corners(one.box, AROUND / perMm))}
            fill={fill}
            {...stroke}
          />
        )
      case "pad":
        return one.pad.round ? (
          <circle
            cx={inView(seen, one.pad)[0]}
            cy={inView(seen, one.pad)[1]}
            r={(one.pad.w / 2) * perMm + AROUND}
            fill={fill}
            {...stroke}
          />
        ) : (
          <polygon
            points={points(cornersOf(one.pad, AROUND / perMm))}
            fill={fill}
            {...stroke}
          />
        )
      case "line":
        return (
          <polyline
            points={points(one.points)}
            fill="none"
            stroke={fill}
            strokeWidth={one.width * perMm + AROUND * 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      case "dot":
        return (
          <circle
            cx={inView(seen, one.at)[0]}
            cy={inView(seen, one.at)[1]}
            r={(one.w / 2) * perMm + AROUND}
            fill={fill}
          />
        )
    }
  }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 size-full">
        <defs>
          <mask id={id}>
            <rect width="100%" height="100%" fill="white" />
            {lit.map((one, index) => (
              <React.Fragment key={index}>{shapeOf(one, "cut")}</React.Fragment>
            ))}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={ground}
          fillOpacity={BACK}
          mask={`url(#${id})`}
        />
        {/* a part or a pin found is boxed, as one pointed at is */}
        {lit.map(
          (one, index) =>
            (one.kind === "box" || one.kind === "pad") &&
            one.name !== null && (
              <React.Fragment key={index}>
                {shapeOf(one, "boxed")}
              </React.Fragment>
            )
        )}
      </svg>
      {lit.map((one, index) => {
        if ((one.kind !== "box" && one.kind !== "pad") || one.name === null)
          return null
        const spots = (
          one.kind === "box" ? corners(one.box) : cornersOf(one.pad)
        ).map((spot) => inView(seen, spot))
        const x = spots.reduce((sum, [sx]) => sum + sx, 0) / spots.length
        const top = Math.min(...spots.map(([, sy]) => sy)) - AROUND
        return (
          <div
            key={index}
            className={NAME}
            style={{
              left: x,
              top,
              transform: "translate(-50%, calc(-100% - 4px))",
            }}
          >
            {one.name}
          </div>
        )
      })}
    </div>
  )
}
