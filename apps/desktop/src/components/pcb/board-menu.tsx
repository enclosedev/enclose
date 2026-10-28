// What a click on a board drawn as it is made offers, as tscircuit's own viewer does: to
// X-ray the connection clicked, the rest of the board dimmed and that drawn alone over
// it, on both sides, until Esc; and to find the part clicked on the schematic. With the
// part's maker's number, where it has one. See xray.ts.
import * as React from "react"
import { ScanLineIcon, ArrowUpRightIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { copperColourOf } from "@shared/theme-format"
import { useThemeColors } from "@/lib/css-color"
import { useStore } from "@/lib/store"
import type { Circuit } from "./boards"
import { cornersOf, type Inspected, type Side, type Under } from "./inspect"
import { inView, pixelsPerMm, type Seen } from "./inspecting"
import { pickOnSchematic } from "./schematic-picking"
import { connectionOf, connectionSaid, partNameOf, xRayOf } from "./xray"

/** What was clicked, and where, px from the window's top left. */
export type Clicked = { under: Under; x: number; y: number }

/** The menu of what can be done with what was clicked: nothing, where nothing can. */
export function BoardMenu({
  clicked,
  board,
  circuit,
  onXRay,
  onClose,
}: {
  clicked: Clicked | null
  board: Inspected
  circuit: Circuit
  /** X-ray this connection */
  onXRay: (joined: string) => void
  onClose: () => void
}) {
  const under = clicked?.under ?? null
  const joined = under ? connectionOf(under) : null
  const part = under ? partNameOf(board, under) : null
  const maker = React.useMemo(() => {
    if (!part) return null
    const source = circuit.find(
      (element) => element.type === "source_component" && element.name === part
    )
    const number = source?.manufacturer_part_number
    return typeof number === "string" && number.trim() ? number.trim() : null
  }, [circuit, part])
  // (at the place clicked, as a menu of the window's own is)
  const anchor = React.useMemo(
    () =>
      clicked
        ? {
            getBoundingClientRect: () =>
              new DOMRect(clicked.x, clicked.y, 0, 0),
          }
        : null,
    [clicked]
  )
  const open = clicked !== null && (joined !== null || part !== null)
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(now) => {
        if (!now) onClose()
      }}
    >
      {open && anchor && (
        <DropdownMenuContent anchor={anchor} align="start" className="w-64">
          {joined && (
            <DropdownMenuItem
              onClick={() => {
                onXRay(joined)
                onClose()
              }}
            >
              <ScanLineIcon />
              <span className="min-w-0 truncate">
                X-ray {connectionSaid(board, joined, under)}
              </span>
            </DropdownMenuItem>
          )}
          {part && (
            <DropdownMenuItem
              onClick={() => {
                pickOnSchematic(part)
                useStore.getState().setView({ boardAs: "schematic" })
                onClose()
              }}
            >
              <ArrowUpRightIcon />
              <span className="min-w-0 truncate">{part} on the schematic</span>
            </DropdownMenuItem>
          )}
          {maker && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs">
                <span className="text-muted-foreground">Maker’s number </span>
                <span className="font-mono text-foreground select-text">
                  {maker}
                </span>
              </div>
            </>
          )}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  )
}

/**
 * A connection X-rayed: its traces, pads and vias drawn by themselves over the board,
 * which is dimmed under them, in the colours of the sides they are on; the side looked
 * at over the other.
 */
export function XRay({
  board,
  joined,
  seen,
  side,
}: {
  board: Inspected
  joined: string
  seen: Seen
  side: Side
}) {
  const { pcb, backdrop } = useThemeColors()
  const rayed = React.useMemo(() => xRayOf(board, joined), [board, joined])
  const perMm = pixelsPerMm(seen)
  const colourOf = (on: string | null) => copperColourOf(pcb, on)
  // each stretch of each trace, those on the side turned away first
  const stretches = rayed.traces
    .flatMap((trace) =>
      trace.points.slice(1).map((to, index) => ({
        from: trace.points[index],
        to,
        key: `${trace.id}:${index}`,
      }))
    )
    .sort((a, b) => Number(a.from.side === side) - Number(b.from.side === side))
  return (
    <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
      {stretches.map(({ from, to, key }) => {
        const [x1, y1] = inView(seen, from)
        const [x2, y2] = inView(seen, to)
        return (
          <line
            key={key}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={colourOf(from.side)}
            strokeWidth={Math.max(from.width * perMm, 1.5)}
            strokeLinecap="round"
          />
        )
      })}
      {rayed.pads.map((pad) => {
        const fill = colourOf(pad.sides.includes(side) ? side : pad.sides[0])
        if (pad.round) {
          const [cx, cy] = inView(seen, pad)
          return (
            <circle
              key={pad.id}
              cx={cx}
              cy={cy}
              r={(pad.w / 2) * perMm}
              fill={fill}
            />
          )
        }
        return (
          <polygon
            key={pad.id}
            points={cornersOf(pad)
              .map((corner) => inView(seen, corner).join(","))
              .join(" ")}
            fill={fill}
          />
        )
      })}
      {rayed.vias.map((via) => {
        const [cx, cy] = inView(seen, via)
        const r = Math.max((via.w / 2) * perMm, 2)
        return (
          <g key={via.id}>
            <circle cx={cx} cy={cy} r={r} fill={pcb["technical-print"]} />
            <circle
              cx={cx}
              cy={cy}
              r={r * 0.45}
              fill={`#${backdrop.getHexString()}`}
            />
          </g>
        )
      })}
    </svg>
  )
}
