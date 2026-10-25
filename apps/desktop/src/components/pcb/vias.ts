// A board's vias, where its traces go through it from one side to the other, as the app
// draws them over the board in 3D: a ring of copper round a hole, on each side it shows
// on. tscircuit's 3D has them under the mask, where they can hardly be told from the
// trace they are on; its own viewer shows them bare, and so does the app.
import type { Circuit } from "./boards"

/** A via: where it is, in the board's mm, how wide its copper and its hole, and its sides. */
export type Via = {
  x: number
  y: number
  outer: number
  hole: number
  sides: ("top" | "bottom")[]
}

/** The size of a via that does not say its own, mm: tscircuit's. */
const OWN = { outer: 0.6, hole: 0.3 }

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

/** A board's vias, as the board as tscircuit has it says. */
export function viasOf(circuit: Circuit | null): Via[] {
  return (circuit ?? []).flatMap((element): Via[] => {
    if (element.type !== "pcb_via") return []
    const [x, y] = [num(element.x), num(element.y)]
    if (x === null || y === null) return []
    const outer = num(element.outer_diameter) ?? OWN.outer
    const hole = Math.min(num(element.hole_diameter) ?? OWN.hole, outer)
    const layers = Array.isArray(element.layers) ? element.layers : []
    // (a via goes through the board: one that says no sides shows on both)
    const sides = (["top", "bottom"] as const).filter(
      (side) => layers.length === 0 || layers.includes(side)
    )
    return [{ x, y, outer, hole, sides }]
  })
}
