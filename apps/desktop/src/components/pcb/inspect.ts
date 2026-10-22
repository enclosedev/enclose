// What is under the pointer on a board drawn as it is made, and what is said of it, as
// tscircuit's own viewer says it: a pad, by the names its pin has; a trace, by how long it
// is and what it joins; a part, by the box its pads take and how far it is placed from
// what it is placed by. And a hole through the board, by how big it is drilled and how far
// it is placed, as a part is. Worked out from the board as tscircuit has it, in its
// millimetres, with y upwards, and so the same whichever side of the board is looked at.
import type { Circuit } from "./boards"

/** A place on the board, mm. */
export type Spot = { x: number; y: number }
/** A box on the board, by its middle, mm: across, and up and down. */
export type Box = { x: number; y: number; w: number; h: number }
export type Side = "top" | "bottom"

/**
 * Copper a pin is soldered to, a pad or a hole with copper round it: as a box turned so
 * far about its middle, anticlockwise in degrees, or a round one as wide as it is.
 */
export type Pad = Box & {
  id: string
  turn: number
  round: boolean
  sides: Side[]
  /** the part it is of, by what tscircuit calls it: null for none */
  part: string | null
  /** what its pin is called, each with the part's name: "U1.VBAT", "U1.pin28" */
  names: string[]
}

/**
 * A hole through the board with no copper round it: one the board is fixed by, or a peg's
 * of a part. As a box, turned, or round, that takes in the ring kept clear round it where
 * there is one; with how big it is drilled.
 */
export type Hole = Box & {
  id: string
  turn: number
  round: boolean
  /** how big it is drilled, mm: across, and up and down */
  drill: [number, number]
  /** the part it is of, by what tscircuit calls it: null for one of the board's own */
  part: string | null
  /**
   * What is boxed and measured with it: its part, or, for one of the board's own, the
   * hole itself, placed from the board's middle or its group's anchor.
   */
  placed: Part
}

/** A trace, as the places it goes through, how wide it is between each, and on which side. */
export type Trace = {
  id: string
  points: (Spot & { width: number; side: string | null })[]
  /** how long it is, all told, mm */
  length: number
  /** what it is called, or the net it is of, or what it joins: null for none of them */
  name: string | null
}

/** A part on the board, and where it is placed. */
export type Part = {
  id: string
  /** what it is called on the board: "U1" */
  name: string | null
  /** the box its pads take, or, without them, its own */
  box: Box
  /**
   * What it is placed by, the board or a group of parts, and how far from it: the place
   * that is, and how far along and up, as it was said where it is placed. Null for a part
   * that is placed by nothing.
   */
  anchor: Spot | null
  offset: [number, number] | null
}

export type Inspected = {
  pads: Pad[]
  holes: Hole[]
  traces: Trace[]
  parts: Map<string, Part>
}

/** What is under the pointer: a pad, with its part; a hole, with its; a trace; or a part itself. */
export type Under =
  | { kind: "pad"; pad: Pad; part: Part | null }
  | { kind: "hole"; hole: Hole; part: Part }
  | { kind: "trace"; trace: Trace }
  | { kind: "part"; part: Part }

type Element = Record<string, unknown>

const num = (value: unknown): number | null => {
  const read = typeof value === "string" ? Number(value) : value
  return typeof read === "number" && Number.isFinite(read) ? read : null
}
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null
const spot = (value: unknown): Spot | null => {
  const { x, y } = (value ?? {}) as Record<string, unknown>
  const [sx, sy] = [num(x), num(y)]
  return sx === null || sy === null ? null : { x: sx, y: sy }
}
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one) => typeof one === "string") : []

/** The box round these places. */
function boundsOf(spots: Spot[]): Box | null {
  if (spots.length === 0) return null
  const xs = spots.map((one) => one.x)
  const ys = spots.map((one) => one.y)
  const [left, right] = [Math.min(...xs), Math.max(...xs)]
  const [bottom, top] = [Math.min(...ys), Math.max(...ys)]
  return {
    x: (left + right) / 2,
    y: (bottom + top) / 2,
    w: right - left,
    h: top - bottom,
  }
}

/** The corners of a pad or a hole, as it is turned, a little way out from it (`out`, mm). */
export function cornersOf(pad: Box & { turn: number }, out = 0): Spot[] {
  const angle = (pad.turn * Math.PI) / 180
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
  const [w, h] = [pad.w / 2 + out, pad.h / 2 + out]
  return [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ].map(([x, y]) => ({
    x: pad.x + x * cos - y * sin,
    y: pad.y + x * sin + y * cos,
  }))
}

/** The shape of a pad, or of a hole's copper: as a box, turned; or round. */
function shapeOf(element: Element): {
  box: Box
  turn: number
  round: boolean
} | null {
  const at = spot(element)
  if (!at) return null
  const box = (w: unknown, h: unknown) => {
    const [bw, bh] = [num(w), num(h)]
    return bw === null || bh === null ? null : { ...at, w: bw, h: bh }
  }
  const turned = (key: string) => num(element[key]) ?? 0
  const outlined = (points: unknown, by: Spot) => {
    const all = (Array.isArray(points) ? points : []).flatMap((point) => {
      const one = spot(point)
      return one ? [{ x: one.x + by.x, y: one.y + by.y }] : []
    })
    const bounds = boundsOf(all)
    return bounds && { box: bounds, turn: 0, round: false }
  }
  // (a hole's copper shaped as a pill is as a pad is: but its sizes are of its outside)
  if (
    element.type === "pcb_plated_hole" &&
    (element.shape === "pill" || element.shape === "oval")
  ) {
    const made = box(element.outer_width, element.outer_height)
    return made && { box: made, turn: turned("ccw_rotation"), round: false }
  }
  switch (element.shape) {
    case "circle": {
      const across =
        element.type === "pcb_smtpad"
          ? (num(element.radius) ?? 0) * 2
          : num(element.outer_diameter)
      return across
        ? { box: { ...at, w: across, h: across }, turn: 0, round: true }
        : null
    }
    case "rect":
    case "pill": {
      const made = box(element.width, element.height)
      return made && { box: made, turn: 0, round: false }
    }
    case "rotated_rect":
    case "rotated_pill": {
      const made = box(element.width, element.height)
      return made && { box: made, turn: turned("ccw_rotation"), round: false }
    }
    case "polygon":
      return outlined(element.points, { x: 0, y: 0 })
    case "circular_hole_with_rect_pad":
    case "pill_hole_with_rect_pad":
    case "rotated_pill_hole_with_rect_pad": {
      const made = box(element.rect_pad_width, element.rect_pad_height)
      return (
        made && { box: made, turn: turned("rect_ccw_rotation"), round: false }
      )
    }
    case "hole_with_polygon_pad":
      return outlined(element.pad_outline, at)
  }
  return null
}

/**
 * How tscircuit's own viewer says what a pin is called: with its part's name, the last
 * first. But not by what tscircuit calls the pins of a part joined inside it, where the
 * pin has a name of its own: "pin7_internal_1".
 */
function namesOf(hints: string[], part: string | null): string[] {
  const named = [...new Set(hints)].filter(
    (hint) => !/^\d+$/.test(hint) && !hint.includes("unnamed_")
  )
  const own = named.filter((hint) => !hint.includes("_internal_"))
  const said = (own.length > 0 ? own : named).sort((a, b) => b.localeCompare(a))
  if (said.length === 0) return part ? [part] : []
  return part ? said.map((hint) => `${part}.${hint}`) : said
}

/** What a trace joins, as tscircuit says it, said plainly: ".U1 > .TX to net.GND" is "U1.TX to net.GND". */
export const joinedSaid = (said: string) =>
  said.replace(/\s*>\s*\./g, ".").replace(/(^|\s)\./g, "$1")

/** Everything on a board that can be pointed at, and said. */
export function inspected(circuit: Circuit): Inspected {
  const elements = circuit as Element[]
  const byType = (type: string) => elements.filter((one) => one.type === type)
  const byId = (type: string, key: string) =>
    new Map(byType(type).map((one) => [one[key] as string, one]))
  const sourceComponents = byId("source_component", "source_component_id")
  const sourcePorts = byId("source_port", "source_port_id")
  const pcbPorts = byId("pcb_port", "pcb_port_id")
  const sourceTraces = byId("source_trace", "source_trace_id")
  const sourceNets = byId("source_net", "source_net_id")
  const groups = byId("pcb_group", "pcb_group_id")
  const boards = byId("pcb_board", "pcb_board_id")
  const components = byId("pcb_component", "pcb_component_id")
  const nameOf = (component: string | null) => {
    const source = component
      ? components.get(component)?.source_component_id
      : null
    const name = text(sourceComponents.get(source as string)?.name)
    return name && !name.includes("unnamed_") ? name : null
  }

  const pads: Pad[] = []
  for (const element of [
    ...byType("pcb_smtpad"),
    ...byType("pcb_plated_hole"),
  ]) {
    const shape = shapeOf(element)
    if (!shape) continue
    const part = text(element.pcb_component_id)
    const port = pcbPorts.get(element.pcb_port_id as string)
    const source = sourcePorts.get(port?.source_port_id as string)
    pads.push({
      ...shape.box,
      id: String(element.pcb_smtpad_id ?? element.pcb_plated_hole_id),
      turn: shape.turn,
      round: shape.round,
      sides:
        element.type === "pcb_smtpad"
          ? [element.layer === "bottom" ? "bottom" : "top"]
          : ["top", "bottom"],
      part,
      names: namesOf(
        [...strings(element.port_hints), ...strings(source?.port_hints)],
        nameOf(part)
      ),
    })
  }

  const traces: Trace[] = byType("pcb_trace").flatMap((element) => {
    const points = (Array.isArray(element.route) ? element.route : []).flatMap(
      (point: Element) => {
        const at = spot(point)
        if (!at) return []
        return [
          {
            ...at,
            width: num(point.width) ?? 0,
            side: text(point.layer) ?? text(point.from_layer),
          },
        ]
      }
    )
    if (points.length < 2) return []
    let length = 0
    for (let at = 1; at < points.length; at++)
      length += Math.hypot(
        points[at].x - points[at - 1].x,
        points[at].y - points[at - 1].y
      )
    const source = sourceTraces.get(element.source_trace_id as string)
    const net = strings(source?.connected_source_net_ids)
      .map((id) => text(sourceNets.get(id)?.name))
      .find(Boolean)
    const joins = text(source?.display_name)
    return [
      {
        id: String(element.pcb_trace_id),
        points,
        length: num(element.trace_length) ?? length,
        name: text(source?.name) ?? net ?? (joins && joinedSaid(joins)),
      },
    ]
  })

  // the rings kept clear round holes, which are pointed at with them
  const rings = byType("pcb_keepout").flatMap((keepout) => {
    const at = spot(keepout.center)
    const radius = num(keepout.radius)
    return keepout.shape === "circle" && at && radius ? [{ at, radius }] : []
  })
  const drilled = byType("pcb_hole").flatMap((element) => {
    const at = spot(element)
    const width = num(element.hole_diameter) ?? num(element.hole_width)
    const height =
      num(element.hole_diameter) ?? num(element.hole_height) ?? width
    if (!at || !width || !height) return []
    const round =
      element.hole_shape === "circle" ||
      element.hole_shape === "circle_or_square" ||
      (num(element.hole_diameter) !== null && !element.hole_width)
    const ring = round
      ? rings.find((one) => Math.hypot(one.at.x - at.x, one.at.y - at.y) < 0.01)
          ?.radius
      : undefined
    const across = Math.max(width, (ring ?? 0) * 2)
    return [
      {
        element,
        hole: {
          ...at,
          w: round ? across : width,
          h: round ? across : height,
          id: String(element.pcb_hole_id),
          turn: num(element.ccw_rotation) ?? 0,
          round,
          drill: [width, height] as [number, number],
          part: text(element.pcb_component_id),
        },
      },
    ]
  })

  const anchorOf = (group: unknown) => {
    const found = groups.get(group as string)
    return found ? (spot(found.anchor_position) ?? spot(found.center)) : null
  }
  const parts = new Map<string, Part>()
  for (const [id, component] of components) {
    const center = spot(component.center)
    if (!center) continue
    const own = [
      ...pads.filter((pad) => pad.part === id),
      ...drilled.flatMap(({ hole }) => (hole.part === id ? [hole] : [])),
    ]
    const box =
      boundsOf(own.flatMap((pad) => cornersOf(pad))) ??
      ({
        ...center,
        w: num(component.width) ?? 0,
        h: num(component.height) ?? 0,
      } satisfies Box)
    const anchor =
      anchorOf(component.positioned_relative_to_pcb_group_id) ??
      spot(
        boards.get(component.positioned_relative_to_pcb_board_id as string)
          ?.center
      ) ??
      (groups.get(component.pcb_group_id as string)?.anchor_position
        ? anchorOf(component.pcb_group_id)
        : null)
    const said = [
      num(component.display_offset_x),
      num(component.display_offset_y),
    ]
    parts.set(id, {
      id,
      name: nameOf(id),
      box,
      anchor,
      offset: anchor
        ? [said[0] ?? center.x - anchor.x, said[1] ?? center.y - anchor.y]
        : null,
    })
  }

  // a hole of the board's own is placed by the board, or by its group
  const middle = spot([...boards.values()][0]?.center)
  const holes: Hole[] = drilled.map(({ element, hole }) => {
    const owner = hole.part ? parts.get(hole.part) : undefined
    const anchor = anchorOf(element.pcb_group_id) ?? middle
    return {
      ...hole,
      placed: owner ?? {
        id: hole.id,
        name: null,
        box: { x: hole.x, y: hole.y, w: hole.w, h: hole.h },
        anchor,
        offset: anchor ? [hole.x - anchor.x, hole.y - anchor.y] : null,
      },
    }
  })
  return { pads, holes, traces, parts }
}

/** What a hole is said to be: how big it is drilled, and the part it is of. */
export function holeSaid(hole: Hole): string {
  const [w, h] = hole.drill.map((value) => Math.round(value * 100) / 100)
  const size = hole.round || w === h ? `⌀${w} mm` : `${w} × ${h} mm`
  return hole.part && hole.placed.name
    ? `${hole.placed.name} · Hole ${size}`
    : `Hole ${size}`
}

/** How far a place is from a line between two others. */
function fromLine(at: Spot, a: Spot, b: Spot): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const long = dx * dx + dy * dy
  const t =
    long === 0
      ? 0
      : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / long))
  return Math.hypot(at.x - (a.x + t * dx), at.y - (a.y + t * dy))
}

/**
 * What is under a place on the board, looked at from one side: a pad first, then a hole,
 * then a trace, then the box of a part. Of what is on both sides, what is on the side looked at;
 * of pads, the smallest. `reach` is how near counts as on it, mm: a pixel or two.
 */
export function underAt(
  board: Inspected,
  at: Spot,
  side: Side,
  reach: number
): Under | null {
  const facing = <T>(found: T[], sideOf: (one: T) => boolean) => {
    const near = found.filter(sideOf)
    return near.length > 0 ? near : found
  }

  const on = (shape: Box & { turn: number; round: boolean }) => {
    const [dx, dy] = [at.x - shape.x, at.y - shape.y]
    if (shape.round) return Math.hypot(dx, dy) <= shape.w / 2 + reach
    const angle = (-shape.turn * Math.PI) / 180
    const x = dx * Math.cos(angle) - dy * Math.sin(angle)
    const y = dx * Math.sin(angle) + dy * Math.cos(angle)
    return (
      Math.abs(x) <= shape.w / 2 + reach && Math.abs(y) <= shape.h / 2 + reach
    )
  }
  const smallest = (a: Box, b: Box) => a.w * a.h - b.w * b.h

  const pads = facing(board.pads.filter(on), (pad) =>
    pad.sides.includes(side)
  ).sort(smallest)
  if (pads.length > 0) {
    const pad = pads[0]
    return {
      kind: "pad",
      pad,
      part: pad.part ? (board.parts.get(pad.part) ?? null) : null,
    }
  }

  const hole = board.holes.filter(on).sort(smallest)[0]
  if (hole) return { kind: "hole", hole, part: hole.placed }

  const traces = board.traces.flatMap((trace) => {
    let nearest: { gap: number; side: string | null } | null = null
    for (let index = 1; index < trace.points.length; index++) {
      const [a, b] = [trace.points[index - 1], trace.points[index]]
      const gap = fromLine(at, a, b) - Math.max(a.width, b.width) / 2
      if (gap <= reach && (!nearest || gap < nearest.gap))
        nearest = { gap, side: a.side }
    }
    return nearest ? [{ trace, ...nearest }] : []
  })
  const trace = facing(traces, (one) => one.side === side).sort(
    (a, b) => a.gap - b.gap
  )[0]
  if (trace) return { kind: "trace", trace: trace.trace }

  const part = [...board.parts.values()]
    .filter(
      ({ box }) =>
        Math.abs(at.x - box.x) <= box.w / 2 + reach &&
        Math.abs(at.y - box.y) <= box.h / 2 + reach
    )
    .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0]
  return part ? { kind: "part", part } : null
}

/** So many millimetres, as they are shown: to a hundredth, with a true minus sign. */
export function mmSaid(value: number): string {
  const rounded = Math.round(value * 100) / 100
  const plain = String(Math.abs(rounded))
  return `${rounded < 0 ? "−" : ""}${plain} mm`
}
