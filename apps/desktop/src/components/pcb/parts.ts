// What is on a circuit board, as the list of its parts in PCB mode has it: each kind of
// part once, with how many of it there are and the names they have on the board (C1,
// C2), from the board as tscircuit has it. Their pictures are in part-pictures.ts.
import type { Circuit } from "./boards"

/** A kind of part on a board, and the ones of it there are. */
export type BoardPart = {
  /** what tells this kind from the others */
  key: string
  /** what it is: its value and what it is ("6.8pF capacitor"), or its maker's number */
  title: string
  /** the names the ones of it have on the board, in order */
  names: string[]
  /** how big the first of them is on the board, mm across and down: null if not said */
  size: [number, number] | null
}

/** What a part is, by what tscircuit says it is ("simple_capacitor"). */
const KINDS: Record<string, string> = {
  simple_resistor: "resistor",
  simple_capacitor: "capacitor",
  simple_inductor: "inductor",
  simple_crystal: "crystal",
  simple_resonator: "resonator",
  simple_diode: "diode",
  simple_led: "LED",
  simple_chip: "chip",
  simple_connector: "connector",
  simple_pin_header: "pin header",
  simple_switch: "switch",
  simple_push_button: "push button",
  simple_transistor: "transistor",
  simple_mosfet: "MOSFET",
  simple_fuse: "fuse",
  simple_battery: "battery",
  simple_potentiometer: "potentiometer",
  simple_test_point: "test point",
}

const kindOf = (ftype: unknown) =>
  typeof ftype === "string"
    ? (KINDS[ftype] ?? ftype.replace(/^simple_/, "").replaceAll("_", " "))
    : "part"

/** How often a crystal goes round, as it is said: "32.768 kHz". */
function frequencySaid(hertz: number): string {
  const [size, unit] =
    hertz >= 1e6
      ? [hertz / 1e6, "MHz"]
      : hertz >= 1e3
        ? [hertz / 1e3, "kHz"]
        : [hertz, "Hz"]
  return `${Number(size.toPrecision(6))} ${unit}`
}

/** What a part's value is, as tscircuit says it for showing: null where it has none. */
function valueOf(part: Record<string, unknown>): string | null {
  for (const key of [
    "display_resistance",
    "display_capacitance",
    "display_inductance",
  ])
    if (typeof part[key] === "string") return part[key]
  if (typeof part.frequency === "number") return frequencySaid(part.frequency)
  return null
}

/**
 * What a part is, as it is said of it: its value and what it is ("6.8pF capacitor"), or
 * its maker's number, or what it is.
 */
export function titleOf(part: Record<string, unknown>): string {
  const value = valueOf(part)
  const kind = kindOf(part.ftype)
  if (value) return `${value} ${kind}`
  return typeof part.manufacturer_part_number === "string"
    ? part.manufacturer_part_number
    : kind
}

/** Names in the order a person counts them: C2 before C10. */
const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

/**
 * The kinds of part on a board: those that are the same part (the same kind, value,
 * footprint and maker's number) once, with all their names. In the order of their
 * first names.
 */
export function partsOf(circuit: Circuit): BoardPart[] {
  const footprints = new Map<string, unknown>()
  const sizes = new Map<string, [number, number]>()
  for (const element of circuit) {
    const id = element.source_component_id
    if (typeof id !== "string") continue
    if (element.type === "cad_component")
      footprints.set(id, element.footprinter_string)
    if (
      element.type === "pcb_component" &&
      typeof element.width === "number" &&
      typeof element.height === "number"
    )
      sizes.set(id, [element.width, element.height])
  }
  const kinds = new Map<string, BoardPart>()
  for (const part of circuit) {
    if (part.type !== "source_component" || typeof part.name !== "string")
      continue
    const id = String(part.source_component_id)
    const value = valueOf(part)
    const number =
      typeof part.manufacturer_part_number === "string"
        ? part.manufacturer_part_number
        : null
    const key = JSON.stringify([
      part.ftype,
      value,
      number,
      footprints.get(id) ?? null,
    ])
    const had = kinds.get(key)
    if (had) {
      had.names.push(part.name)
      continue
    }
    kinds.set(key, {
      key,
      title: titleOf(part),
      names: [part.name],
      size: sizes.get(id) ?? null,
    })
  }
  return [...kinds.values()]
    .map((part) => ({ ...part, names: part.names.sort(byName) }))
    .sort((a, b) => byName(a.names[0], b.names[0]))
}

/** How a kind of part is said under its picture: how many, and their names. */
export function countSaid(part: BoardPart): string {
  return part.names.length > 1
    ? `×${part.names.length} · ${part.names.join(", ")}`
    : part.names[0]
}
