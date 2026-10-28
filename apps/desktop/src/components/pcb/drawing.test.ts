import { describe, expect, it } from "vitest"

import type { PcbColours } from "@shared/theme-format"
import {
  awayFaded,
  drawingOf,
  fromUnder,
  holesEdged,
  poursLightened,
  turnedOver,
} from "./drawing"
import { DRAWN } from "./ground"

describe("fromUnder", () => {
  it("has the bottom drawn over the top, and the rest of the board in its place", () => {
    const order = [
      "global",
      "board",
      "soldermask-top",
      "top",
      "inner1",
      "inner2",
      "bottom",
      "through",
      "drill",
      "overlay",
    ].map(fromUnder)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(fromUnder("bottom")).toBeGreaterThan(fromUnder("top"))
    // both masks lie on the board, under either side's copper
    expect(fromUnder("soldermask-bottom")).toBe(fromUnder("soldermask-top"))
  })

  it("puts the inner layers in order between the sides, by their numbers", () => {
    expect(fromUnder("inner2")).toBeGreaterThan(fromUnder("inner1"))
    expect(fromUnder("inner6")).toBeLessThan(fromUnder("bottom"))
    // one with no number is the first of them
    expect(fromUnder("inner")).toBe(fromUnder("top") + 1)
  })

  it("has what is on no layer over everything, and a layer it does not know between the sides", () => {
    expect(fromUnder(null)).toBeGreaterThan(fromUnder("overlay"))
    expect(fromUnder("silkscreen")).toBeGreaterThan(fromUnder("top"))
    expect(fromUnder("silkscreen")).toBeLessThan(fromUnder("bottom"))
  })
})

describe("turnedOver", () => {
  it("turns the drawing over left to right, about its own width", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect/></svg>'
    expect(turnedOver(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
        '<g transform="translate(800 0) scale(-1 1)"><rect/></g></svg>'
    )
  })

  it("takes a drawing that says no width to be as wide as they are made", () => {
    expect(turnedOver("<svg><rect/></svg>\n")).toBe(
      `<svg><g transform="translate(${DRAWN.width} 0) scale(-1 1)"><rect/></g></svg>`
    )
  })
})

describe("holesEdged", () => {
  it("edges every hole through the board, in the theme's colour for its edge, as thin at any zoom", () => {
    const colours = { "technical-edge": "#abcdef" } as PcbColours
    const svg =
      '<circle data-type="pcb_hole"/><circle data-type="pcb_plated_hole"/><circle data-type="pcb_hole"/>'
    const edged = holesEdged(svg, colours)
    expect(edged.match(/stroke="#abcdef"/g)).toHaveLength(2)
    expect(edged).toContain('vector-effect="non-scaling-stroke"')
    // a pad's hole has the pad's copper round it
    expect(edged).toContain('<circle data-type="pcb_plated_hole"/>')
  })
})

describe("awayFaded", () => {
  const drawing =
    '<svg width="10" height="10"><path data-pcb-layer="top"/><path data-pcb-layer="bottom"/></svg>'
  const fadedOf = (layer: Parameters<typeof awayFaded>[1]) =>
    /<style>(.*) \{ opacity: [\d.]+; \}<\/style>/.exec(
      awayFaded(drawing, layer)
    )?.[1]

  it("draws the bottom and the layers inside faint under the top, seen from over the board", () => {
    expect(awayFaded(drawing, "top")).toMatch(
      /^<svg width="10" height="10"><style>/
    )
    expect(fadedOf("top")).toBe(
      '[data-pcb-layer="bottom"], [data-pcb-layer^="inner"]:not([data-pcb-layer="top"])'
    )
  })

  it("draws the top faint under the bottom, seen from under it", () => {
    expect(fadedOf("bottom")).toBe(
      '[data-pcb-layer="top"], [data-pcb-layer^="inner"]:not([data-pcb-layer="bottom"])'
    )
  })

  it("draws both sides and the other layers inside faint, for one inside", () => {
    expect(fadedOf("inner2")).toBe(
      '[data-pcb-layer="top"], [data-pcb-layer="bottom"], [data-pcb-layer^="inner"]:not([data-pcb-layer="inner2"])'
    )
  })
})

describe("poursLightened", () => {
  it("draws every pour of copper in less of its colour than tscircuit's half", () => {
    const lightened = poursLightened(
      '<svg width="10" height="10"><path fill-opacity="0.5" data-type="pcb_copper_pour"/></svg>'
    )
    const opacity =
      /\[data-type="pcb_copper_pour"\] \{ fill-opacity: ([\d.]+); \}/.exec(
        lightened
      )
    expect(Number(opacity?.[1])).toBeLessThan(0.5)
  })
})

describe("drawingOf", () => {
  it("draws the sections of a schematic's sheet, their titles and the lines between them, in the parts' ink", () => {
    const colours = {
      "schematic-lines": "#abcdef",
      "schematic-names": "#123456",
    } as PcbColours
    const circuit = [
      {
        type: "schematic_text",
        schematic_text_id: "schematic_text_0",
        anchor: "top_left",
        text: "Power",
        font_size: 0.18,
        color: "#000000",
        position: { x: 0, y: 0 },
        rotation: 0,
      },
      {
        type: "schematic_line",
        schematic_line_id: "schematic_line_0",
        x1: -1,
        y1: -1,
        x2: 1,
        y2: -1,
        stroke_width: 0.02,
        color: "#000000",
        is_dashed: true,
      },
    ]
    const drawn = drawingOf(
      circuit as unknown as Parameters<typeof drawingOf>[0],
      "schematic",
      colours,
      true,
      "#111111"
    )
    expect(drawn).toContain("Power")
    expect(drawn).toContain('fill="#abcdef"')
    expect(drawn).toContain('stroke="#abcdef"')
    expect(drawn).not.toMatch(/(fill|stroke)="#000000"/)
  })
})
