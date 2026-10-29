import { describe, expect, it } from "vitest"

import type { PcbColours } from "@shared/theme-format"
import {
  drawingOf,
  fromUnder,
  holesEdged,
  layersColoured,
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

describe("layersColoured", () => {
  const drawing =
    '<svg width="10" height="10"><path data-type="pcb_copper_pour" data-pcb-layer="top"/></svg>'
  const colours = {
    "technical-top-behind": "#11111133",
    "technical-inner1-behind": "#22222266",
    "technical-inner2-behind": "#333333",
    "technical-bottom-behind": "#44444400",
  } as PcbColours
  /** Every layer has something poured over it. */
  const poured = new Set([
    "top",
    "bottom",
    ...Array.from({ length: 8 }, (_, at) => `inner${at + 1}`),
  ])
  /** What each layer's pours are drawn in, as the drawing has it. */
  const poursOf = (layer: Parameters<typeof layersColoured>[1]) =>
    Object.fromEntries(
      [
        ...layersColoured(drawing, layer, colours, poured).matchAll(
          /\[data-type="pcb_copper_pour"\]\[data-pcb-layer="(\w+)"\] \{ fill: (#\w+); fill-opacity: ([\d.]+); \}/g
        ),
      ].map(([, one, fill, opacity]) => [
        one,
        { fill, opacity: Number(opacity) },
      ])
    )

  it("draws each layer's pours in the theme's colour for them, as much of it as it has show, whichever is looked at", () => {
    for (const layer of ["top", "inner2", "bottom"] as const) {
      const pours = poursOf(layer)
      expect(pours.top.fill).toBe("#111111")
      expect(pours.top.opacity).toBeCloseTo(0x33 / 255, 3)
      // a colour that says nothing of it shows all of it, and none shows none
      expect(pours.inner2.opacity).toBe(1)
      expect(pours.bottom.opacity).toBe(0)
      // and those inside past the second by turns
      expect(pours.inner3.fill).toBe("#222222")
    }
  })

  it("leaves the traces and pads of every layer as they are: only print is made faint", () => {
    const faint = [
      ...layersColoured(drawing, "inner1", colours, poured).matchAll(
        /([^{}>]+) \{ opacity:/g
      ),
    ].map(([, rule]) => rule.trim())
    expect(faint).toEqual([
      '[data-type^="pcb_silkscreen"][data-pcb-layer="bottom"]',
    ])
  })

  it("draws faint a layer not looked at that has nothing poured over it", () => {
    const faint = (layer: Parameters<typeof layersColoured>[1]) =>
      [
        ...layersColoured(
          drawing,
          layer,
          colours,
          new Set(["inner1"])
        ).matchAll(
          /(?<=\} )\[data-pcb-layer="(\w+)"\] \{ opacity: ([\d.]+); \}/g
        ),
      ].map(([, one, opacity]) => [one, Number(opacity)])
    expect(faint("top")).toEqual(
      expect.arrayContaining([
        ["bottom", 0.3],
        ["inner2", 0.3],
      ])
    )
    // not the one looked at, nor one with a pour
    expect(faint("top").map(([one]) => one)).not.toContain("top")
    expect(faint("top").map(([one]) => one)).not.toContain("inner1")
    expect(faint("bottom").map(([one]) => one)).toContain("top")
  })

  it("draws faint what is printed on the side not looked from", () => {
    expect(layersColoured(drawing, "top", colours, poured)).toMatch(
      /\[data-type\^="pcb_silkscreen"\]\[data-pcb-layer="bottom"\] \{ opacity: [\d.]+; \}/
    )
    expect(layersColoured(drawing, "inner1", colours, poured)).toContain(
      '[data-type^="pcb_silkscreen"][data-pcb-layer="bottom"]'
    )
    expect(layersColoured(drawing, "bottom", colours, poured)).toContain(
      '[data-type^="pcb_silkscreen"][data-pcb-layer="top"]'
    )
  })
})

describe("drawingOf", () => {
  it("draws each layer of copper in the theme's colour for it, whichever is looked at", () => {
    const colours = {
      "technical-top": "#a10000",
      "technical-inner1": "#a20000",
      "technical-inner2": "#a30000",
      "technical-bottom": "#a40000",
      "technical-top-behind": "#b1000066",
      "technical-inner1-behind": "#b2000066",
      "technical-inner2-behind": "#b3000066",
      "technical-bottom-behind": "#b4000066",
      "technical-print": "#ffffff",
      "technical-edge": "#888888",
    } as PcbColours
    const trace = (id: string, layer: string) => ({
      type: "pcb_trace",
      pcb_trace_id: id,
      route: [
        { route_type: "wire", x: 0, y: 0, width: 0.2, layer },
        { route_type: "wire", x: 5, y: 0, width: 0.2, layer },
      ],
    })
    const circuit = [
      {
        type: "pcb_board",
        pcb_board_id: "b",
        center: { x: 0, y: 0 },
        width: 20,
        height: 20,
        num_layers: 4,
        thickness: 1.6,
        material: "fr4",
      },
      trace("t1", "top"),
      trace("t2", "inner1"),
      trace("t3", "inner2"),
      trace("t4", "bottom"),
    ]
    const drawn = drawingOf(
      circuit as unknown as Parameters<typeof drawingOf>[0],
      "pcb",
      colours,
      true,
      "#000000"
    )
    for (const colour of ["#a10000", "#a20000", "#a30000", "#a40000"])
      expect(drawn).toContain(colour)
  })

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
