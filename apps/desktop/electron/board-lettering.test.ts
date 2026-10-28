import path from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

// the kit's own script, which the build runs: plain JavaScript, so imported by its path
type Found = (circuit: unknown[]) => string[]
let letteringOf: Found
beforeAll(async () => {
  const kit = path.join(import.meta.dirname, "../../../kit/board-lettering.mjs")
  ;({ letteringOf } = (await import(kit)) as { letteringOf: Found })
})

const BOARD = {
  type: "pcb_board",
  center: { x: 0, y: 0 },
  width: 40,
  height: 30,
}
const PART = [
  { type: "source_component", source_component_id: "s1", name: "R1" },
  { type: "pcb_component", pcb_component_id: "p1", source_component_id: "s1" },
]
const text = (said: string, x: number, y: number, more: object = {}) => ({
  type: "pcb_silkscreen_text",
  text: said,
  anchor_position: { x, y },
  font_size: 1.1,
  anchor_alignment: "center",
  layer: "top",
  ccw_rotation: 0,
  ...more,
})
const pad = (x: number, y: number) => ({
  type: "pcb_smtpad",
  shape: "rect",
  x,
  y,
  width: 0.8,
  height: 0.8,
  layer: "top",
  pcb_component_id: "p1",
})

describe("letteringOf", () => {
  it("finds nothing wrong with a word in capitals, clear of everything", () => {
    expect(
      letteringOf([
        BOARD,
        ...PART,
        text("BATT", 0, 0),
        pad(0, 2),
        text("R1", 5, 0, { pcb_component_id: "p1" }),
      ])
    ).toEqual([])
  })

  it("finds lower case", () => {
    const found = letteringOf([BOARD, text("pin 1 = VCC", 0, 0)])
    expect(found).toEqual([
      '"pin 1 = VCC" at (0.0, 0.0) has lower-case letters: print it in capitals.',
    ])
  })

  it("finds two words that run into each other, a part's name by its name", () => {
    const found = letteringOf([
      BOARD,
      ...PART,
      text("PIANO", 0, 0),
      text("R1", 0, 0.6, { pcb_component_id: "p1" }),
    ])
    expect(found).toEqual([
      `"PIANO" and R1's name run into each other, at (0.0, 0.0).`,
    ])
  })

  it("finds a word on a pad, and not one 0.3 mm clear of it", () => {
    // "SPK" is 2.28 mm wide and 0.86 tall: its right end at 1.14, the pad's left at 1.44
    expect(
      letteringOf([BOARD, ...PART, text("SPK", 0, 0), pad(1.84, 0)])
    ).toEqual([])
    const found = letteringOf([BOARD, ...PART, text("SPK", 0, 0), pad(1.2, 0)])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatch(
      /^"SPK" at \(0\.0, 0\.0\) runs into R1's pads: what is printed on copper is cut away/
    )
  })

  it("leaves a pad on the other side be", () => {
    expect(
      letteringOf([
        BOARD,
        ...PART,
        text("SPK", 0, 0),
        { ...pad(0, 0), layer: "bottom" },
      ])
    ).toEqual([])
  })

  it("finds a word on a dot, or on a part's outline, and not one inside a ring", () => {
    const dot = {
      type: "pcb_silkscreen_circle",
      center: { x: 1.2, y: 0 },
      radius: 0.2,
      stroke_width: 0.4,
    }
    expect(letteringOf([BOARD, text("SPK", 0, 0), dot])).toEqual([
      '"SPK" at (0.0, 0.0) runs into the dot at (1.2, 0.0).',
    ])
    const outline = {
      type: "pcb_silkscreen_path",
      pcb_component_id: "p1",
      stroke_width: 0.1,
      route: [
        { x: 1.2, y: -2 },
        { x: 1.2, y: 2 },
      ],
    }
    expect(letteringOf([BOARD, ...PART, text("SPK", 0, 0), outline])).toEqual([
      '"SPK" at (0.0, 0.0) runs into R1\'s outline.',
    ])
    const ring = {
      type: "pcb_silkscreen_circle",
      center: { x: 0, y: 0 },
      radius: 3,
      stroke_width: 0.1,
    }
    expect(letteringOf([BOARD, text("SPK", 0, 0), ring])).toEqual([])
  })

  it("finds a word over the board's edge, or too close to it", () => {
    expect(letteringOf([BOARD, text("J5", 0, 15)])).toEqual([
      '"J5" at (0.0, 15.0) goes over the board\'s edge.',
    ])
    expect(letteringOf([BOARD, text("J5", 0, 14.3)])).toEqual([
      '"J5" at (0.0, 14.3) comes within 0.5 mm of the board\'s edge.',
    ])
  })

  it("finds a word that reads upside down or from the top, and not one that reads from the right", () => {
    expect(
      letteringOf([BOARD, text("U4", 0, 0, { ccw_rotation: 90 })])
    ).toEqual([])
    expect(
      letteringOf([BOARD, text("U4", 0, 0, { ccw_rotation: 180 })])[0]
    ).toMatch(/reads upside down \(turned 180°\)/)
    expect(
      letteringOf([BOARD, text("J4", 0, 0, { ccw_rotation: 270 })])[0]
    ).toMatch(/reads from top to bottom \(turned 270°\)/)
    // read from the underside, the way it reads is the other way round: not judged
    expect(
      letteringOf([
        BOARD,
        text("U4", 0, 0, { ccw_rotation: 180, layer: "bottom" }),
      ])
    ).toEqual([])
  })

  it("measures a turned word as turned", () => {
    // turned a quarter, "CHARGE" (4.57 mm long) stands upright, clear of a pad beside it
    const turned = text("CHARGE", 0, 0, { ccw_rotation: 90 })
    expect(letteringOf([BOARD, ...PART, turned, pad(1.5, 0)])).toEqual([])
    expect(letteringOf([BOARD, ...PART, turned, pad(0, 2.5)])).toHaveLength(1)
  })

  it("finds lettering too small to print", () => {
    expect(letteringOf([BOARD, text("GND", 0, 0, { font_size: 0.6 })])).toEqual(
      [
        '"GND" at (0.0, 0.0) is 0.6 mm tall: make it 0.8 mm or more, or leave it off.',
      ]
    )
  })
})

describe("letteringOf, with artwork", () => {
  // a 4 mm square of artwork with a 2 mm hole in it, about (0, 0)
  const square = (side: number) =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) => ({ x: (x * side) / 2, y: (y * side) / 2 }))
  const art = {
    type: "pcb_silkscreen_graphic",
    pcb_silkscreen_graphic_id: "g1",
    layer: "top",
    shape: "brep",
    image_asset: { url: "data:image/svg+xml,logo" },
    brep_shape: {
      outer_ring: { vertices: square(4) },
      inner_rings: [{ vertices: square(2) }],
    },
  }

  it("finds a word that runs into the artwork, and not one in a hole of it", () => {
    expect(letteringOf([BOARD, art, text("BATT", 0, 2)])).toEqual([
      '"BATT" at (0.0, 2.0) runs into the artwork at (0.0, 0.0).',
    ])
    expect(
      letteringOf([BOARD, art, text("X", 0, 0, { font_size: 0.8 })])
    ).toEqual([])
  })

  it("finds artwork on a pad, and on the same side only", () => {
    expect(letteringOf([BOARD, ...PART, art, pad(2, 0)])).toEqual([
      "The artwork at (0.0, 0.0) runs into R1's pads: what is printed on copper is cut away when the board is made.",
    ])
    expect(
      letteringOf([BOARD, ...PART, art, { ...pad(2, 0), layer: "bottom" }])
    ).toEqual([])
  })

  it("finds artwork over the edge", () => {
    const off = {
      ...art,
      brep_shape: {
        outer_ring: {
          vertices: square(4).map((p) => ({ x: p.x + 19, y: p.y })),
        },
        inner_rings: [],
      },
    }
    expect(letteringOf([BOARD, off])).toEqual([
      "The artwork at (19.0, 0.0) goes over the board's edge.",
    ])
  })
})
