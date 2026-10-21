// The blueprint of a model: the model drawn flat, from each of its sides and from four of
// its corners, each drawing on a sheet of its own. The sheets stand in a row where the view of the model was, to be
// gone along, by the wheel or by taking hold of the row and pulling it; a sheet that is
// pressed is shown by itself, with all of the view for its paper; and each can be taken
// away as a file of its lines, an SVG.
//
// What is drawn is what the view had on show: all of the model, or the parts that were
// picked to be shown on their own, without the ones put out of sight; put together, or
// pulled apart as far as the view had them.
import * as React from "react"
import * as THREE from "three"
import { cn } from "cn"
import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { pieceWith } from "@/components/viewport/apart"
import type { LoadedModel, LoadedPart } from "@/components/viewport/load"
import { spokenFor } from "@/lib/keys"
import { usePreferences } from "@/lib/preferences"
import { savedAs } from "@/lib/saved"
import { useStore } from "@/lib/store"
import { dimensionsOf, type Room } from "./dimensions"
import { clearFor, columnFor, heightFor, labelsOf } from "./labels"
import { drawn, type Body, type Looking, type Stroke } from "./lines"
import { useSaving } from "./saving"
import {
  DOT,
  DOTTED,
  FIGURES,
  INK,
  LINE,
  MARGIN,
  paperOf,
  PENCIL,
  placed,
  scaleSaid,
  SIDES,
  svgOf,
  THIN,
  WRITING,
  type Dimension,
  type Label,
  type Placing,
  type Seen,
} from "./sheet"

/** How long the drawing goes on at a time, in ms, before the window is let draw itself. */
const AT_A_TIME_MS = 10
/**
 * How long what is to be drawn has to stay the same, in ms, before it is drawn again: a
 * slider is dragged through many places on its way to one.
 */
const SETTLED_MS = 120
/**
 * How thin a line can get on the screen, in pixels of the screen's own, on a drawing
 * that is shown small: a sheet in the row is its drawing made to fit, lines, writing and
 * all, and a line that came to less than this would not be there to be seen. (The
 * writing is let get as small as it comes: a sheet in the row is to be looked at, and
 * read once it has the view to itself.)
 */
const HAIRLINE = 1
/**
 * How long the sheets take to come up to the view, and to go back into their row, in
 * ms; and the way they go, which is quick away and slow into place, as the sheets come
 * into the row.
 */
const OPENS = { ms: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
/**
 * The row the sheets stand in, in px: how far in the first starts, clear of the
 * projects' cards; how far apart they are; and how far past the last the row goes on,
 * clear of the buttons down the other edge. A sheet in it: how tall it is at the most,
 * how much of the view's height it leaves clear, and how wide it is for how tall. And a
 * sheet opened out, with the view to itself: how much of the view its drawing keeps
 * clear of, at either side, at the top and at the foot. (They are what the classes of
 * the row and of a sheet say, for working out where a sheet and its drawing will be.)
 */
const ROW = { before: 272, between: 40, after: 100 }
const SMALL = { tall: 744, clear: 180, wide: 0.8 }
const OPEN = { side: 60, top: 24, foot: 84 }
/**
 * How long a drawing waits for its sheet's size to stop changing before it is drawn
 * again, in ms: until then what was drawn is stretched to fit, which is what is seen
 * while the sheets open out, and no line is drawn twice on the way.
 */
const REDRAWN_MS = 140
/**
 * How wide a drawing that is nowhere near the view is kept, at the most, in pixels of
 * the screen's own: it is drawn in full when it comes near.
 */
const FAR_PX = 1400

/** How long after the sheet before it each sheet comes in, as the blueprint comes up, ms. */
const AFTER_MS = 70

/**
 * How far the pointer has to go, held down on the row of sheets, before the row is being
 * pulled along by it, in pixels: less, and it is a press on whatever is under it.
 */
const PULLED_PX = 4

/** A moment for the window to draw itself in. */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0))

/** One side of the model, drawn: the lines of each part. And where they sit on its paper. */
type Drawn = { strokes: Stroke[][] }
export type Drawing = Drawn & { placing: Placing }

/** The sheets of a model: its sides, as far as they have been drawn. */
type Sheets = {
  /** what they are a drawing of: tells one drawing of the model from the next */
  of: string
  /** the parts drawn, by id, in the order their lines are kept in */
  parts: string[]
  /** the room they take up between them, which is what a sheet gives the size of */
  room: Room
  /** and the room they take up as each side sees them, which is what places its drawing */
  seen: Seen[]
  sides: (Drawn | null)[]
}

/**
 * The last few sets of sheets drawn, latest first: what a blueprint comes up with at
 * once, where the model is as it was for one of them. Pulled apart and put back together
 * is two of them.
 */
const kept: Sheets[] = []
const KEPT = 3
const keptOf = (of: string) => kept.find((sheets) => sheets.of === of) ?? null
function keep(sheets: Sheets) {
  kept.unshift(sheets)
  kept.length = Math.min(kept.length, KEPT)
}

/** A number for a thing, its own for as long as the thing is there. */
const numbers = new WeakMap<object, number>()
let numbered = 0
function numberOf(thing: object): number {
  let number = numbers.get(thing)
  if (number === undefined) numbers.set(thing, (number = ++numbered))
  return number
}

/**
 * What a drawing depends on, in a word: which parts they are, as they were loaded, and
 * where each is. The same parts put in other groups are the same drawing.
 */
export function keyOf(parts: LoadedPart[], apart: number): string {
  return parts
    .map(
      (part) =>
        `${numberOf(part.skins)}.${numberOf(part.home)}` +
        (apart === 0 ? "" : `@${part.away.toArray().join()}`)
    )
    .concat(String(apart))
    .join(" ")
}

/** Where a part is in the model, as it is drawn: pulled out from its place by so much. */
function placeOf(part: LoadedPart, apart: number): THREE.Matrix4 {
  const place = part.home.clone()
  const out = part.away.clone().multiplyScalar(apart)
  place.elements[12] += out.x
  place.elements[13] += out.y
  place.elements[14] += out.z
  return place
}

/** The parts as the drawing takes them, and the room they take up seen from each side. */
export function laidOut(parts: LoadedPart[], apart: number) {
  const places = parts.map((part) => placeOf(part, apart))
  const bodies = parts.map((part, index): Body => ({
    // (what is made of something clear hides nothing: it is drawn, and seen through)
    skins: part.part.clear
      ? []
      : part.skins.map(({ geometry }) => ({
          position: geometry.attributes.position.array,
          index: geometry.index!.array,
        })),
    edges: part.edges,
    contours: part.contours,
    place: places[index].elements,
  }))
  const all = new THREE.Box3()
  parts.forEach(({ box }, index) =>
    all.union(box.clone().applyMatrix4(places[index]))
  )
  const room: Room = all.isEmpty()
    ? { min: [0, 0, 0], max: [0, 0, 0] }
    : { min: all.min.toArray(), max: all.max.toArray() }
  const corner = new THREE.Vector3()
  const rooms = SIDES.map(({ looking }) => {
    const right = new THREE.Vector3(...looking.right)
    const up = new THREE.Vector3(...looking.up)
    const room = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
    parts.forEach(({ box }, index) => {
      for (let i = 0; i < 8; i++) {
        corner
          .set(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z
          )
          .applyMatrix4(places[index])
        room.x0 = Math.min(room.x0, corner.dot(right))
        room.x1 = Math.max(room.x1, corner.dot(right))
        room.y0 = Math.min(room.y0, corner.dot(up))
        room.y1 = Math.max(room.y1, corner.dot(up))
      }
    })
    return parts.length > 0 ? room : { x0: 0, x1: 0, y0: 0, y1: 0 }
  })
  return { bodies, room, seen: rooms }
}

/**
 * The room a side's drawing takes up, and with it the corners of the room the model
 * takes up as a whole, which are where its size is said from. Seen from a corner of the
 * model those can lie well outside the drawing, where no part is.
 */
function withCorners(seen: Seen, room: Room, looking: Looking): Seen {
  const all = { ...seen }
  for (let i = 0; i < 8; i++) {
    const corner = [0, 1, 2].map((axis) =>
      i & (1 << axis) ? room.max[axis] : room.min[axis]
    )
    const [x, y] = [looking.right, looking.up].map(
      (way) => corner[0] * way[0] + corner[1] * way[1] + corner[2] * way[2]
    )
    all.x0 = Math.min(all.x0, x)
    all.x1 = Math.max(all.x1, x)
    all.y0 = Math.min(all.y0, y)
    all.y1 = Math.max(all.y1, y)
  }
  return all
}

/** The sheets in the order they are drawn in: the ones in sight first, then the rest. */
function inSightFirst(row: HTMLElement | null): number[] {
  const all = SIDES.map((_, index) => index)
  if (!row) return all
  const sheets = [...row.children] as HTMLElement[]
  const inSight = (index: number) => {
    const sheet = sheets.at(index)
    return (
      sheet !== undefined &&
      sheet.offsetLeft < row.scrollLeft + row.clientWidth &&
      sheet.offsetLeft + sheet.offsetWidth > row.scrollLeft
    )
  }
  return [...all.filter(inSight), ...all.filter((index) => !inSight(index))]
}

/**
 * The sheets of what is on show, drawn as they are asked for: a side at a time, and a
 * little of a side at a time, so that the window is never held up by it. Each sheet
 * shows as it is done, the ones in sight before the rest. `now` is the sheets of the
 * model as it is on show, as far as they have been drawn. While it is being drawn
 * again, some other way, `was` is the sheets of it as it was: each stays up until the
 * one that takes its place is done, as the model does when it is built again.
 */
function useSheets(
  parts: LoadedPart[],
  apart: number,
  row: React.RefObject<HTMLElement | null>
): { now: Sheets | null; was: Sheets | null } {
  const of = React.useMemo(() => keyOf(parts, apart), [parts, apart])
  /** the drawing that is under way, as far as it has got */
  const [sheets, setSheets] = React.useState<Sheets | null>(null)
  /** the last that was all there here: what stays up while the next is drawn */
  const [last, setLast] = React.useState<Sheets | null>(null)
  const whole = keptOf(of)
  if (whole && last !== whole) setLast(whole)

  React.useEffect(() => {
    if (keptOf(of)) return
    let stopped = false
    const draw = async () => {
      const { bodies, room, seen } = laidOut(parts, apart)
      const fresh: Sheets = {
        of,
        parts: parts.map((part) => part.part.id),
        room,
        seen,
        sides: SIDES.map(() => null),
      }
      for (const index of inSightFirst(row.current)) {
        const run = drawn(bodies, SIDES[index].looking)
        let since = performance.now()
        for (;;) {
          const step = run.next()
          if (step.done) {
            fresh.sides[index] = { strokes: step.value }
            break
          }
          if (performance.now() - since < AT_A_TIME_MS) continue
          await breathe()
          if (stopped) return
          since = performance.now()
        }
        await breathe()
        if (stopped) return
        setSheets({ ...fresh, sides: [...fresh.sides] })
      }
      keep(fresh)
      setLast(fresh)
    }
    const begun = setTimeout(() => void draw(), SETTLED_MS)
    return () => {
      stopped = true
      clearTimeout(begun)
    }
  }, [of, parts, apart, row])

  return {
    now: whole ?? (sheets?.of === of ? sheets : null),
    was: last && last.of !== of ? last : null,
  }
}

/** A name a file can have, from whatever something is called. */
const fileName = (called: string) =>
  called
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "model"

/**
 * The lines of a drawing, on the paper: as they will be in the file, at the sheet's size.
 * And over them what the sheet says of how big the model is, and of which part is which,
 * where it says.
 */
export function Lines({
  drawing,
  measures,
  labels,
}: {
  drawing: Drawing | null
  measures: Dimension[] | null
  labels: Label[] | null
}) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const paper = canvas.current
    if (!paper) return
    /** it is in the view, or close by: far off, it is kept small */
    let near = true
    /** How big it is to be drawn, in pixels of the screen's own. */
    const sized = () => {
      const ratio = window.devicePixelRatio || 1
      const full = paper.clientWidth * ratio
      const scale = near || full <= FAR_PX ? 1 : FAR_PX / full
      return {
        width: Math.round(full * scale),
        height: Math.round(paper.clientHeight * ratio * scale),
      }
    }
    const paint = () => {
      const { width, height } = sized()
      if (paper.width !== width || paper.height !== height) {
        paper.width = width
        paper.height = height
      }
      const context = paper.getContext("2d")
      if (!context) return
      context.clearRect(0, 0, width, height)
      if (!drawing) return
      // pixels to the millimetre of paper, and to the millimetre of model
      const on = paperOf(drawing.placing)
      const per = width / on.width
      const { middle, by } = drawing.placing
      const scale = per / by
      const left = (on.width / 2) * per - middle[0] * scale
      const top = (on.height / 2) * per + middle[1] * scale
      context.lineWidth = Math.max(LINE * per, HAIRLINE)
      context.lineJoin = "round"
      context.lineCap = "round"
      context.strokeStyle = INK
      context.beginPath()
      for (const strokes of drawing.strokes)
        for (const { points, closed } of strokes) {
          context.moveTo(left + points[0] * scale, top - points[1] * scale)
          for (let i = 2; i + 1 < points.length; i += 2)
            context.lineTo(
              left + points[i] * scale,
              top - points[i + 1] * scale
            )
          if (closed) context.closePath()
        }
      context.stroke()
      context.lineWidth = Math.max(THIN * per, HAIRLINE / 2)
      context.strokeStyle = PENCIL
      context.fillStyle = PENCIL
      context.textBaseline = "alphabetic"
      if (labels) {
        context.font = `600 ${WRITING * per}px "Inter Variable", sans-serif`
        // (the line is of dots: no nearer one another than three of them would lie)
        const dotted = [0, Math.max(DOTTED * per, context.lineWidth * 3)]
        for (const { said, line, at, text } of labels) {
          context.setLineDash(dotted)
          context.beginPath()
          context.moveTo(line[0] * per, line[1] * per)
          for (let i = 2; i + 1 < line.length; i += 2)
            context.lineTo(line[i] * per, line[i + 1] * per)
          context.stroke()
          context.setLineDash([])
          context.beginPath()
          context.arc(at[0] * per, at[1] * per, (DOT / 2) * per, 0, 2 * Math.PI)
          context.fill()
          context.textAlign = text.side === "left" ? "right" : "left"
          context.fillText(said, text.x * per, text.y * per)
        }
      }
      if (!measures) return
      context.font = `400 ${FIGURES * per}px "Inter Variable", sans-serif`
      context.textAlign = "center"
      for (const { lines, arrows, text } of measures) {
        context.beginPath()
        for (const [x1, y1, x2, y2] of lines) {
          context.moveTo(x1 * per, y1 * per)
          context.lineTo(x2 * per, y2 * per)
        }
        context.stroke()
        context.beginPath()
        for (const [x1, y1, x2, y2, x3, y3] of arrows) {
          context.moveTo(x1 * per, y1 * per)
          context.lineTo(x2 * per, y2 * per)
          context.lineTo(x3 * per, y3 * per)
          context.closePath()
        }
        context.fill()
        context.save()
        context.translate(text.x * per, text.y * per)
        context.rotate((text.turn * Math.PI) / 180)
        context.fillText(text.said, 0, 0)
        context.restore()
      }
    }
    paint()
    // Drawn again at whatever size the sheet comes to be: once it has come to be it,
    // and not at every size on the way. And in full once it is near the view.
    let soon: ReturnType<typeof setTimeout> | undefined
    const again = () => {
      clearTimeout(soon)
      soon = setTimeout(() => {
        const { width, height } = sized()
        if (paper.width !== width || paper.height !== height) paint()
      }, REDRAWN_MS)
    }
    const watch = new ResizeObserver(again)
    watch.observe(paper)
    const sight = new IntersectionObserver(
      ([seen]) => {
        near = seen.isIntersecting
        again()
      },
      { rootMargin: "0px 100% 0px 100%" }
    )
    sight.observe(paper)
    return () => {
      clearTimeout(soon)
      watch.disconnect()
      sight.disconnect()
    }
  }, [drawing, measures, labels])
  return <canvas ref={canvas} className="absolute inset-0 size-full" />
}

/** One sheet: what it is of and the way to take it away, over the paper with the drawing on it. */
function Sheet({
  name,
  place,
  drawing,
  measures,
  labels,
  stale,
  open,
  paged,
  onSave,
  onEnlarge,
}: {
  name: string
  /** null until it has been drawn */
  drawing: Drawing | null
  /** what it says of how big the model is, if it says */
  measures: Dimension[] | null
  /** and of which part is which, if it says */
  labels: Label[] | null
  /** what is on it is of the model as it was, and is being drawn again */
  stale: boolean
  /** its place in the row, from the left: it comes in that much after the first */
  place: number
  /** a sheet is to have the view to itself: what is over the sheets is put away */
  open: boolean
  /**
   * The sheets are opened out: each is as big as the view, with all of the view for its
   * paper and nothing over it, and they stand side by side with nothing between.
   */
  paged: boolean
  onSave: () => void
  /** the paper was pressed: the sheets are to open out, with this one in the view */
  onEnlarge: () => void
}) {
  const paper = paperOf(drawing?.placing ?? { middle: [0, 0], by: 1 })
  return (
    <section
      className={cn(
        "flex shrink-0 animate-in flex-col duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] fill-mode-both fade-in slide-in-from-bottom-6 motion-reduce:animate-none",
        paged && "snap-start"
      )}
      style={{ animationDelay: `${place * AFTER_MS}ms` }}
    >
      <header
        inert={open}
        className={cn(
          "flex items-center justify-between overflow-hidden transition-opacity duration-200 motion-reduce:transition-none",
          open && "opacity-0",
          paged ? "h-0" : "mb-2.5 h-9"
        )}
      >
        <h2 className="text-base font-medium">{name} View</h2>
        <Tooltip disableHoverablePopup>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="bg-foreground/8 hover:bg-foreground/14 dark:hover:bg-foreground/14"
                // (one that is being drawn again is not yet what would be saved)
                disabled={!drawing || stale}
                onClick={onSave}
              />
            }
          >
            <DownloadIcon />
            <span className="sr-only">Download SVG</span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Download SVG
            {drawing && (
              <span className="tabular-nums opacity-60">
                {scaleSaid(drawing.placing.by)}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </header>
      {/* Four wide to five high: as tall as the view has room for, clear of what is at
          its top and its foot, and no taller than it is at a pixel to the point. */}
      <button
        type="button"
        data-paper
        aria-label={open ? `${name} view` : `Enlarge the ${name} view`}
        disabled={!drawing}
        onClick={open ? undefined : onEnlarge}
        className={cn(
          "relative overflow-hidden bg-white ring-foreground/10 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-[#f5f6ec] dark:focus-visible:ring-[3px]",
          paged
            ? "h-[100cqh] w-[100cqw] cursor-[inherit] rounded-none ring-0"
            : "h-[min(744px,calc(100cqh-180px))] w-[calc(min(744px,100cqh-180px)*0.8)] cursor-pointer rounded-[18px] ring-1 disabled:cursor-default dark:ring-0"
        )}
      >
        {/* A drawing that is being done again waits faintly for the one to take its
            place: but not at once, in case that is here before anyone could tell.
            Opened out, it keeps clear of what is over the view at its edges: the
            button at its top right, and as much at the left for the drawing to be in
            the middle; and the bars at its foot. */}
        <div
          className={cn(
            "[container-type:size] absolute flex items-center justify-center transition-opacity duration-200",
            paged ? "top-6 right-15 bottom-21 left-15" : "inset-3",
            stale && "opacity-25 delay-200"
          )}
        >
          {drawing && (
            <div
              className="relative shrink-0"
              style={{
                aspectRatio: `${paper.width} / ${paper.height}`,
                width: `min(100cqw, 100cqh * ${paper.width / paper.height})`,
              }}
            >
              <Lines drawing={drawing} measures={measures} labels={labels} />
            </div>
          )}
        </div>
        {(!drawing || stale) && (
          <div className="absolute inset-0 flex animate-in items-center justify-center delay-300 duration-300 fill-mode-both fade-in">
            <Spinner className="size-5 text-black/35" />
          </div>
        )}
      </button>
    </section>
  )
}

export function Blueprint({
  loaded,
  parts,
  apart,
  dimensions,
  labels,
  pieces,
  name,
}: {
  loaded: LoadedModel
  /** the parts of it that are on show: the ones that are drawn */
  parts: LoadedPart[]
  /** how far they are pulled apart: nothing, put together */
  apart: number
  /** whether the sheets say how big the model is */
  dimensions: boolean
  /** and whether they say which part is which */
  labels: boolean
  /**
   * The model is pulled apart into its pieces, each of which may be of several parts:
   * it is the pieces that are named then, and not the parts of them.
   */
  pieces: boolean
  /** what the model is called, for its files to go by */
  name: string
}) {
  const row = React.useRef<HTMLDivElement>(null)
  const { now, was } = useSheets(parts, apart, row)
  /** the sheet that is shown by itself, with all of the view, by its place in the row */
  const alone = useStore((state) => state.view.sheet)
  const setView = useStore((state) => state.setView)
  // The row is gone along by taking hold of it anywhere and pulling: where the pointer
  // went down, and how far along the row was then; and once it has been pulled at all.
  const held = React.useRef<{
    x: number
    left: number
    pulled: boolean
  } | null>(null)
  /** (for the hand that shows it: what is done about it goes by `held`, which is never behind) */
  const [pulling, setPulling] = React.useState(false)
  /** it was pulled, and let go: the press that ends that is not one on a sheet */
  const pulled = React.useRef(false)
  const open = alone !== null
  /** the sheet that last had the view: the one the sheets come up about, and go back about */
  const [last, setLast] = React.useState(alone ?? 0)
  if (alone !== null && alone !== last) setLast(alone)
  /** the sheets are on their way up to the view or back, and are not to be turned */
  const moving = React.useRef(false)
  /** they are opened out, each the size of the view: a sheet at a time, as pages are */
  const [paged, setPaged] = React.useState(false)
  // (and are in their row again as soon as the view is given back, to go back into it)
  if (!open && paged) setPaged(false)

  // A sheet that is pressed comes up to the view, and all the sheets with it: the row
  // is made bigger as it is, about that sheet, until the sheet is as wide as the view,
  // still the shape it was, and so taller than the view by then. Its drawing comes up
  // less far, to the size it is to be read at, and goes to where it is to be in the
  // view. Nothing else changes on the way: not the shape of a sheet, nor what is on
  // it. Only then are the sheets opened out, each to the size of the view, which is
  // what is by then seen: paper from edge to edge, and the drawing where it is. Going
  // back is the same the other way round: the sheets are in their row again at once,
  // made as big as was seen, and come down to their size.
  const zoom = React.useRef<Animation[]>([])
  const stood = React.useRef(open)
  React.useLayoutEffect(() => {
    const strip = row.current
    // Only when a sheet takes the view, and gives it back: not as the blueprint comes
    // up, which the sheets do in their own way. (By what was last seen, and not by
    // this being the first time through: it is gone through twice as the app is
    // worked on, and the second time would be taken for the view being given back.)
    if (stood.current === open) return
    stood.current = open
    if (!strip) return
    const [wide, high] = [strip.clientWidth, strip.clientHeight]
    for (const going of zoom.current) going.cancel()
    zoom.current = []
    if (!open) {
      // in their row again, with the sheet that had the view in the middle of it, as
      // near as the ends of the row let it be
      const sheet = Math.min(SMALL.tall, high - SMALL.clear) * SMALL.wide
      const along = ROW.before + last * (sheet + ROW.between)
      const all =
        ROW.before +
        SIDES.length * sheet +
        (SIDES.length - 1) * ROW.between +
        ROW.after
      strip.scrollLeft = Math.min(
        Math.max(0, all - wide),
        Math.max(0, along - (wide - sheet) / 2)
      )
    }
    const paper = strip.querySelectorAll<HTMLElement>("[data-paper]")[last]
    if (!paper) return
    const drawing = paper.querySelector("canvas")?.parentElement ?? null
    // the sheet in the row, and its drawing: where each is from the row's own corner
    const within = strip.getBoundingClientRect()
    const middle = (of: Element) => {
      const { left, top, width, height } = of.getBoundingClientRect()
      return {
        x: left + width / 2 - within.left,
        y: top + height / 2 - within.top,
        width,
        height,
      }
    }
    const sheet = middle(paper)
    // The row is made bigger about its own corner until the sheet is as wide as the
    // view (or as tall, of a view that is taller than a sheet is), and moved so that
    // the sheet is in the middle of it.
    const by = Math.max(wide / sheet.width, high / sheet.height)
    const across = wide / 2 - by * sheet.x
    const down = high / 2 - by * sheet.y
    const up: Keyframe[][] = [
      [
        { transform: "translate(0px, 0px) scale(1)" },
        { transform: `translate(${across}px, ${down}px) scale(${by})` },
      ],
    ]
    // And the drawing is made as much smaller, on its sheet, as leaves it the size it
    // is with the view to itself, and is moved on its sheet to where it is then: in
    // the middle of what the view keeps clear for it.
    if (drawing) {
      const small = middle(drawing)
      const room = {
        width: wide - 2 * OPEN.side,
        height: high - OPEN.top - OPEN.foot,
      }
      const big = Math.min(
        room.width,
        (room.height * small.width) / small.height
      )
      const less = big / (by * small.width)
      const over = (OPEN.side + room.width / 2 - across) / by - small.x
      const under = (OPEN.top + room.height / 2 - down) / by - small.y
      up.push([
        { transform: "translate(0px, 0px) scale(1)" },
        { transform: `translate(${over}px, ${under}px) scale(${less})` },
      ])
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    moving.current = true
    zoom.current = [strip, drawing].flatMap((part, index) =>
      part && up[index]
        ? [
            part.animate(open ? up[index] : [...up[index]].reverse(), {
              duration: still ? 0 : OPENS.ms,
              easing: OPENS.easing,
              // (it stays as it got to be until the sheets are opened out under it)
              fill: open ? "forwards" : "none",
            }),
          ]
        : []
    )
    const [going] = zoom.current
    going.onfinish = () => {
      // (opened out is when they are done with moving: see below)
      if (open) setPaged(true)
      else moving.current = false
    }
    going.oncancel = () => (moving.current = false)
    // only as a sheet takes the view and gives it back: not at each page turned to
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // Opened out, the sheet that had come up to the view is the one in it: and the row
  // is its own size again, the sheets being the size it was made to show them.
  React.useLayoutEffect(() => {
    const strip = row.current
    if (!strip || !paged) return
    for (const going of zoom.current) going.cancel()
    zoom.current = []
    moving.current = false
    strip.scrollLeft = last * strip.clientWidth
    // (only as they are opened out: after that the row is turned by hand)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged])

  /** the row is being brought to a sheet, and where it is on the way says nothing */
  const turning = React.useRef(false)
  /** Bring the row to a sheet, opened out: at once, or going along to it. */
  const turnTo = React.useCallback((index: number, smooth = true) => {
    const strip = row.current
    if (!strip) return
    const left = index * strip.clientWidth
    if (smooth && Math.abs(strip.scrollLeft - left) > 1) turning.current = true
    strip.scrollTo({ left, behavior: smooth ? "smooth" : "instant" })
  }, [])
  // Opened out, the sheet in the view is the one the row was last left at, where it
  // was a hand that took it there (the keys, the wheel and a pull say which they are
  // going to as they go); and the row stays at that sheet when the view comes to be
  // another size.
  React.useEffect(() => {
    const strip = row.current
    if (!strip || !paged) return
    const settled = () => {
      // (brought there: it is where it was being brought, which is known)
      if (turning.current) return void (turning.current = false)
      if (moving.current || held.current) return
      const index = Math.round(strip.scrollLeft / strip.clientWidth)
      if (index !== useStore.getState().view.sheet)
        setView({ sheet: Math.min(SIDES.length - 1, Math.max(0, index)) })
    }
    strip.addEventListener("scrollend", settled)
    const watch = new ResizeObserver(() => {
      const index = useStore.getState().view.sheet
      if (index !== null && !moving.current) turnTo(index, false)
    })
    watch.observe(strip)
    return () => {
      strip.removeEventListener("scrollend", settled)
      watch.disconnect()
    }
  }, [paged, setView, turnTo])
  React.useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => {
      const by =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
      if (!by || event.defaultPrevented || spokenFor(event.target)) return
      const at = useStore.getState().view.sheet
      if (at === null || moving.current) return
      event.preventDefault()
      const next = Math.min(SIDES.length - 1, Math.max(0, at + by))
      setView({ sheet: next })
      turnTo(next)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [open, setView, turnTo])
  const units = usePreferences((state) => state.units)
  /**
   * What is on each sheet: its drawing of the model as it is on show, or until that is
   * done the one of the model as it was (`stale`); and what it says of how big the
   * model is, and of which part is which, where the sheets say.
   */
  const sides = React.useMemo(() => {
    // What is named: each part by what it is called. Or, with the model pulled apart
    // into its pieces, each piece, by what the piece goes by: its group, where it is
    // all of one, and the part itself where a piece is no more than that.
    const listed = loaded.parts.map(({ part, piece, box }) => ({
      id: part.id,
      label: part.label,
      group: part.group,
      piece,
      across: box.min.distanceTo(box.max),
    }))
    const known = new Map(listed.map((part) => [part.id, part]))
    /** What a set of sheets has to name, each with a number that is its own on them all. */
    const nameable = (of: Sheets) => {
      const things = new Map<number, { label: string; parts: number[] }>()
      of.parts.forEach((id, place) => {
        const part = known.get(id)
        // (a part the model no longer has is a thing by itself)
        const key = pieces && part ? part.piece : -1 - place
        const thing = things.get(key)
        if (thing) thing.parts.push(place)
        else
          things.set(key, {
            label:
              (pieces && pieceWith(listed, loaded.model.groups, id)?.label) ||
              (part?.label ?? id),
            parts: [place],
          })
      })
      return [...things.values()]
    }
    /** The room a drawing has to be found: with what says its size, if that is said. */
    const taken = (of: Sheets, index: number) =>
      dimensions
        ? withCorners(of.seen[index], of.room, SIDES[index].looking)
        : of.seen[index]
    // How a set of drawings is set out, each on paper of its own: to the scale that
    // makes the biggest of them as big as paper gets, with as much of the paper kept
    // clear at either side as the names need, which stand there in columns as wide as
    // the longest of them, and paper tall enough for the names of what shows on it.
    const set = new Map<
      Sheets,
      {
        names: { things: ReturnType<typeof nameable>; column: number } | null
        at: Placing[]
      }
    >()
    const setOut = (of: Sheets) => {
      let out = set.get(of)
      if (!out) {
        const things = labels ? nameable(of) : null
        const names = things && {
          things,
          column: columnFor(things.map((thing) => thing.label)),
        }
        const at = placed(
          of.seen.map((_, index) => taken(of, index)),
          {
            x: names ? clearFor(names.column, dimensions) : MARGIN,
            y: MARGIN,
          },
          of.sides.map((side) =>
            names && side
              ? heightFor(
                  names.things.filter(({ parts }) =>
                    parts.some((part) => side.strokes[part].length > 0)
                  ).length
                )
              : 0
          )
        )
        set.set(of, (out = { names, at }))
      }
      return out
    }
    const found = SIDES.map((_, index) => {
      const of = now?.sides[index] ? now : was?.sides[index] ? was : null
      const as = of?.sides[index] ?? null
      return of && as
        ? { of, as, names: setOut(of).names, stale: of !== now }
        : null
    })
    /** All that is on a sheet, with its drawing placed so. */
    const said = (index: number, placing: Placing) => {
      const { of, as, names, stale } = found[index]!
      const side = SIDES[index]
      return {
        drawing: { strokes: as.strokes, placing },
        stale,
        measures: dimensions
          ? dimensionsOf(of.room, side.looking, side.flat, placing, units)
          : null,
        labels: names
          ? labelsOf(
              names.things.map(({ label, parts }) => ({
                label,
                strokes: parts.flatMap((part) => as.strokes[part]),
              })),
              placing,
              names.column
            )
          : null,
      }
    }
    return found.map((one, index) =>
      one
        ? said(index, setOut(one.of).at[index])
        : { drawing: null, stale: false, measures: null, labels: null }
    )
  }, [now, was, dimensions, labels, pieces, units, loaded])

  /** A sheet as the file it is saved as: nothing, of one that is not drawn as the model now is. */
  const fileOf = React.useCallback(
    (index: number) => {
      const { drawing, measures, labels: names, stale } = sides[index]
      if (!now || !drawing || stale) return null
      const side = SIDES[index].name.toLowerCase()
      const lines = new Map(
        now.parts.map((id, place) => [id, drawing.strokes[place]])
      )
      const svg = svgOf({
        title: `${name}, ${side} view (${scaleSaid(drawing.placing.by)}${
          measures ? `, ${units}` : ""
        })`,
        placing: drawing.placing,
        dimensions: measures ?? undefined,
        labels: names ?? undefined,
        groups: loaded.model.groups.map((group) => ({
          id: group.id,
          label: group.label,
          parts: loaded.model.parts.flatMap((part) => {
            const strokes = part.group === group.id && lines.get(part.id)
            return strokes ? [{ id: part.id, label: part.label, strokes }] : []
          }),
        })),
      })
      return { name: `${fileName(name)}-${fileName(side)}.svg`, svg }
    },
    [sides, now, name, units, loaded]
  )
  const save = (index: number) => {
    const file = fileOf(index)
    if (file) void window.cad.model.saveDrawing(savedAs(file.name), file.svg)
  }

  // All of them together, for the button at the foot: once every sheet is drawn, and
  // drawn as the model now is.
  const whole = sides.every(({ drawing, stale }) => drawing !== null && !stale)
  React.useEffect(() => {
    if (!whole) return
    useSaving.setState({
      all: () => {
        const files = SIDES.flatMap((_, index) => fileOf(index) ?? [])
        void window.cad.model
          .saveDrawings(savedAs(`${fileName(name)}-blueprint`), files)
          .then((saved) => {
            if (saved) useStore.getState().say(`Saved ${files.length} SVGs`)
          })
      },
    })
    return () => useSaving.setState({ all: null })
  }, [whole, fileOf, name])

  /** when the wheel last turned a page: it turns one at a time */
  const turned = React.useRef(0)
  return (
    // what the row is kept within, as big as it is made on its way up to the view
    <div className="absolute inset-0 overflow-hidden">
      <div
        // The sheets go off to the right, and are gone along sideways: a wheel that only
        // turns up and down goes along them too. The first starts clear of the projects'
        // cards, and the last can be brought clear of the buttons down the other edge.
        // Opened out they stand side by side, each the size of the view, and the row
        // goes from one to the next as pages are turned. (It is what their sizes are
        // said as lengths of: see Sheet.)
        ref={row}
        className={cn(
          "[container-type:size] absolute inset-0 flex origin-top-left [scrollbar-width:none] items-center overflow-x-auto overflow-y-hidden overscroll-x-contain select-none",
          paged ? "gap-0 pr-0 pl-0" : "gap-10 pr-25 pl-68",
          // (a page at a time, once they are at rest: and not under a hand that pulls)
          paged && !pulling && "snap-x snap-mandatory",
          pulling ? "cursor-grabbing [&_*]:cursor-grabbing" : "cursor-grab"
        )}
        aria-busy={!whole}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
          if (!open)
            return void (event.currentTarget.scrollLeft += event.deltaY)
          const at = useStore.getState().view.sheet
          if (at === null || moving.current) return
          if (event.timeStamp - turned.current < 450) return
          turned.current = event.timeStamp
          const next = Math.min(
            SIDES.length - 1,
            Math.max(0, at + Math.sign(event.deltaY))
          )
          setView({ sheet: next })
          turnTo(next)
        }}
        onPointerDown={(event) => {
          pulled.current = false
          // by the mouse's own button: and not from a button that is for something else
          const on = event.target as HTMLElement
          if (event.button !== 0 || event.pointerType === "touch") return
          if (on.closest("button:not([data-paper])")) return
          held.current = {
            x: event.clientX,
            left: event.currentTarget.scrollLeft,
            pulled: false,
          }
        }}
        onPointerMove={(event) => {
          const from = held.current
          if (!from) return
          const moved = event.clientX - from.x
          if (!from.pulled && Math.abs(moved) < PULLED_PX) return
          if (!from.pulled) {
            from.pulled = true
            event.currentTarget.setPointerCapture(event.pointerId)
            setPulling(true)
          }
          event.currentTarget.scrollLeft = from.left - moved
        }}
        onPointerUp={(event) => {
          const from = held.current
          pulled.current = from?.pulled ?? false
          held.current = null
          setPulling(false)
          // let go of opened out, the row goes on to the page it was pulled towards
          const at = useStore.getState().view.sheet
          if (!from?.pulled || at === null) return
          const strip = event.currentTarget
          const far = (strip.scrollLeft - from.left) / strip.clientWidth
          const next = Math.min(
            SIDES.length - 1,
            Math.max(0, at + (Math.abs(far) > 0.12 ? Math.sign(far) : 0))
          )
          setView({ sheet: next })
          turnTo(next)
        }}
        onPointerCancel={() => {
          held.current = null
          setPulling(false)
        }}
        onClickCapture={(event) => {
          if (!pulled.current) return
          pulled.current = false
          event.stopPropagation()
          event.preventDefault()
        }}
      >
        {SIDES.map((side, index) => (
          <Sheet
            key={side.name}
            name={side.name}
            place={index}
            drawing={sides[index].drawing}
            measures={sides[index].measures}
            labels={sides[index].labels}
            stale={sides[index].stale}
            open={open}
            paged={paged}
            onSave={() => save(index)}
            onEnlarge={() => setView({ sheet: index })}
          />
        ))}
      </div>
    </div>
  )
}
