// What is said of a part picked out on a board's schematic, as tscircuit's own viewer
// says it: what it is called and what it is, its maker's number and JLCPCB's, what
// tscircuit warned of it as it built the board, and where it is on the board, for the
// board round it to be shown (see schematic-picking.tsx). From the board as tscircuit
// has it.
import type { Circuit } from "./boards"
import { titleOf } from "./parts"

/** A part on a board's schematic, as it is said when it is picked out there. */
export type SchematicPart = {
  /** what it is called on the board: "U1" */
  name: string
  /** what it is: "10kΩ resistor", or its maker's number */
  title: string
  /** its maker's number, where it has one */
  maker: string | null
  /** JLCPCB's number for it ("C25804"), where it has one */
  jlcpcb: string | null
  /** what tscircuit warned of it, or found wrong with it, as it built the board */
  warnings: string[]
  /** where it is on the board, mm about the board's middle, with y up: null if nowhere */
  placed: { x: number; y: number; w: number; h: number } | null
  /** the side of the board it is on */
  side: "top" | "bottom"
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null

/** A warning or an error tscircuit made of the board as it built it. */
const isTrouble = (element: Record<string, unknown>) =>
  typeof element.type === "string" &&
  /_(warning|error)$/.test(element.type) &&
  typeof element.message === "string"

/** The part a schematic's drawing of it is of (`schematic_component_id`): null if none. */
export function schematicPartOf(
  circuit: Circuit,
  drawn: string
): SchematicPart | null {
  const schematic = circuit.find(
    (element) =>
      element.type === "schematic_component" &&
      element.schematic_component_id === drawn
  )
  const id = schematic?.source_component_id
  const source =
    typeof id === "string" &&
    circuit.find(
      (element) =>
        element.type === "source_component" &&
        element.source_component_id === id
    )
  if (!source || typeof source.name !== "string") return null
  const pcb = circuit.find(
    (element) =>
      element.type === "pcb_component" && element.source_component_id === id
  )
  const pcbId = pcb?.pcb_component_id
  const numbers = source.supplier_part_numbers as
    Record<string, unknown> | undefined
  const jlcpcb = [numbers?.jlcpcb, numbers?.lcsc]
    .flatMap((given) => (Array.isArray(given) ? given : [given]))
    .map(text)
    .find((number) => number !== null)
  // what was said of it: by its own name, by its place on the board, or of traces to it
  const warnings = new Set<string>()
  for (const element of circuit) {
    if (!isTrouble(element)) continue
    const of = element.pcb_component_ids
    if (
      element.source_component_id === id ||
      element.schematic_component_id === drawn ||
      (pcbId !== undefined && element.pcb_component_id === pcbId) ||
      (pcbId !== undefined && Array.isArray(of) && of.includes(pcbId))
    )
      warnings.add(String(element.message))
  }
  const center = pcb?.center as { x?: unknown; y?: unknown } | undefined
  const placed =
    typeof center?.x === "number" &&
    typeof center.y === "number" &&
    typeof pcb?.width === "number" &&
    typeof pcb.height === "number"
      ? { x: center.x, y: center.y, w: pcb.width, h: pcb.height }
      : null
  return {
    name: source.name,
    title: titleOf(source),
    maker: text(source.manufacturer_part_number),
    jlcpcb: jlcpcb ?? null,
    warnings: [...warnings],
    placed,
    side: pcb?.layer === "bottom" ? "bottom" : "top",
  }
}

/** A part's drawing on the schematic, by its name on the board ("U1"): null if none. */
export function drawnOf(circuit: Circuit, name: string): string | null {
  const source = circuit.find(
    (element) => element.type === "source_component" && element.name === name
  )
  const drawn = source
    ? circuit.find(
        (element) =>
          element.type === "schematic_component" &&
          element.source_component_id === source.source_component_id
      )?.schematic_component_id
    : null
  return typeof drawn === "string" ? drawn : null
}
