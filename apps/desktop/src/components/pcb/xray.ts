// What is done with something clicked on a board drawn as it is made, as tscircuit's own
// viewer does it: its connection X-rayed, the rest of the board dimmed and that alone
// drawn over it, its traces, pads and vias, on both sides; and its part found on the
// schematic. Worked out from the board as tscircuit has it (see inspect.ts).
import type { Inspected, Pad, Trace, Under, Via } from "./inspect"

/** The connection what is under the pointer is of: null for none (a part, a bare hole). */
export function connectionOf(under: Under): string | null {
  if (under.kind === "pad") return under.pad.joined
  if (under.kind === "trace") return under.trace.joined
  return null
}

/**
 * What a connection is called: its net's name where it has one ("GND"), or what is
 * under the pointer says of it, or else only that it is one.
 */
export function connectionSaid(
  board: Inspected,
  joined: string,
  under: Under | null
): string {
  const net = board.nets.find((one) => one.joined === joined)
  if (net) return net.name
  if (under?.kind === "trace" && under.trace.name) return under.trace.name
  if (under?.kind === "pad" && under.pad.names.length > 0)
    return under.pad.names[0]
  return "this connection"
}

/** The part what is under the pointer is of, by its name on the board: null for none. */
export function partNameOf(board: Inspected, under: Under): string | null {
  if (under.kind === "part") return under.part.name
  if (under.kind === "hole")
    return under.hole.part ? under.hole.placed.name : null
  const part = under.kind === "pad" ? under.pad.part : null
  return part ? (board.parts.get(part)?.name ?? null) : null
}

/** What of a board is of one connection: its traces, pads and vias. */
export type XRayed = { traces: Trace[]; pads: Pad[]; vias: Via[] }

/** Everything of a board that is of a connection, for it to be drawn by itself. */
export const xRayOf = (board: Inspected, joined: string): XRayed => ({
  traces: board.traces.filter((trace) => trace.joined === joined),
  pads: board.pads.filter((pad) => pad.joined === joined),
  vias: board.vias.filter((via) => via.joined === joined),
})
