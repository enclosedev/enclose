// PCB mode: one of the project's circuit boards, where the view of the model was, on a
// ground of its own colour. It is looked at three ways, by the buttons down the right:
// drawn as it is made, its copper, pads and print on the board; as its schematic; and
// in 3D, as tscircuit built it. Both drawings are tscircuit's own (circuit-to-svg), and
// the 3D is the board it built, so all three are the board as it will be made.
//
// The drawings are moved about as the model is: fingers across a trackpad or a drag move
// them, and a pinch or a mouse wheel zooms, on the place under the pointer. A double
// click puts the whole of the board back in view. The 3D has the model's own camera, and
// is turned and moved by the same hand. Drawn as it is made, what the pointer is over is
// said as tscircuit's own viewer says it (see inspecting.tsx): a pad's names, a trace's
// length, and how far its part is placed from what it is placed by. Cmd+F looks for its
// parts, pins and nets by name (see finding.ts): what goes by it is lit on the board,
// and in 3D, and Enter goes to it.
import * as React from "react"
import { cn } from "cn"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { LineMaterial } from "three/addons/lines/LineMaterial.js"
import { LineSegments2 } from "three/addons/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js"

import type { BoardSummary } from "@shared/api"
import { BOARD_HOST, MODEL_SCHEME } from "@shared/api"
import {
  builtOf,
  copperLayerOf,
  readRouting,
  type Routing,
} from "@shared/board-format"
import type { PcbColours } from "@shared/theme-format"
import { Badge } from "@/components/ui/badge"
import { useThemeColors } from "@/lib/css-color"
import { usePreferences } from "@/lib/preferences"
import { scrollSource } from "@/lib/scroll"
import { useStore, type BoardAs } from "@/lib/store"
import { ago, useNow } from "@/lib/time"
import { rateWhen, useWatched } from "@/lib/watched"
import {
  boardUrl,
  sizeSaid,
  useBeingMade,
  useCircuit,
  type Circuit,
  type Routed,
} from "./boards"
import type { CopperLayer } from "./drawing"
import { DRAWN } from "./ground"
import { contoursOf } from "@/components/viewport/contours"
import { EDGE } from "@/components/viewport/paint"
import { onlyWhereItTurns, Underlight } from "@/components/viewport/scene"
import { bridge } from "@/components/viewport/bridge"
import { flatZoom, FOV, PINCH, REACH, Rig } from "@/components/viewport/rig"
import { disposeBoard, loadBoard } from "./pictures"
import { Hand, useHand, withHand } from "./hand"
import { BoardPartMark, onBoard } from "./part-mark"
import { UnfinishedBadge, WorkingBadge } from "./board-steps"
import {
  boardPaint,
  inOurColours,
  inShade,
  keepOutsOf,
  viaCopper,
  repaint,
  shadedOf,
  type Shaded,
} from "./colours"
import { cleanDrawing } from "./clean-drawing"
import {
  findablesOf,
  foundBox,
  foundSaid,
  lookFor,
  partsIn,
  type Found,
} from "./finding"
import { Finding } from "./found"
import { inspected, underAt, type Inspected, type Under } from "./inspect"
import {
  Inspecting,
  LABEL,
  onBoardAt,
  pixelsPerMm,
  type Seen,
} from "./inspecting"
import { partSaid, titlesOf, underSaid, type Said } from "./hover-said"
import { partsOf } from "./parts"
import { viasOf } from "./vias"
import {
  drawnAt,
  forgetWanted,
  PartPopover,
  PartRing,
  wantedOnSchematic,
} from "./schematic-picking"
import { drawnOf } from "./schematic-part"
import { BoardMenu, XRay, type Clicked } from "./board-menu"
import { connectionSaid } from "./xray"
import { placeOf } from "./place"
import { BoardPartsPanel } from "./parts-panel"
import { TurningBoard } from "./turning-board"
import {
  BoardSearch,
  useBoardFinding,
} from "@/components/inspiration/board-search"

/** How much of the view a drawing fills when the whole of it is shown. */
const FIT = 0.86
/** How far in a drawing can be zoomed, and out, against the whole of it. */
const NEAREST = 60
const FURTHEST = 0.5
/**
 * How much of the view what was looked for fills when it is gone to, and how near that
 * goes at most, against the whole of the drawing: a small part is seen among those round it.
 */
const FOUND_FIT = 0.6
const FOUND_NEAREST = 8
/** How long the view takes to go to it, ms. */
const GOING_MS = 380

/** How many drawings have been read: each one's style is kept to it by its number. */
let drawings = 0

/**
 * A drawing, as the page can have it: read as SVG, with nothing in it that runs or
 * reaches past it (see clean-drawing.ts), made to fill what it is put in. With how big
 * it was drawn, in its own pixels.
 */
export function readDrawing(
  markup: string
): { svg: SVGSVGElement; width: number; height: number } | null {
  const read = new DOMParser().parseFromString(markup, "image/svg+xml")
  const svg = read.documentElement
  if (!(svg instanceof SVGSVGElement)) return null
  const mark = String(++drawings)
  svg.setAttribute("data-drawing", mark)
  cleanDrawing(svg, `svg[data-drawing="${mark}"]`)
  // and no frame round the room the board is drawn in: the ground is all there is
  for (const frame of svg.querySelectorAll('[data-type="pcb_boundary"]'))
    frame.remove()
  const width = Number(svg.getAttribute("width")) || DRAWN.width
  const height = Number(svg.getAttribute("height")) || DRAWN.height
  svg.setAttribute("width", "100%")
  svg.setAttribute("height", "100%")
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet")
  svg.style.display = "block"
  return { svg, width, height }
}

/** How long a light takes to go across a board that is still being made, s. */
const SWEEP_S = 2.2
/** How wide it is, against the board as it is seen. */
const SWEEP_WIDE = 0.14
/**
 * How many times a second a board in 3D is drawn for the light going across it, when
 * nothing else has it drawn: it goes about a fifth of its own width from one drawing to
 * the next at its quickest, and not every frame the screen has.
 */
const SWEEP_RATE = 30
/**
 * How long a trace takes to draw itself in, as a build brings it, ms; how much later
 * each next one begins; and how many are drawn in one after another at most, the rest
 * with the last of them.
 */
const LAYING_MS = 900
const LAYING_APART_MS = 25
const LAYING_MOST = 60
/** How light the light is at its brightest, on the dark ground and on the light. */
const SWEEP = { dark: 0.3, light: 0.5 }

let sweeps = 0

/** How far the light leans from upright, as the shader's does (see sweepable): tan 12°. */
const LEAN = 0.21

/**
 * A light that goes across a board, over and over, while it is still being made: laid
 * over the board's outline, over everything drawn on it, in the drawing itself, so that
 * it is moved and zoomed with it. Over the whole of a drawing that has no outline (the
 * schematic). It is hidden until it is shown, and put where it is by `sweepAt`.
 */
function sweptOver(
  svg: SVGSVGElement,
  size: { width: number; height: number },
  dark: boolean
): { over: SVGGElement; light: SVGLinearGradientElement } {
  const NS = "http://www.w3.org/2000/svg"
  const make = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: Record<string, string | number>
  ) => {
    const made = document.createElementNS(NS, tag)
    for (const [name, value] of Object.entries(attributes))
      made.setAttribute(name, String(value))
    return made
  }
  const id = `sweep-${++sweeps}`
  const { width, height } = size
  const light = make("linearGradient", {
    id,
    gradientUnits: "userSpaceOnUse",
    gradientTransform: `skewX(${(-Math.atan(LEAN) * 180) / Math.PI})`,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
  })
  const peak = dark ? SWEEP.dark : SWEEP.light
  for (const [offset, opacity] of [
    [0, 0],
    [0.5, peak],
    [1, 0],
  ])
    light.append(
      make("stop", {
        offset,
        "stop-color": "#ffffff",
        "stop-opacity": opacity,
      })
    )
  const defs = make("defs", {})
  defs.append(light)
  svg.prepend(defs)

  const over = make("g", { "data-sweep": "" })
  over.style.display = "none"
  over.style.pointerEvents = "none"
  const outlines = [...svg.querySelectorAll('[data-type="pcb_board"]')]
  if (outlines.length === 0) {
    over.append(
      make("rect", { x: 0, y: 0, width, height, fill: `url(#${id})` })
    )
    svg.append(over)
    return { over, light }
  }
  for (const outline of outlines) {
    const filled = outline.cloneNode(false) as SVGElement
    for (const name of ["class", "data-type", "data-pcb-layer", "stroke-width"])
      filled.removeAttribute(name)
    filled.setAttribute("fill", `url(#${id})`)
    filled.setAttribute("stroke", "none")
    over.append(filled)
  }
  // over all that is drawn, in the frame the outline is drawn in (a board seen from
  // under is drawn turned over, in a frame of its own)
  ;(outlines[0].parentElement ?? svg).append(over)
  return { over, light }
}

/**
 * Put the light this share of the way across what it is laid over (`box`, in the
 * drawing's units): from short of it to past it, eased, as the 3D's goes.
 */
function sweepAt(light: SVGLinearGradientElement, box: DOMRect, share: number) {
  const eased = share * share * (3 - 2 * share)
  const wide = box.width * SWEEP_WIDE
  // (leaning, its foot is further back than its head: the band has that much more to go)
  const from = box.x - wide
  const to = box.x + box.width + LEAN * (box.y + box.height) + wide
  const middle = from + (to - from) * eased
  light.setAttribute("x1", String(middle - wide))
  light.setAttribute("x2", String(middle + wide))
}

/** Where a drawing is looked at: the middle of what is shown, and its pixels to the view's one. */
type Looking = { x: number; y: number; scale: number }

/**
 * What a trace in a drawing is known by from one build to the next: how it goes, and
 * how wide it is. (What tscircuit calls each is counted afresh in each build.)
 */
const traceOf = (trace: Element) =>
  `${trace.getAttribute("d") ?? ""}|${trace.getAttribute("stroke-width") ?? ""}`

/**
 * The traces of the drawing of each board last shown, by the board and the way it is
 * drawn: kept here, as a drawing is put away while the board is built again and a new
 * one comes in its place.
 */
const lastTraces = new Map<string, Set<string>>()
/**
 * The traces of each board being drawn in, and since when (ms, as the page counts): a
 * board is often drawn again a moment after a build, and they go on from where they were.
 */
const layingSince = new Map<string, { traces: Set<string>; at: number }>()
/** How long all the traces a build brings take to be drawn in, ms. */
const LAYING_ALL_MS = LAYING_MS + LAYING_MOST * LAYING_APART_MS

/**
 * Have the traces of a drawing that the one before it did not have draw themselves in,
 * along the way they go, one a little after another: what a build brought, as it came.
 * `gone` is how far along that already is, ms, where it was begun in a drawing before.
 */
function lay(traces: SVGGeometryElement[], gone = 0) {
  traces.forEach((trace, index) => {
    const length = trace.getTotalLength()
    if (!(length > 0)) return
    trace.style.strokeDasharray = String(length)
    const laying = trace.animate(
      [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
      {
        duration: LAYING_MS,
        delay: Math.min(index, LAYING_MOST) * LAYING_APART_MS,
        easing: "ease-out",
        fill: "backwards",
      }
    )
    laying.currentTime = gone
    laying.onfinish = () => (trace.style.strokeDasharray = "")
  })
}

/**
 * A drawing of the board, filling the view, moved about and zoomed by the hand. It
 * keeps where it was looked at as long as it is the same board drawn the same way.
 * While the board is being made (`swept`) a light goes across it, the same at every
 * step, and each trace a build brings draws itself in.
 * Where it has the board as tscircuit has it (`circuit`), what the pointer is over is
 * said over it, and what was looked for is lit on it (`found`). On the schematic
 * (`schematic`), the part the pointer is over is ringed, and one clicked says what it is.
 */
function Drawing({
  id,
  markup,
  dark,
  swept,
  routing = null,
  circuit = null,
  board = null,
  side = "top",
  ground,
  found = null,
  goneTo = 0,
  schematic = null,
}: {
  /** the board, of which project, and the way it is drawn */
  id: string
  markup: string
  dark: boolean
  /** the board is still being made: a light goes across it, over and over */
  swept: boolean
  /** what the router is trying, while it is routed: drawn over the board */
  routing?: Routing | null
  /** the board as tscircuit has it, for what the pointer is over to be said */
  circuit?: Circuit | null
  /** and what of it can be pointed at (see inspect.ts) */
  board?: Inspected | null
  /** the side of the board drawn */
  side?: "top" | "bottom"
  /** the colour it is drawn on */
  ground: string
  /** what was looked for on it, to be lit */
  found?: Found[] | null
  /** how many times what was found has been gone to: once more, and it is again */
  goneTo?: number
  /** the board as tscircuit has it, where this is its schematic */
  schematic?: Circuit | null
}) {
  const holder = React.useRef<HTMLDivElement>(null)
  // (the board being made, as it is when a new drawing comes, without waiting on it:
  // kept before the drawing is, which is what reads it)
  const making = React.useRef(swept)
  React.useLayoutEffect(() => {
    making.current = swept
  }, [swept])
  const looking = React.useRef<Looking | null>(null)
  const sweep = React.useRef<ReturnType<typeof sweptOver> | null>(null)
  /** how big the whole of it is shown: what zooming in and out is counted from */
  const whole = React.useRef(1)
  /** how the board's millimetres lie in the drawing, where it says (see placeOf) */
  const place = React.useRef<ReturnType<typeof placeOf>>(null)
  /** go to a box of the drawing, in its own units (see below) */
  const goTo = React.useRef<
    ((box: { x: number; y: number; w: number; h: number }) => void) | null
  >(null)
  /** how it is seen now, for what is said over it to lie where it should */
  const [seen, setSeen] = React.useState<Seen | null>(null)
  /** on the schematic, the part the pointer is over, and the one picked out */
  const [hovered, setHovered] = React.useState<string | null>(null)
  // (a part asked for on the schematic, from the board, is picked out as it is drawn)
  const [picked, setPicked] = React.useState<string | null>(() => {
    const name = schematic ? wantedOnSchematic() : null
    return name && schematic ? drawnOf(schematic, name) : null
  })
  /** where a press began, and on what part of the schematic, for a click to be told */
  const pressed = React.useRef<{
    x: number
    y: number
    on: string | null
  } | null>(null)
  /** the drawing's holder, for what is ringed on the schematic to be put over it */
  const [within, setWithin] = React.useState<HTMLDivElement | null>(null)
  const held = React.useCallback((element: HTMLDivElement | null) => {
    holder.current = element
    setWithin(element)
  }, [])
  /** on the board, what was clicked, for what can be done with it; and what is X-rayed */
  const [clicked, setClicked] = React.useState<Clicked | null>(null)
  const [xRayed, setXRayed] = React.useState<string | null>(null)
  /** how many times the view has moved: what is ringed on it goes with it */
  const [viewed, setViewed] = React.useState(0)
  /** what the pointer is over, of which board, and where the pointer is, px */
  const [pointed, setPointed] = React.useState<{
    under: Under
    of: Inspected
    at: [number, number]
  } | null>(null)

  React.useLayoutEffect(() => {
    const within = holder.current
    const drawing = readDrawing(markup)
    if (!within || !drawing) return
    const { svg, ...size } = drawing
    place.current = placeOf(svg, side === "bottom" ? size.width : null)
    sweep.current = sweptOver(svg, size, dark)
    within.replaceChildren(svg)
    const drawn = [...svg.querySelectorAll<SVGGeometryElement>(".pcb-trace")]
    const had = lastTraces.get(id)
    lastTraces.set(id, new Set(drawn.map(traceOf)))
    const now = performance.now()
    const fresh = had ? drawn.filter((trace) => !had.has(traceOf(trace))) : []
    const earlier = layingSince.get(id)
    const going =
      fresh.length === 0 && earlier && now - earlier.at < LAYING_ALL_MS
        ? earlier
        : null
    if (
      making.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      if (fresh.length > 0) {
        layingSince.set(id, { traces: new Set(fresh.map(traceOf)), at: now })
        lay(fresh)
      } else if (going)
        lay(
          drawn.filter((trace) => going.traces.has(traceOf(trace))),
          now - going.at
        )
    }

    const show = () => {
      const at = looking.current
      const { width, height } = within.getBoundingClientRect()
      if (!at || width === 0 || height === 0) return
      const w = width * at.scale
      const h = height * at.scale
      svg.setAttribute("viewBox", `${at.x - w / 2} ${at.y - h / 2} ${w} ${h}`)
      const laid = place.current
      setSeen(laid ? { at, width, height, place: laid } : null)
      setViewed((times) => times + 1)
    }
    const fit = () => {
      const { width, height } = within.getBoundingClientRect()
      if (width === 0 || height === 0) return
      whole.current = Math.max(size.width / width, size.height / height) / FIT
      looking.current = {
        x: size.width / 2,
        y: size.height / 2,
        scale: whole.current,
      }
      show()
    }
    /** the view on its way to something, while it goes there: the hand stops it */
    let gliding = 0
    const stay = () => cancelAnimationFrame(gliding)
    /** Zoom by so much, on a place in the view, as its pixels from the top left. */
    const zoom = (by: number, px: number, py: number) => {
      stay()
      const at = looking.current
      if (!at) return
      const { width, height } = within.getBoundingClientRect()
      const scale = Math.min(
        whole.current / FURTHEST,
        Math.max(whole.current / NEAREST, at.scale * by)
      )
      // the place under the pointer stays under it
      const dx = px - width / 2
      const dy = py - height / 2
      looking.current = {
        x: at.x + dx * (at.scale - scale),
        y: at.y + dy * (at.scale - scale),
        scale,
      }
      show()
    }
    const move = (dx: number, dy: number) => {
      stay()
      const at = looking.current
      if (!at) return
      looking.current = {
        ...at,
        x: at.x - dx * at.scale,
        y: at.y - dy * at.scale,
      }
      show()
    }

    // Go to a box of the drawing: as near as has it fill so much of the view, and no
    // nearer than so; glided to, from where the view is, as the eye would go.
    goTo.current = (box) => {
      const from = looking.current
      const { width, height } = within.getBoundingClientRect()
      if (!from || width === 0 || height === 0) return
      const scale = Math.min(
        whole.current / FURTHEST,
        Math.max(
          whole.current / FOUND_NEAREST,
          Math.max(box.w / width, box.h / height) / FOUND_FIT
        )
      )
      const to = { x: box.x, y: box.y, scale }
      stay()
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        looking.current = to
        show()
        return
      }
      const began = performance.now()
      const step = () => {
        const share = Math.min(1, (performance.now() - began) / GOING_MS)
        const eased = 1 - (1 - share) ** 3
        looking.current = {
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased,
          // (zoomed evenly, as a pinch does: by so much a step, not so far)
          scale: from.scale * (to.scale / from.scale) ** eased,
        }
        show()
        if (share < 1) gliding = requestAnimationFrame(step)
      }
      gliding = requestAnimationFrame(step)
    }

    if (looking.current === null) fit()
    else show()
    const sized = new ResizeObserver(() => (looking.current ? show() : fit()))
    sized.observe(within)

    const source = scrollSource()
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const { scrolling, wheelReversed, zoomSpeed } = usePreferences.getState()
      const from =
        scrolling === "auto"
          ? source(event, performance.now())
          : scrolling === "trackpad"
            ? "fingers"
            : "wheel"
      // fingers across a trackpad move it, as a page is moved; a pinch arrives as a
      // scroll with Ctrl held, and zooms, as a wheel does
      if (!event.ctrlKey && from === "fingers") {
        move(-event.deltaX, -event.deltaY)
        return
      }
      // as hard as the model's flat views zoom, at the speed the settings have (a
      // wheel may count in lines; the drawing's scale is what the view's is not, so it
      // goes the other way)
      const lines = event.deltaMode === 1 ? 10 : 1
      const way = !event.ctrlKey && wheelReversed ? -1 : 1
      const box = within.getBoundingClientRect()
      zoom(
        1 /
          flatZoom(
            event.deltaY * lines * (event.ctrlKey ? PINCH : 1) * way,
            zoomSpeed
          ),
        event.clientX - box.left,
        event.clientY - box.top
      )
    }
    let held: { x: number; y: number } | null = null
    const down = (event: PointerEvent) => {
      held = { x: event.clientX, y: event.clientY }
      within.setPointerCapture(event.pointerId)
    }
    const drag = (event: PointerEvent) => {
      if (!held) return
      move(event.clientX - held.x, event.clientY - held.y)
      held = { x: event.clientX, y: event.clientY }
    }
    const up = () => {
      held = null
    }
    within.addEventListener("wheel", wheel, { passive: false })
    within.addEventListener("pointerdown", down)
    within.addEventListener("pointermove", drag)
    within.addEventListener("pointerup", up)
    within.addEventListener("pointercancel", up)
    within.addEventListener("dblclick", fit)
    return () => {
      stay()
      goTo.current = null
      sized.disconnect()
      within.removeEventListener("wheel", wheel)
      within.removeEventListener("pointerdown", down)
      within.removeEventListener("pointermove", drag)
      within.removeEventListener("pointerup", up)
      within.removeEventListener("pointercancel", up)
      within.removeEventListener("dblclick", fit)
    }
  }, [id, markup, dark, side])

  React.useLayoutEffect(() => {
    const svg = holder.current?.firstElementChild
    if (!(svg instanceof SVGSVGElement)) return
    svg.querySelector(":scope > [data-routing]")?.remove()
    if (routing && place.current)
      svg.append(routingOver(routing, place.current))
  }, [routing, markup])

  // Enter, where something was found, goes to all of it.
  const wentTo = React.useRef(goneTo)
  React.useEffect(() => {
    if (goneTo === wentTo.current) return
    wentTo.current = goneTo
    const laid = place.current
    const box = found && board && foundBox(found, board)
    if (!laid || !box) return
    const [x1, y1] = [
      laid.a * (box.x - box.w / 2) + laid.e,
      laid.d * (box.y - box.h / 2) + laid.f,
    ]
    const [x2, y2] = [
      laid.a * (box.x + box.w / 2) + laid.e,
      laid.d * (box.y + box.h / 2) + laid.f,
    ]
    goTo.current?.({
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    })
  }, [goneTo, found, board])

  React.useEffect(() => {
    const laid = sweep.current
    if (!laid) return
    const { over, light } = laid
    over.style.display = swept ? "" : "none"
    if (!swept) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (still) {
      over.style.display = "none"
      return
    }
    const box = over.getBBox()
    let frame = 0
    const go = () => {
      sweepAt(light, box, (performance.now() / 1000 / SWEEP_S) % 1)
      frame = requestAnimationFrame(go)
    }
    go()
    return () => cancelAnimationFrame(frame)
  }, [markup, dark, swept])

  // Esc leaves the X-ray, and is taken by it: PCB mode is not left as well
  React.useEffect(() => {
    if (!xRayed) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      setXRayed(null)
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [xRayed])

  // (and once the schematic is drawn, a part asked for of it is had)
  React.useEffect(() => {
    if (schematic) forgetWanted()
  }, [schematic])

  /** What is under the pointer, while nothing is held down. */
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    if (schematic)
      return setHovered(event.buttons === 0 ? drawnAt(event.target) : null)
    if (!board || !seen || event.buttons !== 0) return setPointed(null)
    const box = event.currentTarget.getBoundingClientRect()
    const at: [number, number] = [
      event.clientX - box.left,
      event.clientY - box.top,
    ]
    // (a pixel or two from a thing is on it)
    const under = underAt(
      board,
      onBoardAt(seen, ...at),
      side,
      2 / pixelsPerMm(seen)
    )
    setPointed(under ? { under, of: board, at } : null)
  }

  return (
    <>
      <div
        ref={held}
        className={cn(
          "absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing [&>svg]:transition-opacity",
          xRayed && "[&>svg]:opacity-20"
        )}
        onPointerMove={point}
        onPointerLeave={() => {
          setPointed(null)
          setHovered(null)
        }}
        onPointerDown={(event) => {
          pressed.current = {
            x: event.clientX,
            y: event.clientY,
            on: drawnAt(event.target),
          }
        }}
        // (a press that moved the drawing is no click: one that did not picks out the
        // part it was on, or nothing)
        onClick={(event) => {
          const press = pressed.current
          pressed.current = null
          if (!press) return
          if (
            Math.hypot(event.clientX - press.x, event.clientY - press.y) >
            CLICK_PX
          )
            return
          if (schematic) setPicked(press.on)
          else if (pointed?.of === board && pointed)
            setClicked({
              under: pointed.under,
              x: event.clientX,
              y: event.clientY,
            })
        }}
      />
      {board && seen && xRayed && (
        <>
          <XRay board={board} joined={xRayed} seen={seen} side={side} />
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md">
            X-ray of {connectionSaid(board, xRayed, null)}
            <span className="ml-2 text-background/60">Esc to leave</span>
          </div>
        </>
      )}
      {board && circuit && (
        <BoardMenu
          clicked={clicked}
          board={board}
          circuit={circuit}
          onXRay={setXRayed}
          onClose={() => setClicked(null)}
        />
      )}
      {schematic && (
        <>
          <PartRing
            within={within}
            drawn={picked ?? hovered}
            picked={picked !== null}
            viewed={viewed}
          />
          {hovered !== picked && picked !== null && hovered !== null && (
            <PartRing
              within={within}
              drawn={hovered}
              picked={false}
              viewed={viewed}
            />
          )}
          <PartPopover
            within={within}
            drawn={picked}
            circuit={schematic}
            onClose={() => setPicked(null)}
          />
        </>
      )}
      {board && seen && found && found.length > 0 && (
        <Finding found={found} board={board} seen={seen} ground={ground} />
      )}
      {circuit && seen && pointed?.of === board && (
        <Inspecting
          under={pointed.under}
          pointer={pointed.at}
          seen={seen}
          circuit={circuit}
        />
      )}
    </>
  )
}

/** A via, as the app draws one over the board: a disc a mm across, sized to each. */
const VIA_DISC = new THREE.CircleGeometry(0.5, 24)
/** How far over the board's face its vias are drawn, mm: not to be lost in it. */
const VIA_LIFT = 0.005
/** How much darker a via's hole is than its copper, 0 to 1. */
const VIA_HOLE_DARK = 0.5

/** How far a press can go, px, and still be a click on what it began on. */
const CLICK_PX = 4

/**
 * Two triangles that meet at more than this, in degrees, have an edge between them: as
 * the model's parts made of a mesh have (viewport/load.ts).
 */
const CREASE = 20
/** How strong a line of an edge is, as the model's are in its solid look. */
const LINE_OPACITY = 0.85

/** How many samples a picture on a face is read with where it is seen at a slant. */
const SLANT = 16

/** A line drawn as the model's are: a pixel wide, whatever the distance, and dark. */
const lineMaterial = () =>
  new LineMaterial({
    color: EDGE,
    linewidth: 1,
    transparent: true,
    opacity: LINE_OPACITY,
    depthWrite: false,
  })

/**
 * The light that goes across a board in 3D while it is still being made, as it goes
 * across the drawings: x, how far across the view its middle is (0 to 1, along a line
 * that leans as the drawings' does); y, how wide it is; z, how light, which is nothing
 * while the board is not being made. And how big the view is, in its own pixels.
 */
type Sweep = {
  at: { value: THREE.Vector3 }
  size: { value: THREE.Vector2 }
  /**
   * Put the light where it is now, so wide and so light, on a view so big: false where
   * it was there already.
   */
  set(
    x: number,
    wide: number,
    light: number,
    size: THREE.Vector2 | null
  ): boolean
}

function newSweep(): Sweep {
  const at = { value: new THREE.Vector3(0, 1, 0) }
  const size = { value: new THREE.Vector2(1, 1) }
  return {
    at,
    size,
    set(x, wide, light, view) {
      if (view) size.value.copy(view)
      if (at.value.x === x && at.value.z === light && !view) return false
      at.value.set(x, wide, light)
      return true
    },
  }
}

/** Give a board's faces the light that goes across it (see Sweep), out until it is lit. */
function sweepable(material: THREE.Material, sweep: Sweep) {
  const before = material.onBeforeCompile.bind(material)
  const key = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer)
    shader.uniforms.sweepAt = sweep.at
    shader.uniforms.sweepSize = sweep.size
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform vec3 sweepAt;\nuniform vec2 sweepSize;\nvoid main() {"
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float across = (gl_FragCoord.x + gl_FragCoord.y * 0.21) / (sweepSize.x + sweepSize.y * 0.21);
        float off = (across - sweepAt.x) / sweepAt.y;
        gl_FragColor.rgb += sweepAt.z * exp(-off * off);`
      )
  }
  material.customProgramCacheKey = () => `board-sweep+${key()}`
}

/** A line drawn over a board, which a click goes through to what is under it. */
function unpicked(line: LineSegments2) {
  line.raycast = () => {}
  return line
}

/**
 * A board in 3D as the view shows it: as tscircuit built it, in the app's colours (see
 * colours.ts), with its lines drawn as the model's parts made of a mesh have theirs:
 * wherever two of its triangles meet at an edge, and the outline of its curved faces,
 * wherever that is seen from. It is turned half round, so that its own X and Y are the model's (as its
 * STEP file has them) and the view's camera comes to it from its front right corner, as
 * to a model. With the box round it, in the model's frame, which the camera goes by.
 */
export function standing(board: THREE.Group, colours: PcbColours) {
  const holder = new THREE.Group()
  holder.rotation.y = Math.PI
  holder.add(board)
  const made: { dispose(): void }[] = []
  const sweep = newSweep()
  const paint = boardPaint(colours)
  // the faces of the board's edge, whose colour is the app's, and those of what is on
  // it that are in the theme's shades of grey (see colours.ts)
  const edges: { material: THREE.MeshStandardMaterial; own: THREE.Color }[] = []
  const greys: {
    material: THREE.MeshStandardMaterial
    own: THREE.Color
    shaded: Shaded
  }[] = []
  const slight = Math.cos((CREASE * Math.PI) / 180)
  const meshes: THREE.Mesh[] = []
  board.traverse((thing) => {
    if (thing instanceof THREE.Mesh) meshes.push(thing)
  })
  // Each thing on the board is a node of its own, by its name on the board (U1): its
  // faces are given colours of their own, to be lit by themselves, each remembering its
  // own colour. (Parts of one kind share theirs as they come.)
  const lit = new Map<
    string,
    { material: THREE.MeshStandardMaterial; own: THREE.Color }[]
  >()
  const named = new Map<THREE.Object3D, string>()
  for (const node of board.children) {
    if (!node.name) continue
    const faces: { material: THREE.MeshStandardMaterial; own: THREE.Color }[] =
      []
    node.traverse((thing) => {
      named.set(thing, node.name)
      if (!(thing instanceof THREE.Mesh)) return
      const own = [thing.material].flat().map((material) => {
        // (the one it came with is no one's now)
        made.push(material)
        const copy = (material as THREE.Material).clone()
        // (the board itself in the app's colours, which are then its own)
        const ours = inOurColours(copy, paint)
        if (copy instanceof THREE.MeshStandardMaterial) {
          const face = { material: copy, own: copy.color.clone() }
          faces.push(face)
          const shaded = ours === null ? shadedOf(copy.color) : null
          if (ours === "edge") edges.push(face)
          else if (shaded) {
            greys.push({ ...face, shaded })
            inShade(shaded, colours, face.own)
            copy.color.copy(face.own)
          }
        }
        return copy
      })
      thing.material = Array.isArray(thing.material) ? own : own[0]
    })
    lit.set(node.name, faces)
  }
  for (const mesh of meshes) {
    // the faces stand back a little, for the lines over them to be seen; and the
    // picture the board's face is (its copper, print and mask) stays sharp seen at a
    // slant, as far as the screen can keep it (three.js takes no more than it can)
    for (const material of [mesh.material].flat()) {
      Object.assign(material, {
        polygonOffset: true,
        polygonOffsetFactor: 1.5,
        polygonOffsetUnits: 1.5,
      })
      const face = (material as THREE.MeshStandardMaterial).map
      if (face) face.anisotropy = SLANT
      sweepable(material, sweep)
    }
    const creases = new THREE.EdgesGeometry(mesh.geometry, CREASE)
    const edges = new LineSegmentsGeometry().setPositions(
      creases.attributes.position.array as Float32Array
    )
    creases.dispose()
    const drawn = lineMaterial()
    mesh.add(unpicked(new LineSegments2(edges, drawn)))
    made.push(edges, drawn)
    const { index, attributes } = mesh.geometry
    if (!index) continue
    const { ends, ways } = contoursOf(
      attributes.position.array,
      index.array,
      (_, __, cos) => cos > slight
    )
    if (ends.length === 0) continue
    const outline = new LineSegmentsGeometry().setPositions(ends)
    const each = new THREE.InstancedInterleavedBuffer(
      Float32Array.from(ways),
      6,
      1
    )
    outline.setAttribute(
      "wayA",
      new THREE.InterleavedBufferAttribute(each, 3, 0)
    )
    outline.setAttribute(
      "wayB",
      new THREE.InterleavedBufferAttribute(each, 3, 3)
    )
    const turning = lineMaterial()
    turning.onBeforeCompile = onlyWhereItTurns
    mesh.add(unpicked(new LineSegments2(outline, turning)))
    made.push(outline, turning)
  }
  // its vias, drawn by the app over each of its faces as the board as tscircuit has it
  // comes (see `vias` below): in the colour of its bare copper, as the theme has it
  const vias = new THREE.Group()
  const viaMaterials = {
    copper: new THREE.MeshStandardMaterial({
      metalness: 0.5,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    // (its hole is lined with copper: the copper under it, darkened)
    hole: new THREE.MeshBasicMaterial({
      color: "#000000",
      transparent: true,
      opacity: VIA_HOLE_DARK,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  }
  viaMaterials.copper.color = viaCopper(paint)
  made.push(viaMaterials.copper, viaMaterials.hole)
  holder.updateMatrixWorld(true)
  const { min, max } = new THREE.Box3().setFromObject(holder)
  board.add(vias)
  // (the world's Y is the model's Z, and its Z the model's -Y)
  const box = new THREE.Box3(
    new THREE.Vector3(min.x, -max.z, min.y),
    new THREE.Vector3(max.x, -min.z, max.y)
  )
  return {
    holder,
    box,
    sweep,
    /** The name on the board of what this is of: null where it is of none. */
    nameOf: (thing: THREE.Object3D) => named.get(thing) ?? null,
    /**
     * Light the things on the board so much each (0 to 1), by their names, in this
     * colour: and the rest not at all, but darkened to `rest` of their own.
     */
    light: (how: Map<string, number>, colour: THREE.Color, rest = 1) => {
      for (const [name, faces] of lit)
        for (const { material, own } of faces) {
          const much = how.get(name)
          if (much === undefined) material.color.copy(own).multiplyScalar(rest)
          else material.color.copy(own).lerp(colour, much)
        }
    },
    /** Have its keep-outs hatched by the app, where the board as tscircuit has it says. */
    keepOuts: (circuit: Circuit | null) => keepOutsOf(paint, circuit),
    /** And its vias drawn, as copper round a hole, where it says they are. */
    vias: (circuit: Circuit | null) => {
      for (const old of [...vias.children]) {
        vias.remove(old)
        ;(old as THREE.InstancedMesh).dispose()
      }
      const all = viasOf(circuit)
      const board = circuit?.find((element) => element.type === "pcb_board")
      const half =
        (typeof board?.thickness === "number" ? board.thickness : 1.6) / 2
      for (const side of ["top", "bottom"] as const) {
        const on = all.filter((via) => via.sides.includes(side))
        if (on.length === 0) continue
        const up = side === "top" ? 1 : -1
        // (a disc lies across the view's Z: turned to face up from the top, or down)
        const facing = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          (-up * Math.PI) / 2
        )
        for (const [material, size, over] of [
          [viaMaterials.copper, (via: (typeof on)[number]) => via.outer, 0],
          [viaMaterials.hole, (via: (typeof on)[number]) => via.hole, 0.002],
        ] as const) {
          const mesh = new THREE.InstancedMesh(VIA_DISC, material, on.length)
          on.forEach((via, index) =>
            mesh.setMatrixAt(
              index,
              new THREE.Matrix4().compose(
                // (tscircuit's 3D has the board's X as its -X, and its Y as its Z)
                new THREE.Vector3(-via.x, up * (half + VIA_LIFT + over), via.y),
                facing,
                new THREE.Vector3(size(via), size(via), 1)
              )
            )
          )
          // (not in the way of what is pointed at: the board and its parts are)
          mesh.raycast = () => {}
          vias.add(mesh)
        }
      }
    },
    /**
     * Have the board itself drawn in other colours of the theme's: what is lit of it
     * is lit again (by `light`) to be seen in them.
     */
    paint: (colours: PcbColours) => {
      repaint(paint, colours)
      for (const face of edges) {
        face.own.copy(paint.edge)
        face.material.color.copy(paint.edge)
      }
      for (const { material, own, shaded } of greys)
        material.color.copy(inShade(shaded, colours, own))
    },
    // (and in the view's own frame, for the light to go across no more than the board)
    seen: new THREE.Box3(min.clone(), max.clone()),
    dispose: () => {
      for (const thing of made) thing.dispose()
      disposeBoard(board)
    },
  }
}

/** How light the light across a board in 3D is at its brightest, on either ground. */
const SWEPT_3D = { dark: 0.42, light: 0.45 }

/**
 * The light going across a board in 3D, over and over, while it is still being made:
 * the view, drawn only when something changes, is drawn again for as long as it goes.
 * It goes as the drawings' does, and is put out where the system is set for less motion.
 */
function Sweeping({
  sweep,
  seen,
  swept,
  dark,
}: {
  sweep: Sweep
  /** the box round the board, in the view's frame: the light goes across that */
  seen: THREE.Box3
  swept: boolean
  dark: boolean
}) {
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const corners = React.useMemo(
    () =>
      [seen.min.x, seen.max.x].flatMap((x) =>
        [seen.min.y, seen.max.y].flatMap((y) =>
          [seen.min.z, seen.max.z].map((z) => new THREE.Vector3(x, y, z))
        )
      ),
    [seen]
  )
  const corner = React.useMemo(() => new THREE.Vector3(), [])
  const still = React.useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )
  const lit = swept && !still
  const view = React.useMemo(() => new THREE.Vector2(), [])
  useFrame(() => {
    if (!lit) {
      if (sweep.set(0, 1, 0, null)) invalidate()
      return
    }
    gl.getDrawingBufferSize(view)
    // how far across the view the board reaches, the way the light goes (as the
    // shader counts it: see sweepable)
    let first = Infinity
    let last = -Infinity
    for (const at of corners) {
      corner.copy(at).project(camera)
      const across =
        (((corner.x + 1) / 2) * view.x + ((corner.y + 1) / 2) * view.y * 0.21) /
        (view.x + view.y * 0.21)
      first = Math.min(first, across)
      last = Math.max(last, across)
    }
    // eased, as the drawings' is: from short of the board to past it
    const share = (performance.now() / 1000 / SWEEP_S) % 1
    const eased = share * share * (3 - 2 * share)
    const reach = last - first
    sweep.set(
      first - reach * 0.15 + reach * 1.3 * eased,
      reach * SWEEP_WIDE,
      dark ? SWEPT_3D.dark : SWEPT_3D.light,
      view
    )
  })
  React.useEffect(() => invalidate(), [lit, invalidate])
  // (less often with the window behind another, and never while it cannot be seen)
  const rate = rateWhen(useWatched(), lit ? SWEEP_RATE : 0)
  React.useEffect(() => {
    if (rate === 0) return
    const drawn = setInterval(() => invalidate(), 1000 / rate)
    return () => clearInterval(drawn)
  }, [rate, invalidate])
  return null
}

/** How far a part with no 3D of its own stands off the board, as it is gone to: mm. */
const STANDS = 1
/** How much of the board round the parts gone to is in view too, against their size. */
const AROUND = 0.6

/**
 * The box that some parts of a board fill, by their names on it (C1, U1), in the frame
 * the camera goes by (the model's: the board's own X and Y, and up from it). Where a
 * part is in the board's 3D, the box is of that; where it is not, of the room it takes
 * up on the board, on the side it is on. Null where none of them is on the board.
 */
function partsBox(
  holder: THREE.Object3D,
  circuit: Circuit | null,
  names: string[]
): THREE.Box3 | null {
  const box = new THREE.Box3()
  holder.updateMatrixWorld(true)
  const named = new Map<string, string>()
  let thick = 1.6
  for (const element of circuit ?? []) {
    if (element.type === "source_component")
      named.set(String(element.source_component_id), String(element.name))
    if (element.type === "pcb_board" && typeof element.thickness === "number")
      thick = element.thickness
  }
  for (const name of names) {
    const own = holder.getObjectByName(name)
    let meshes = 0
    own?.traverse((thing) => {
      if (thing instanceof THREE.Mesh) meshes++
    })
    if (own && meshes > 0) {
      const { min, max } = new THREE.Box3().setFromObject(own)
      // (the world's Y is the model's Z, and its Z the model's -Y)
      box.union(
        new THREE.Box3(
          new THREE.Vector3(min.x, -max.z, min.y),
          new THREE.Vector3(max.x, -min.z, max.y)
        )
      )
      continue
    }
    const placed = (circuit ?? []).find(
      (element) =>
        element.type === "pcb_component" &&
        named.get(String(element.source_component_id)) === name
    ) as
      | {
          center?: { x: number; y: number }
          width?: number
          height?: number
          layer?: string
        }
      | undefined
    if (!placed?.center || !placed.width || !placed.height) continue
    const under = placed.layer === "bottom"
    const face = under ? -thick / 2 : thick / 2
    box.union(
      new THREE.Box3(
        new THREE.Vector3(
          placed.center.x - placed.width / 2,
          placed.center.y - placed.height / 2,
          under ? face - STANDS : face
        ),
        new THREE.Vector3(
          placed.center.x + placed.width / 2,
          placed.center.y + placed.height / 2,
          under ? face : face + STANDS
        )
      )
    )
  }
  if (box.isEmpty()) return null
  const size = box.getSize(new THREE.Vector3())
  return box.expandByScalar(Math.max(size.x, size.y) * AROUND)
}

/** How far the pointer can have moved between press and release for it to be a click, px. */
const DRAGGED = 4
/** How much a part whose square in the list of them the pointer is over is lit, 0 to 1. */
const HOVER_LIT = 0.55
/** And how much of its own light the rest of the board keeps meanwhile. */
const HOVER_REST = 0.4

/**
 * Picking a part of the board out with a click, at the place clicked: a click on the
 * board itself, or on nothing, lets go of it. Not the end of a drag, which moved the
 * view. Over a part, the pointer says it can be clicked.
 */
function Picking({
  shown,
  names,
  inspecting,
  titles,
  label,
}: {
  shown: ReturnType<typeof standing>
  /** what is on the board, by the names it has there: what a click picks out */
  names: Set<string>
  /** what of the board can be pointed at, on its faces (see inspect.ts) */
  inspecting: Inspected | null
  /** what each part is, by its name */
  titles: Map<string, string>
  /** where what the pointer is over is said, beside it */
  label: React.RefObject<HTMLDivElement | null>
}) {
  const gl = useThree((state) => state.gl)
  const get = useThree((state) => state.get)
  React.useEffect(() => {
    const canvas = gl.domElement
    const ray = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    /** The part under the pointer, and where on it: null where it is none. */
    const under = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect()
      pointer.set(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        -((event.clientY - box.top) / box.height) * 2 + 1
      )
      ray.setFromCamera(pointer, get().camera)
      const hit = ray.intersectObject(shown.holder, true)[0]
      const name = hit ? shown.nameOf(hit.object) : null
      return hit && name && names.has(name) ? { name, at: hit.point } : null
    }
    /**
     * What the pointer is over, said: a part, or, on the board's top or underside, what
     * is there (a pad, a hole, a trace). Null for nothing to say.
     */
    const saidAt = (event: PointerEvent): Said | null => {
      const box = canvas.getBoundingClientRect()
      pointer.set(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        -((event.clientY - box.top) / box.height) * 2 + 1
      )
      const camera = get().camera
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObject(shown.holder, true)[0]
      if (!hit) return null
      const name = shown.nameOf(hit.object)
      if (name && names.has(name)) return partSaid(name, titles)
      if (!inspecting || !(hit.object instanceof THREE.Mesh)) return null
      const material = [hit.object.material].flat()[
        hit.face?.materialIndex ?? 0
      ]
      const side = /^TopMaterial/.test(material?.name ?? "")
        ? "top"
        : /^BottomMaterial/.test(material?.name ?? "")
          ? "bottom"
          : null
      if (!side) return null
      // (a pixel or two from a thing is on it: so many mm at the distance it is seen)
      const perPixel =
        camera instanceof THREE.OrthographicCamera
          ? (camera.top - camera.bottom) / camera.zoom / box.height
          : (2 *
              hit.distance *
              Math.tan(
                ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360
              )) /
            box.height
      const [x, y] = onBoard(hit.point)
      const found = underAt(inspecting, { x, y }, side, perPixel * 2)
      return found ? underSaid(found, titles) : null
    }
    /** Say what the pointer is over beside it, or nothing. */
    const say = (event: PointerEvent | null) => {
      const shown = label.current
      if (!shown) return
      const said = event && event.buttons === 0 ? saidAt(event) : null
      if (!said) {
        shown.hidden = true
        return
      }
      const title = document.createElement("div")
      title.textContent = said.title
      const lines: HTMLElement[] = [title]
      if (said.detail) {
        const detail = document.createElement("div")
        detail.className = "text-background/65"
        detail.textContent = said.detail
        lines.push(detail)
      }
      shown.replaceChildren(...lines)
      const within = (shown.offsetParent ?? canvas).getBoundingClientRect()
      shown.style.left = `${event!.clientX - within.left + 14}px`
      shown.style.top = `${event!.clientY - within.top + 14}px`
      shown.hidden = false
    }
    const away = () => say(null)
    let down: { x: number; y: number } | null = null
    const press = (event: PointerEvent) => {
      down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
    }
    const release = (event: PointerEvent) => {
      if (!down) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      down = null
      if (moved > DRAGGED) return
      const found = under(event)
      useStore
        .getState()
        .pickBoardPart(
          found ? { name: found.name, at: onBoard(found.at) } : null
        )
    }
    const move = (event: PointerEvent) => {
      say(event)
      if (event.buttons !== 0) return
      canvas.style.cursor = under(event) ? "pointer" : ""
    }
    canvas.addEventListener("pointerdown", press)
    canvas.addEventListener("pointerup", release)
    canvas.addEventListener("pointermove", move)
    canvas.addEventListener("pointerleave", away)
    canvas.addEventListener("wheel", away, { passive: true })
    return () => {
      canvas.removeEventListener("pointerdown", press)
      canvas.removeEventListener("pointerup", release)
      canvas.removeEventListener("pointermove", move)
      canvas.removeEventListener("pointerleave", away)
      canvas.removeEventListener("wheel", away)
      canvas.style.cursor = ""
      away()
    }
  }, [gl, get, shown, names, inspecting, titles, label])
  return null
}

/**
 * The board's keep-outs hatched by the app, and its vias drawn, as soon as the board as
 * tscircuit has it is there to say where they are (see colours.ts, vias.ts).
 */
export function KeepOuts({
  shown,
  circuit,
}: {
  shown: ReturnType<typeof standing>
  circuit: Circuit | null
}) {
  const invalidate = useThree((state) => state.invalidate)
  React.useEffect(() => {
    shown.keepOuts(circuit)
    shown.vias(circuit)
    invalidate()
  }, [shown, circuit, invalidate])
  return null
}

/**
 * The parts of the board that are lit: the one picked out, all the way, in the colour a
 * part of the model is when it is picked out; and those whose square in the list of
 * them the pointer is over, less, or else those that were looked for. And the board
 * itself in the theme's colours, as the window is put in another.
 */
function Lighting({
  shown,
  found,
}: {
  shown: ReturnType<typeof standing>
  /** the parts that were looked for, by their names on the board */
  found: string[] | null
}) {
  const picked = useStore((state) => state.boardPicked?.name ?? null)
  const hover = useStore((state) => state.boardHover)
  const { picked: colour, pcb } = useThemeColors()
  const invalidate = useThree((state) => state.invalidate)
  React.useEffect(() => {
    shown.paint(pcb)
    const how = new Map<string, number>()
    const lit = hover && hover.length > 0 ? hover : found
    for (const name of lit ?? []) how.set(name, HOVER_LIT)
    if (picked) how.set(picked, 1)
    // (the parts of one kind are pale as often as not, as the light is: the rest of the
    // board goes dark around them while their square is pointed at)
    shown.light(how, colour, lit && lit.length > 0 ? HOVER_REST : 1)
    invalidate()
  }, [shown, picked, hover, found, colour, pcb, invalidate])
  return null
}

/**
 * The camera brought to the parts the list of them was picked in, as soon as the board
 * is there to bring it to: clear of the list, which lies over the right of the view.
 */
function Focusing({
  holder,
  circuit,
}: {
  holder: THREE.Object3D
  circuit: Circuit | null
}) {
  const focus = useStore((state) => state.boardFocus)
  const gl = useThree((state) => state.gl)
  React.useEffect(() => {
    if (!focus) return
    const box = partsBox(holder, circuit, focus.names)
    const list = document.querySelector("[data-board-parts]")
    const view = gl.domElement.getBoundingClientRect()
    const covered = list
      ? Math.max(0, view.right - list.getBoundingClientRect().left)
      : 0
    if (box) bridge.board?.goTo(box, covered)
    useStore.getState().focusedBoardParts()
  }, [focus, holder, circuit, gl])
  return null
}

/**
 * The board in 3D, in a view of its own that is looked round as the model's is: the
 * same camera, which the same hand moves, lit as the model is.
 */
function InThreeD({
  url,
  id,
  swept,
  dark,
  circuit,
  inspecting,
  found,
  hand,
}: {
  url: string
  id: string
  /** the board is still being made: a light goes across it, over and over */
  swept: boolean
  dark: boolean
  /** the board as tscircuit has it: where its parts are, for the camera to go to */
  circuit: Circuit | null
  /** and what of it can be pointed at (see inspect.ts): said beside the pointer */
  inspecting: Inspected | null
  /** the parts that were looked for, by their names on the board: lit */
  found: string[] | null
  /** it is shown on the palm of a hand, for how big it is beside one */
  hand: boolean
}) {
  const [shown, setShown] = React.useState<ReturnType<typeof standing> | null>(
    null
  )
  const palm = useHand(hand)
  // all there is to see, the hand too while it is there: the camera takes it in as it
  // comes, and comes back in as it goes, as it does a model's reference scene
  const seen = React.useMemo(
    () => (shown && palm ? withHand(shown.box, palm) : (shown?.box ?? null)),
    [shown, palm]
  )
  // (in the theme's colours as they were at first: Lighting has it in theirs now)
  const { pcb } = useThemeColors()
  const colours = React.useRef(pcb)
  React.useEffect(() => {
    let over = false
    let had: ReturnType<typeof standing> | null = null
    void loadBoard(url).then(
      (loaded) => {
        if (over) return disposeBoard(loaded)
        had = standing(loaded, colours.current)
        setShown(had)
      },
      () => {
        if (!over) setShown(null)
      }
    )
    return () => {
      over = true
      had?.dispose()
    }
  }, [url])
  const names = React.useMemo(
    () =>
      new Set(
        (circuit ?? []).flatMap((element) =>
          element.type === "source_component" &&
          typeof element.name === "string"
            ? [element.name]
            : []
        )
      ),
    [circuit]
  )
  const titles = React.useMemo(
    () => titlesOf(circuit ? partsOf(circuit) : []),
    [circuit]
  )
  /** what the pointer is over, said beside it (put there by Picking, as it moves) */
  const label = React.useRef<HTMLDivElement>(null)
  if (!shown || !seen) return null
  const radius = shown.box.getSize(new THREE.Vector3()).length() / 2 || 1

  return (
    <>
      <Canvas
        className="touch-none"
        frameloop="demand"
        resize={{ debounce: 0 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{
          fov: FOV,
          near: (radius * REACH.nearest) / 4,
          far: radius * REACH.furthest * 2,
          position: [radius * 3, radius * 3, radius * 3],
        }}
      >
        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#ffffff", "#7d828c", 0.7]} />
        <directionalLight position={[180, 320, 220]} intensity={1.7} />
        <directionalLight position={[-240, 160, -180]} intensity={0.55} />
        <primitive object={shown.holder} />
        {/* (framed afresh for another board, and not for the same one built again) */}
        <Rig
          box={seen}
          homeKey={`board:${id}`}
          around={palm ? "hand" : null}
          // (on the hand, the camera keeps above its palm, as it keeps above what a
          // model stands on in a reference scene: there is nothing to see from under)
          ground={palm ? shown.box.min.z : null}
          bridged={false}
        />
        {palm && <Hand geometry={palm} board={shown.box} />}
        {/* the light from under it, as the model has: out while it is looked down on,
          and coming up as the camera goes under it (after the camera has moved) */}
        <Underlight />
        <Sweeping
          sweep={shown.sweep}
          seen={shown.seen}
          swept={swept}
          dark={dark}
        />
        {/* (after the camera is set up, which it goes by) */}
        <Focusing holder={shown.holder} circuit={circuit} />
        <Lighting shown={shown} found={found} />
        <KeepOuts shown={shown} circuit={circuit} />
        <Picking
          shown={shown}
          names={names}
          inspecting={inspecting}
          titles={titles}
          label={label}
        />
        <BoardPartMark circuit={circuit} />
      </Canvas>
      <div ref={label} className={LABEL} hidden />
    </>
  )
}

/**
 * A board drawn the one way or the other, as SVG: null while it is being drawn, and not
 * at all in 3D. What draws it is loaded the first time it is wanted: it is a good deal of
 * the app, and no use to a project that has no boards. False where it cannot be drawn.
 * Drawn again in the theme's colours as they change.
 */
export function useDrawn(
  circuit: Circuit | null,
  as: BoardAs,
  colours: PcbColours,
  dark: boolean,
  ground: string,
  layer: CopperLayer
): string | false | null {
  const [drawn, setDrawn] = React.useState<{
    of: [Circuit, BoardAs, string, string, string]
    markup: string | false
  } | null>(null)
  // (by what they are, and not by which object has them)
  const inColours = JSON.stringify(colours)
  React.useEffect(() => {
    if (!circuit || as === "3d") return
    let over = false
    void import("./drawing").then(({ drawingOf }) => {
      let markup: string | false
      try {
        markup = drawingOf(
          circuit,
          as,
          JSON.parse(inColours) as PcbColours,
          dark,
          ground,
          layer
        )
      } catch {
        // nothing tscircuit could draw: it is said so
        markup = false
      }
      if (!over)
        setDrawn({ of: [circuit, as, inColours, ground, layer], markup })
    })
    return () => {
      over = true
    }
  }, [circuit, as, inColours, dark, ground, layer])
  if (!drawn || as === "3d") return null
  const [was, wasAs, wasColours, wasGround, wasLayer] = drawn.of
  return was === circuit &&
    wasAs === as &&
    wasColours === inColours &&
    wasGround === ground &&
    wasLayer === layer
    ? drawn.markup
    : null
}

/** What PCB mode says where it has nothing of the board to show: under what it shows. */
function Nothing({
  title,
  detail,
  children,
}: {
  title: string
  detail: string
  children?: React.ReactNode
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center select-none">
      {children}
      <div className="text-xl/[1.3] font-bold">{title}</div>
      <div className="max-w-md text-xl/[1.3] text-balance text-foreground/45">
        {detail}
      </div>
    </div>
  )
}

/**
 * What the router is trying, as a group to go over the board's drawing: the room it has
 * cut the board into, faintly; the ways it is trying, in the attention colour; and the
 * places it is going between, as dots. In the board's millimetres, set where they lie in
 * the drawing (`place`); its lines as thin however near the board is seen.
 */
function routingOver(
  routing: Routing,
  place: NonNullable<ReturnType<typeof placeOf>>
): SVGGElement {
  const NS = "http://www.w3.org/2000/svg"
  const group = document.createElementNS(NS, "g")
  group.setAttribute("data-routing", "")
  group.setAttribute(
    "transform",
    `matrix(${place.a} 0 0 ${place.d} ${place.e} ${place.f})`
  )
  group.style.pointerEvents = "none"
  const path = (d: string, style: Partial<CSSStyleDeclaration>) => {
    if (!d) return
    const made = document.createElementNS(NS, "path")
    made.setAttribute("d", d)
    made.setAttribute("vector-effect", "non-scaling-stroke")
    Object.assign(made.style, style)
    group.append(made)
  }
  path(
    routing.rects
      .map(([x, y, w, h]) => `M${x - w / 2} ${y - h / 2}h${w}v${h}h${-w}z`)
      .join(""),
    {
      fill: "var(--foreground)",
      fillOpacity: "0.03",
      stroke: "var(--foreground)",
      strokeOpacity: "0.12",
      strokeWidth: "0.6",
    }
  )
  path(
    routing.lines
      .map((line) => {
        let d = `M${line[0]} ${line[1]}`
        for (let at = 2; at < line.length; at += 2)
          d += `L${line[at]} ${line[at + 1]}`
        return d
      })
      .join(""),
    {
      fill: "none",
      stroke: "var(--attention)",
      strokeOpacity: "0.9",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }
  )
  // (a dot a fifth of a millimetre across)
  const r = 0.1
  path(
    routing.points
      .map(
        ([x, y]) =>
          `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
      )
      .join(""),
    { fill: "var(--attention)", fillOpacity: "0.8" }
  )
  return group
}

/**
 * What the router is trying on a board, while `on` (it is being routed, and the board is
 * drawn as it is made): read from what the build writes of it, again and again, and
 * none from before this routing began. Null while there is none.
 */
function useRouting(
  projectId: string,
  board: BoardSummary,
  on: boolean
): Routing | null {
  const [read, setRead] = React.useState<Routing | null>(null)
  React.useEffect(() => {
    if (!on) return
    let over = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const url = `${MODEL_SCHEME}://${projectId}.${BOARD_HOST}/${builtOf(board.id).routing}`
    const look = async () => {
      try {
        const answer = await fetch(`${url}?t=${Date.now()}`, {
          cache: "no-store",
        })
        const routing = answer.ok ? readRouting(await answer.json()) : null
        if (!over && routing)
          setRead((was) => (was?.at === routing.at ? was : routing))
      } catch {
        // not written yet, or being written: looked for again
      }
      if (!over) timer = setTimeout(() => void look(), ROUTING_EVERY_MS)
    }
    void look()
    return () => {
      over = true
      clearTimeout(timer)
    }
  }, [on, projectId, board.id])
  const since = board.building?.since ?? Infinity
  return on && read && read.at >= since ? read : null
}

/** How often what the router is trying is looked at again, ms. */
const ROUTING_EVERY_MS = 400

/**
 * PCB mode, with one of the project's boards in it: the board, the way the buttons have
 * it looked at, and over it at the top what it is called and how big it is.
 */
export function BoardMode({
  projectId,
  board,
}: {
  projectId: string
  board: BoardSummary
}) {
  const as: BoardAs = useStore((state) => state.view.boardAs)
  const { dark, backdrop, pcb } = useThemeColors()
  const ground = `#${backdrop.getHexString()}`
  const { circuit, trouble, routed } = useCircuit(projectId, board)
  const hand = useStore((state) => state.view.boardHand)
  const inspecting = React.useMemo(
    () => (circuit ? inspected(circuit) : null),
    [circuit]
  )
  // which of its layers of copper is drawn, as it is made: the bottom turned over, to be
  // seen from under the board (one the board has not got is its last)
  const layer = Math.min(
    useStore((state) => state.view.boardLayer),
    board.layers
  )
  const copper = as === "pcb" ? copperLayerOf(layer, board.layers) : "top"
  const turned = copper === "bottom"
  const markup = useDrawn(circuit, as, pcb, dark, ground, copper)
  const size = sizeSaid(board)
  const making = useBeingMade(projectId, board)
  // (drawn over the board as it is made, from the top: the router's work is seen so)
  const routing = useRouting(
    projectId,
    board,
    as === "pcb" && !turned && board.building?.stage === "routing"
  )
  const partsOpen = useStore((state) => state.boardPartsOpen)

  // What is looked for on the board (Cmd+F): lit as it is drawn, and in 3D. Enter goes
  // to it, and the box stays up, with it lit, until Esc.
  const finding = useStore((state) => state.finding)
  const findables = React.useMemo(
    () => (inspecting && circuit ? findablesOf(inspecting, circuit) : []),
    [inspecting, circuit]
  )
  const found = React.useMemo(
    () => (finding === null ? null : lookFor(findables, finding)),
    [findables, finding]
  )
  const foundParts = React.useMemo(
    () => (found && inspecting ? partsIn(found, inspecting) : null),
    [found, inspecting]
  )
  const [goneTo, setGoneTo] = React.useState(0)
  const showFound = () => {
    if (!found || found.length === 0) return
    if (as === "3d") useStore.getState().focusBoardParts(foundParts ?? [])
    else setGoneTo((times) => times + 1)
  }
  useBoardFinding(findables.length > 0 && as !== "schematic")
  // (the schematic has nothing lit: the search is put away for it, and not left up unseen)
  React.useEffect(() => {
    if (as === "schematic") useStore.getState().find(null)
  }, [as])

  // While the board is being made it is drawn as it is made, where what changes is
  // seen first (the 3D is only as of its last full build); and once the work on it is
  // over, the way it was looked at before comes back, unless another was chosen
  // meanwhile. Over is when nothing is building it and no agent is at work in the
  // project, so that the drawing does not go back and forth between one build and the
  // next of a turn.
  const atWork = useStore((state) =>
    state.projects
      .find((project) => project.id === projectId)
      ?.conversations.some((conversation) => conversation.status !== "idle")
  )
  const before = React.useRef<BoardAs | null>(null)
  React.useEffect(() => {
    const { view, setView } = useStore.getState()
    if (making && before.current === null) {
      before.current = view.boardAs
      if (view.boardAs !== "pcb") setView({ boardAs: "pcb" })
    } else if (!making && !atWork && before.current !== null) {
      const back = before.current
      before.current = null
      if (view.boardAs === "pcb" && back !== "pcb") setView({ boardAs: back })
    }
  }, [making, atWork])

  return (
    <div
      className="absolute inset-0 animate-in overflow-hidden duration-300 fade-in motion-reduce:animate-none"
      style={{ background: ground }}
    >
      {board.built === null && board.preview === null ? (
        making ? (
          <Nothing
            title="Being made"
            detail="The board shows here as soon as there is something of it, and changes as it is made."
          >
            <TurningBoard className="mb-10 w-40" />
          </Nothing>
        ) : (
          <Nothing
            title="Not built yet"
            detail="There is nothing of this board to show until it is built. Ask Claude to build it."
          />
        )
      ) : as === "3d" ? (
        board.model ? (
          // (keyed by the board, so that another one is framed afresh)
          <InThreeD
            key={board.id}
            id={board.id}
            url={boardUrl(projectId, board, "model")}
            swept={making}
            dark={dark}
            circuit={circuit}
            inspecting={inspecting}
            found={foundParts}
            hand={hand}
          />
        ) : (
          <Nothing
            title="No 3D yet"
            detail="This board was built without its 3D. Ask Claude to build it again."
          />
        )
      ) : markup ? (
        // (keyed by the board and the way it is drawn, so that each starts whole)
        <Drawing
          key={`${board.id}:${as}:${turned}`}
          id={`${projectId}:${board.id}:${as}:${turned}`}
          markup={markup}
          dark={dark}
          swept={making}
          routing={routing}
          circuit={as === "pcb" ? circuit : null}
          board={as === "pcb" ? inspecting : null}
          schematic={as === "schematic" ? circuit : null}
          side={turned ? "bottom" : "top"}
          ground={ground}
          found={found}
          goneTo={goneTo}
        />
      ) : trouble || markup === false ? (
        <Nothing
          title="The board could not be drawn"
          detail={trouble ?? "What was built of it does not read as a board."}
        />
      ) : null}

      {partsOpen && (
        <BoardPartsPanel
          projectId={projectId}
          board={board}
          circuit={circuit}
          // where the list of boards goes, beside the buttons
          className="absolute top-1/2 right-17.5 max-h-[80%] max-w-[calc(100%-5.5rem)] -translate-y-1/2"
        />
      )}

      {/* what it is, at the top: where the window is not dragged by, and that it is
          being worked on while it is; and under that, while it is being built, how far
          that has got, unless an agent is making it in detail, whose steps say that.
          While something on it is looked for, what is looked for is there instead */}
      {finding !== null && as !== "schematic" ? (
        <BoardSearch
          what="parts, pins or nets"
          said={found && finding.trim() !== "" ? foundSaid(found) : null}
          onShow={showFound}
          keysKept
        />
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center gap-2">
          <div className="flex max-w-[50%] items-center gap-2 text-sm select-none">
            <span className="truncate font-medium">{board.name}</span>
            {size && (
              <span className="shrink-0 text-foreground/45 tabular-nums">
                {size}
              </span>
            )}
            {making ? (
              <WorkingBadge className="shrink-0" />
            ) : (
              !board.finished && <UnfinishedBadge className="shrink-0" />
            )}
            {copper !== "top" && (
              <Badge variant="outline" className="shrink-0">
                {turned ? "Bottom side" : `Layer ${layer}`}
              </Badge>
            )}
          </div>
          {/* (how far a build has got is at the foot of the view: see BoardSteps) */}
          {board.building
            ? null
            : as === "3d"
              ? board.model &&
                board.built !== null &&
                (board.preview !== null || board.outdated) && (
                  <LastBuilt at={board.built} />
                )
              : as === "pcb" &&
                board.built !== null &&
                routed !== null && (
                  <LastBuilt at={board.built} routed={routed} />
                )}
        </div>
      )}
    </div>
  )
}

/**
 * That the board in 3D is as it was last built, and when that was: the 3D is made only
 * by a full build, and the board has been written since (its quick look, which the
 * technical view and the schematic draw, is newer). In the technical view, the same of
 * its routing, which only a full build makes too: drawn as it was routed then, or not
 * drawn, as parts have moved since.
 */
function LastBuilt({ at, routed = null }: { at: number; routed?: Routed }) {
  const now = useNow(30_000)
  const when = ago(at, now)
  const since = when === "now" ? "just now" : `${when} ago`
  return (
    <span className="animate-in text-xs text-foreground/60 duration-200 select-none fade-in">
      {routed === "not"
        ? "Not routed: parts have moved since it was last built"
        : routed === "as built"
          ? `Routing as last built, ${since}`
          : `As last built, ${since}`}
    </span>
  )
}
