// A part picked out on a board's schematic, as tscircuit's own viewer has it: the part
// the pointer is over is ringed, and one clicked says what it is beside it, its maker's
// number and JLCPCB's, how many JLCPCB has and what one costs, what tscircuit warned of
// it as it built the board, and the board round it, as the technical view draws it.
import * as React from "react"
import { cn } from "cn"
import { TriangleAlertIcon } from "lucide-react"

import type { JlcpcbPart } from "@shared/api"
import type { PcbColours } from "@shared/theme-format"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { useThemeColors } from "@/lib/css-color"
import type { Circuit } from "./boards"
import { placeOf } from "./place"
import { schematicPartOf, type SchematicPart } from "./schematic-part"

/** A part's drawing on the schematic, by the id tscircuit gives it there. */
export const partDrawn = (within: Element | null, drawn: string | null) =>
  drawn === null
    ? null
    : (within?.querySelector(
        `g.sch-component[data-schematic-component-id="${CSS.escape(drawn)}"]`
      ) ?? null)

/** The part of the schematic something in it is of: its id there, null for none. */
export const drawnAt = (target: EventTarget | null) =>
  target instanceof Element
    ? (target
        .closest("g.sch-component[data-schematic-component-id]")
        ?.getAttribute("data-schematic-component-id") ?? null)
    : null

/** How far the ring round a part is from it, px. */
const RING = 5

/**
 * The ring round the part the pointer is over, or the one picked out: where it is in the
 * view now (`viewed` changes as the view does).
 */
export function PartRing({
  within,
  drawn,
  picked,
}: {
  within: HTMLElement | null
  drawn: string | null
  picked: boolean
  viewed: number
}) {
  const part = partDrawn(within, drawn)
  if (!within || !part) return null
  const box = part.getBoundingClientRect()
  const from = within.getBoundingClientRect()
  return (
    <div
      className={cn(
        "pointer-events-none absolute rounded-md border-2 transition-colors",
        picked ? "border-primary" : "border-primary/60"
      )}
      style={{
        left: box.left - from.left - RING,
        top: box.top - from.top - RING,
        width: box.width + RING * 2,
        height: box.height + RING * 2,
      }}
    />
  )
}

/** What is said of a part picked out on the schematic, beside it. */
export function PartPopover({
  within,
  drawn,
  circuit,
  onClose,
}: {
  within: HTMLElement | null
  drawn: string | null
  circuit: Circuit
  onClose: () => void
}) {
  const anchor = partDrawn(within, drawn)
  const part = React.useMemo(
    () => (drawn ? schematicPartOf(circuit, drawn) : null),
    [circuit, drawn]
  )
  return (
    <Popover
      open={anchor !== null && part !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {anchor && part && (
        <PopoverContent
          anchor={anchor}
          side="right"
          align="start"
          sideOffset={RING + 8}
          collisionPadding={12}
          className="max-h-(--available-height) w-88 gap-0 overflow-y-auto p-0 selection:bg-black/10 dark:selection:bg-white/10"
        >
          <PartSaid part={part} circuit={circuit} />
        </PopoverContent>
      )}
    </Popover>
  )
}

function PartSaid({
  part,
  circuit,
}: {
  part: SchematicPart
  circuit: Circuit
}) {
  const listed = useJlcpcb(part.jlcpcb)
  return (
    <>
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-5">
        <div className="min-w-0">
          <div>{part.name}</div>
          <div className="truncate text-muted-foreground">{part.title}</div>
        </div>
        {listed.state === "found" && (
          <Badge variant="secondary" className="h-7 shrink-0 px-3">
            {listed.part.basic ? "Basic part" : "Extended part"}
          </Badge>
        )}
      </div>
      <dl className="px-5">
        {part.maker && (
          <Row label="Maker’s number">
            <span className="truncate font-mono text-muted-foreground">
              {part.maker}
            </span>
          </Row>
        )}
        <Row label="JLCPCB">
          {part.jlcpcb ? (
            <a
              href={`https://jlcpcb.com/partdetail/${part.jlcpcb}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-muted-foreground underline decoration-muted-foreground/50 underline-offset-3 hover:text-foreground hover:decoration-foreground"
            >
              {part.jlcpcb}
            </a>
          ) : (
            <span className="text-muted-foreground">None given</span>
          )}
        </Row>
        {part.jlcpcb && <Listed listed={listed} />}
      </dl>
      {part.placed && <PartOnBoard part={part} circuit={circuit} />}
      {part.warnings.length > 0 && (
        <ul className="px-5 pt-5 pb-2">
          {part.warnings.map((warning) => (
            <li
              key={warning}
              className="flex gap-3 border-t border-foreground/10 py-3 text-unfinished"
            >
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** A line of what is said of a part: what, and beside it, at the far side, what it is. */
function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-foreground/10 py-3">
      <dt className="shrink-0">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end">{children}</dd>
    </div>
  )
}

/** How many JLCPCB has of a part, and what one costs, as they are looked up. */
function Listed({ listed }: { listed: Looked }) {
  if (listed.state === "looking")
    return (
      <Row label="In stock">
        <Spinner className="size-4 text-muted-foreground" />
      </Row>
    )
  if (listed.state !== "found")
    return (
      <Row label="In stock">
        <span className="text-muted-foreground">
          {listed.state === "none"
            ? "Not listed by JLCPCB"
            : "Couldn’t be looked up"}
        </span>
      </Row>
    )
  const { stock, price } = listed.part
  return (
    <>
      <Row label="In stock">
        <span
          className={cn(
            "font-mono tabular-nums",
            stock === null
              ? "font-sans text-muted-foreground"
              : stock === 0
                ? "text-unfinished"
                : "text-finished"
          )}
        >
          {stock === null ? "Not said" : stock.toLocaleString("en-US")}
        </span>
      </Row>
      {price !== null && (
        <Row label="Price">
          <span className="font-mono tabular-nums">
            $
            {price < 0.01 ? price.toFixed(4) : price.toFixed(price < 1 ? 3 : 2)}
          </span>
          <span className="ml-1.5 text-muted-foreground">each</span>
        </Row>
      )}
    </>
  )
}

type Looked =
  | { state: "looking" }
  | { state: "found"; part: JlcpcbPart }
  | { state: "none" }
  | { state: "failed" }

/** A part as JLCPCB lists it, looked up as it is picked out. */
function useJlcpcb(number: string | null): Looked {
  const [looked, setLooked] = React.useState<{
    of: string
    is: Looked
  } | null>(null)
  React.useEffect(() => {
    if (!number) return
    let over = false
    window.cad.boards.part(number).then(
      (part) => {
        if (!over)
          setLooked({
            of: number,
            is: part ? { state: "found", part } : { state: "none" },
          })
      },
      () => {
        if (!over) setLooked({ of: number, is: { state: "failed" } })
      }
    )
    return () => {
      over = true
    }
  }, [number])
  return looked?.of === number ? looked.is : { state: "looking" }
}

/** How much of the board is shown round a part: so many times as big as it, and more. */
const AROUND = { times: 2.2, more: 3 }
/** How the board round a part is shown: wider than it is tall, as the popover is. */
const ASPECT = 16 / 10

/**
 * The board round a part, as the technical view draws it, from the side the part is on,
 * with the part boxed.
 */
function PartOnBoard({
  part,
  circuit,
}: {
  part: SchematicPart
  circuit: Circuit
}) {
  const { dark, backdrop, pcb } = useThemeColors()
  const ground = `#${backdrop.getHexString()}`
  const picture = usePicture(circuit, part, pcb, dark, ground)
  return (
    <div
      className="overflow-hidden select-none"
      style={{ aspectRatio: ASPECT, background: ground }}
    >
      {picture ? (
        <img
          src={picture}
          alt={`${part.name} on the board`}
          draggable={false}
          className="size-full"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Spinner className="size-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

/** The picture of the board round a part, as a URL: null while it is being drawn. */
function usePicture(
  circuit: Circuit,
  part: SchematicPart,
  colours: PcbColours,
  dark: boolean,
  ground: string
): string | null {
  const [picture, setPicture] = React.useState<{
    of: string
    url: string | null
  } | null>(null)
  const inColours = JSON.stringify(colours)
  const of = `${part.name}:${inColours}:${ground}`
  React.useEffect(() => {
    let over = false
    void import("./drawing").then(({ drawingOf }) => {
      let url: string | null = null
      try {
        url = cropped(
          drawingOf(
            circuit,
            "pcb",
            JSON.parse(inColours) as PcbColours,
            dark,
            ground,
            part.side
          ),
          part,
          getComputedStyle(document.documentElement)
            .getPropertyValue("--primary")
            .trim() || "currentColor"
        )
      } catch {
        // (a board tscircuit cannot draw has no picture)
      }
      if (!over) setPicture({ of, url })
    })
    return () => {
      over = true
    }
  }, [circuit, part, inColours, dark, ground, of])
  return picture?.of === of ? picture.url : null
}

/**
 * A drawing of the board as it is made, cut down to the room round a part, with the part
 * boxed in `ring`: as a URL of it, for a picture. Null where the drawing says not where
 * the board is in it.
 */
function cropped(
  markup: string,
  part: SchematicPart,
  ring: string
): string | null {
  const placed = part.placed
  const svg = new DOMParser().parseFromString(
    markup,
    "image/svg+xml"
  ).documentElement
  if (!placed || !(svg instanceof SVGSVGElement)) return null
  const width = Number(svg.getAttribute("width")) || 0
  const laid = placeOf(svg, part.side === "bottom" ? width : null)
  if (!laid) return null
  // the part's corners in the drawing's own units
  const xs = [placed.x - placed.w / 2, placed.x + placed.w / 2].map(
    (x) => laid.a * x + laid.e
  )
  const ys = [placed.y - placed.h / 2, placed.y + placed.h / 2].map(
    (y) => laid.d * y + laid.f
  )
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.abs(xs[1] - xs[0]),
    h: Math.abs(ys[1] - ys[0]),
  }
  const mm = Math.abs(laid.a)
  let w = box.w * AROUND.times + AROUND.more * 2 * mm
  let h = box.h * AROUND.times + AROUND.more * 2 * mm
  if (w / h < ASPECT) w = h * ASPECT
  else h = w / ASPECT
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  svg.setAttribute("viewBox", `${cx - w / 2} ${cy - h / 2} ${w} ${h}`)
  svg.setAttribute("width", "640")
  svg.setAttribute("height", String(Math.round(640 / ASPECT)))
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice")
  const outline = document.createElementNS("http://www.w3.org/2000/svg", "rect")
  const pad = 0.4 * mm
  outline.setAttribute("x", String(box.x - pad))
  outline.setAttribute("y", String(box.y - pad))
  outline.setAttribute("width", String(box.w + pad * 2))
  outline.setAttribute("height", String(box.h + pad * 2))
  outline.setAttribute("rx", String(0.3 * mm))
  outline.setAttribute("fill", "none")
  outline.setAttribute("stroke", ring)
  outline.setAttribute("stroke-width", "1.5")
  outline.setAttribute("vector-effect", "non-scaling-stroke")
  svg.append(outline)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    new XMLSerializer().serializeToString(svg)
  )}`
}
