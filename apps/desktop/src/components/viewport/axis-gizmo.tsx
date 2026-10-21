import * as React from "react"
import * as THREE from "three"
import { cn } from "cn"

import { Letter } from "@/components/mark"
import { MARK } from "@/lib/mark"
import {
  AXES,
  UNIT,
  VIEWS,
  nearestAxis,
  type Axis,
  type Sign,
} from "@/lib/orient"
import { bridge, useOrientation } from "./bridge"

/** How far an axis reaches from the middle, in the widget's 100-unit square. */
const REACH = 31
const COLOR: Record<Axis, string> = {
  x: "var(--axis-x)",
  y: "var(--axis-y)",
  z: "var(--axis-z)",
}

type End = { axis: Axis; sign: Sign }

/**
 * The model's axes as the camera sees them, in the corner of the view. Click the end of
 * an axis to look at the model from there (again, for the opposite side); drag anywhere
 * on it to orbit.
 */
export function AxisGizmo({ className }: { className?: string }) {
  const turn = useOrientation()
  const [hot, setHot] = React.useState<string | null>(null)
  const drag = React.useRef<{
    x: number
    y: number
    moved: boolean
    end: End | null
  } | null>(null)

  const ends = AXES.flatMap((axis) =>
    ([1, -1] as Sign[]).map((sign) => {
      const seen = new THREE.Vector3(...UNIT[axis])
        .multiplyScalar(sign)
        .applyQuaternion(turn)
      return {
        axis,
        sign,
        key: `${axis}:${sign}`,
        x: seen.x * REACH,
        y: -seen.y * REACH,
        depth: seen.z,
      }
    })
  )
    // furthest first, so the nearer ends are drawn over them
    .sort((a, b) => a.depth - b.depth)

  const look = ({ axis, sign }: End) => {
    const now = bridge.eye ? nearestAxis(bridge.eye()) : null
    const there = now?.exact && now.axis === axis && now.sign === sign
    bridge.lookFrom?.(axis, there ? (-sign as Sign) : sign)
  }

  return (
    <svg
      viewBox="-50 -50 100 100"
      role="group"
      aria-label="View direction"
      className={cn(
        "pointer-events-auto size-22 touch-none rounded-full transition-colors select-none hover:bg-foreground/10",
        className
      )}
      onPointerDown={(event) => {
        // keep getting the drag after the pointer leaves the widget; a pointer made
        // up by a script has nothing to capture, and that is fine
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // not a live pointer
        }
        const key = (event.target as Element)
          .closest("[data-end]")
          ?.getAttribute("data-end")
        const [axis, sign] = key?.split(":") ?? []
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          moved: false,
          end: key ? { axis: axis as Axis, sign: Number(sign) as Sign } : null,
        }
      }}
      onPointerMove={(event) => {
        const from = drag.current
        if (!from) return
        const dx = event.clientX - from.x
        const dy = event.clientY - from.y
        if (!from.moved && Math.hypot(dx, dy) < 3) return
        from.moved = true
        from.x = event.clientX
        from.y = event.clientY
        bridge.orbit?.(dx, dy)
      }}
      onPointerUp={() => {
        const from = drag.current
        drag.current = null
        if (from?.end && !from.moved) look(from.end)
      }}
      onPointerLeave={() => setHot(null)}
    >
      {ends.map(({ axis, sign, key, x, y, depth }) => {
        const front = sign > 0
        const lit = hot === key
        const r = front ? 10.5 : 8.5
        const view = VIEWS.findIndex((v) => v.axis === axis && v.sign === sign)
        return (
          <g
            key={key}
            data-end={key}
            className="cursor-pointer"
            opacity={lit ? 1 : 0.72 + 0.28 * ((depth + 1) / 2)}
            onPointerEnter={() => setHot(key)}
          >
            <title>{`${VIEWS[view].name} (\u2318${view + 2})`}</title>
            {front && (
              <line
                x2={x}
                y2={y}
                stroke={COLOR[axis]}
                strokeWidth={3}
                strokeLinecap="round"
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={
                lit
                  ? "white"
                  : front
                    ? COLOR[axis]
                    : `color-mix(in oklch, ${COLOR[axis]} 28%, var(--sidebar))`
              }
              stroke={lit ? "white" : COLOR[axis]}
              strokeWidth={front ? 0 : 1.75}
            />
            {(front || lit) && (
              // the logo's letters, as big on their dots as it has them
              <Letter
                axis={axis}
                x={x}
                y={y}
                height={MARK.labelSize * 2 * r}
                minus={!front}
                stroke="black"
                // lets the press through to the dot under the letter
                pointerEvents="none"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
