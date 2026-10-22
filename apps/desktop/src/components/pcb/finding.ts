// Looking for what is on a board by name, in PCB mode (Cmd+F): its parts, by what they
// are called on the board (C1, U1) or by what they are ("capacitor"); the pins of its
// parts, by what each is called (J1.GND1, or GND1 by itself); and its nets (GND, V5).
// What goes by the name is lit on the board, through the rest of it (see found.tsx).
import type { Circuit } from "./boards"
import {
  cornersOf,
  type Box,
  type Inspected,
  type Pad,
  type Part,
  type Spot,
} from "./inspect"
import { partsOf } from "./parts"

/** Something on a board that can be looked for by name. */
export type Findable =
  | { kind: "part"; name: string; title: string | null; part: Part }
  | { kind: "pin"; names: string[]; pad: Pad }
  | { kind: "net"; name: string; joined: string }

/** Something found, and the name it goes by that it was found by. */
export type Found = { thing: Findable; said: string }

/** Names in the order a person counts them: C2 before C10. */
const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

/**
 * What on a board can be looked for: its parts that have a name, in the order of their
 * names; the pins that have one of their own (and not those called by their part's
 * alone); and its nets.
 */
export function findablesOf(board: Inspected, circuit: Circuit): Findable[] {
  const kinds = partsOf(circuit)
  const parts = [...board.parts.values()]
    .flatMap((part) => (part.name ? [{ ...part, name: part.name }] : []))
    .sort((a, b) => byName(a.name, b.name))
    .map((part): Findable => ({
      kind: "part",
      name: part.name,
      title:
        kinds.find((kind) => kind.names.includes(part.name))?.title ?? null,
      part,
    }))
  const pins = board.pads.flatMap((pad): Findable[] =>
    pad.names.some((name) => name.includes("."))
      ? [{ kind: "pin", names: pad.names, pad }]
      : []
  )
  const nets = board.nets.map(({ name, joined }): Findable => ({
    kind: "net",
    name,
    joined,
  }))
  return [...parts, ...pins, ...nets]
}

/** A pin's name that says no more than which pin it is: "pin8". */
const numbered = (name: string) => /^pin\d+$/i.test(name)

/**
 * What a name being typed could be, of what is on a board: what is called by it, where
 * anything is; otherwise the parts and nets whose names it begins ("C" is C1, C2), or
 * else the pins whose names it does; otherwise the parts of a kind it begins a word of
 * ("cap"). A pin goes by its own name, and by that with its part's once that is being
 * typed ("J1."), and is said by the one that says most.
 */
export function lookFor(things: Findable[], name: string): Found[] {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return []
  const exact: Found[] = []
  const begun: Found[] = []
  const pinsBegun: Found[] = []
  const ofKind: Found[] = []
  for (const thing of things) {
    const names =
      thing.kind === "pin"
        ? [...thing.names].sort(
            (a, b) => Number(numbered(own(a))) - Number(numbered(own(b)))
          )
        : [thing.name]
    let found: { said: string; exact: boolean } | null = null
    for (const said of names) {
      const one = (
        thing.kind === "pin" && !wanted.includes(".") ? own(said) : said
      ).toLowerCase()
      if (one === wanted) {
        found = { said, exact: true }
        break
      }
      if (!found && one.startsWith(wanted)) found = { said, exact: false }
    }
    if (found)
      (found.exact ? exact : thing.kind === "pin" ? pinsBegun : begun).push({
        thing,
        said: found.said,
      })
    else if (thing.kind === "part" && thing.title) {
      const title = thing.title.toLowerCase()
      if (
        title.startsWith(wanted) ||
        title.split(/\s+/).some((word) => word.startsWith(wanted))
      )
        ofKind.push({ thing, said: thing.name })
    }
  }
  return [exact, begun, pinsBegun, ofKind].find((some) => some.length > 0) ?? []
}

/** A pin's own name, without its part's: "GND1" of "J1.GND1". */
const own = (name: string) => name.slice(name.indexOf(".") + 1)

/** How much was found, in a few words: "2 parts, 1 net". */
export function foundSaid(found: Found[]): string {
  return (["part", "pin", "net"] as const)
    .flatMap((kind) => {
      const many = found.filter(({ thing }) => thing.kind === kind).length
      return many > 0 ? [`${many} ${kind}${many === 1 ? "" : "s"}`] : []
    })
    .join(", ")
}

/** The pads of a net, its traces and its vias. */
export function ofNet(board: Inspected, joined: string) {
  return {
    pads: board.pads.filter((pad) => pad.joined === joined),
    traces: board.traces.filter((trace) => trace.joined === joined),
    vias: board.vias.filter((via) => via.joined === joined),
  }
}

/** The parts that what was found is, or is of, or that are on it: by their names. */
export function partsIn(found: Found[], board: Inspected): string[] {
  const named = (part: string | null) =>
    (part && board.parts.get(part)?.name) || []
  return [
    ...new Set(
      found.flatMap(({ thing }) =>
        thing.kind === "part"
          ? [thing.name]
          : thing.kind === "pin"
            ? named(thing.pad.part)
            : ofNet(board, thing.joined).pads.flatMap((pad) => named(pad.part))
      )
    ),
  ]
}

/** The box round all that was found, mm, a pin's with its part's: null for nothing. */
export function foundBox(found: Found[], board: Inspected): Box | null {
  const corners = (box: Box) => cornersOf({ ...box, turn: 0 })
  const spots: Spot[] = found.flatMap(({ thing }) => {
    if (thing.kind === "part") return corners(thing.part.box)
    if (thing.kind === "pin") {
      const part = thing.pad.part && board.parts.get(thing.pad.part)
      return part ? corners(part.box) : cornersOf(thing.pad)
    }
    const { pads, traces, vias } = ofNet(board, thing.joined)
    return [
      ...pads.flatMap((pad) => cornersOf(pad)),
      ...traces.flatMap((trace) => trace.points),
      ...vias.flatMap((via) => corners({ ...via, h: via.w })),
    ]
  })
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
