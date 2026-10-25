import { describe, expect, it } from "vitest"

import { viasOf } from "./vias"

describe("viasOf", () => {
  it("has each via, with its copper and its hole, on the sides it says", () => {
    const circuit = [
      {
        type: "pcb_via",
        x: -11.5,
        y: 7.25,
        outer_diameter: 0.3,
        hole_diameter: 0.2,
        layers: ["top", "bottom"],
      },
      { type: "pcb_trace", x: 1, y: 1 },
    ]
    expect(viasOf(circuit)).toEqual([
      { x: -11.5, y: 7.25, outer: 0.3, hole: 0.2, sides: ["top", "bottom"] },
    ])
  })

  it("takes tscircuit's size for a via that says none, and both sides for one that says no sides", () => {
    expect(viasOf([{ type: "pcb_via", x: 0, y: 0 }])).toEqual([
      { x: 0, y: 0, outer: 0.6, hole: 0.3, sides: ["top", "bottom"] },
    ])
  })

  it("has none where there is no board yet, or no place for one", () => {
    expect(viasOf(null)).toEqual([])
    expect(viasOf([{ type: "pcb_via", x: 1 }])).toEqual([])
  })
})
