import { describe, expect, it } from "vitest"

import {
  lookingFrom,
  onSheet,
  PAPER,
  pathOf,
  placed,
  reduction,
  scaleSaid,
  SHEET,
  SIDES,
  svgOf,
} from "./sheet"

const near = (got: number[], wanted: number[]) =>
  got.forEach((value, index) => expect(value).toBeCloseTo(wanted[index], 9))

describe("the sides a model is drawn from", () => {
  const side = (name: string) => SIDES.find((one) => one.name === name)!.looking

  it("are four corners and then the six set views, a sheet to each", () => {
    expect(SIDES.map((one) => one.name)).toEqual([
      "Top Left",
      "Top Right",
      "Bottom Left",
      "Bottom Right",
      "Front",
      "Back",
      "Top",
      "Bottom",
      "Left",
      "Right",
    ])
    expect(SIDES.map((one) => one.flat)).toEqual([
      ...Array<boolean>(4).fill(false),
      ...Array<boolean>(6).fill(true),
    ])
  })

  it("looks at the front from -Y, with Z up", () => {
    near(side("Front").back, [0, -1, 0])
    near(side("Front").right, [1, 0, 0])
    near(side("Front").up, [0, 0, 1])
  })

  it("looks at the right from +X, with the back to the right", () => {
    near(side("Right").back, [1, 0, 0])
    near(side("Right").right, [0, 1, 0])
    near(side("Right").up, [0, 0, 1])
  })

  it("has the model's back at the top from above and from below alike", () => {
    near(side("Top").back, [0, 0, 1])
    near(side("Top").up, [0, 1, 0])
    near(side("Top").right, [1, 0, 0])
    // turned over sideways, not end over end
    near(side("Bottom").back, [0, 0, -1])
    near(side("Bottom").up, [0, 1, 0])
    near(side("Bottom").right, [-1, 0, 0])
  })

  it("looks at a corner from the front and one side, all three sides turned alike", () => {
    const third = 1 / Math.sqrt(3)
    const half = Math.SQRT1_2
    near(side("Top Right").back, [third, -third, third])
    near(side("Top Right").right, [half, half, 0])
    near(side("Top Left").back, [-third, -third, third])
    near(side("Top Left").right, [half, -half, 0])
    near(side("Bottom Right").back, [third, -third, -third])
    near(side("Bottom Left").back, [-third, -third, -third])
    // from below as from above, the model stands the right way up
    for (const name of ["Top Left", "Top Right", "Bottom Left", "Bottom Right"])
      expect(side(name).up[2]).toBeCloseTo(Math.sqrt(2 / 3))
  })

  it("is three directions square to one another, wherever it is looked from", () => {
    const { right, up, back } = lookingFrom({ azimuth: 0.7, polar: 1.1 })
    const dot = (a: number[], b: number[]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    for (const way of [right, up, back]) expect(dot(way, way)).toBeCloseTo(1)
    expect(dot(right, up)).toBeCloseTo(0)
    expect(dot(right, back)).toBeCloseTo(0)
    expect(dot(up, back)).toBeCloseTo(0)
  })
})

describe("reduction", () => {
  // the most paper a drawing is given, less what is kept clear at its edges: 564 by 390
  it("draws life size what fills its paper so", () => {
    expect(reduction([{ width: 400, height: 300 }])).toBe(1)
    expect(reduction([{ width: 564, height: 390 }])).toBe(1)
  })

  it("draws smaller, by the least step that fits, what does not fit", () => {
    expect(reduction([{ width: 565, height: 100 }])).toBe(2)
    expect(reduction([{ width: 100, height: 800 }])).toBe(5)
    expect(reduction([{ width: 3000, height: 100 }])).toBe(10)
    expect(reduction([{ width: 100, height: 4000 }])).toBe(20)
  })

  it("draws bigger than life, by the most that fits, what is small", () => {
    // twice over it would be 560 across, which fits: five times, 1400
    expect(reduction([{ width: 280, height: 100 }])).toBe(0.5)
    expect(reduction([{ width: 100, height: 60 }])).toBe(0.2)
    expect(reduction([{ width: 10, height: 30 }])).toBe(0.1)
    expect(reduction([{ width: 3, height: 3 }])).toBe(0.01)
  })

  it("draws smaller what does not fit beside what is kept clear for names", () => {
    // 500 mm across fits paper 594 wide: but not with 60 kept clear at either side
    expect(reduction([{ width: 500, height: 100 }])).toBe(1)
    expect(reduction([{ width: 500, height: 100 }], { x: 60, y: 15 })).toBe(2)
  })

  it("goes by the largest of the drawings, which are all to one scale", () => {
    expect(
      reduction([
        { width: 100, height: 100 },
        { width: 100, height: 800 },
      ])
    ).toBe(5)
  })

  it("draws nothing life size, there being nothing to fit", () => {
    expect(reduction([])).toBe(1)
    expect(reduction([{ width: 0, height: 0 }])).toBe(1)
  })
})

describe("a scale as it is written", () => {
  it("is one to so many, of what is drawn smaller than life or as big", () => {
    expect(scaleSaid(1)).toBe("1:1")
    expect(scaleSaid(5)).toBe("1:5")
  })

  it("is so many to one, of what is drawn bigger", () => {
    expect(scaleSaid(0.5)).toBe("2:1")
    expect(scaleSaid(0.2)).toBe("5:1")
    expect(scaleSaid(0.01)).toBe("100:1")
  })
})

describe("the paper of a drawing", () => {
  // the six sides come after the four corners: a box 280 by 100 by 60, seen from each
  const seen = SIDES.map((side, index) =>
    side.flat
      ? index % 2
        ? { x0: -140, x1: 140, y0: -30, y1: 30 }
        : { x0: -50, x1: 50, y0: -30, y1: 30 }
      : { x0: -160, x1: 160, y0: -110, y1: 110 }
  )

  it("is the drawing and what is kept clear round it, and no more", () => {
    const flat = placed(seen)[SIDES.findIndex((side) => side.flat) + 1]
    // twice life size: 560 across and 120 high, and 15 clear all round
    expect(flat.by).toBe(0.5)
    expect(flat.paper).toEqual({ width: 590, height: 150 })
  })

  it("has the sides to one scale, and the smaller of them on smaller paper", () => {
    const sides = placed(seen).filter((_, index) => SIDES[index].flat)
    expect(new Set(sides.map((side) => side.by)).size).toBe(1)
    expect(sides[0].paper!.width).toBeLessThan(sides[1].paper!.width)
  })

  it("is as tall as what is written beside the drawing needs, and no taller than paper gets", () => {
    const index = SIDES.findIndex((side) => side.flat)
    const tall = SIDES.map(() => 300)
    expect(placed(seen, undefined, tall)[index].paper!.height).toBe(300)
    expect(
      placed(
        seen,
        undefined,
        SIDES.map(() => 9000)
      )[index].paper!.height
    ).toBe(PAPER.height)
  })

  it("is what the file is the size of", () => {
    const svg = svgOf({
      title: "Box",
      placing: { middle: [0, 0], by: 1, paper: { width: 590, height: 150 } },
      groups: [],
    })
    expect(svg).toContain('width="590mm" height="150mm" viewBox="0 0 590 150"')
  })
})

describe("a drawing on its sheet", () => {
  it("has its middle at the sheet's, and up as up", () => {
    const placing = { middle: [10, 20] as [number, number], by: 2 }
    expect(onSheet(10, 20, placing)).toEqual([
      SHEET.width / 2,
      SHEET.height / 2,
    ])
    expect(onSheet(30, 40, placing)).toEqual([
      SHEET.width / 2 + 10,
      SHEET.height / 2 - 10,
    ])
  })

  it("is written as paths in millimetres of the sheet", () => {
    const placing = { middle: [0, 0] as [number, number], by: 1 }
    expect(
      pathOf({ points: [0, 0, 10, 0, 10, 5.12345], closed: false }, placing)
    ).toBe("M105 131.25L115 131.25L115 126.127")
    expect(
      pathOf({ points: [0, 0, 10, 0, 10, 10], closed: true }, placing)
    ).toBe("M105 131.25L115 131.25L115 121.25Z")
  })
})

describe("svgOf", () => {
  const stroke = { points: [0, 0, 10, 0], closed: false }
  const svg = svgOf({
    title: 'Sensor "box" <1>, front view (1:1)',
    placing: { middle: [0, 0], by: 1 },
    groups: [
      {
        id: "screws",
        label: "Screws & nuts",
        parts: [
          { id: "screws", label: "Lid screws", strokes: [stroke] },
          { id: "4 nuts", label: "Nuts", strokes: [stroke, stroke] },
          { id: "hidden", label: "Not seen from here", strokes: [] },
        ],
      },
      { id: "empty", label: "Nothing of it shows", parts: [] },
    ],
  })

  it("is a sheet four wide to five high, in millimetres", () => {
    expect(svg).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="262.5mm" viewBox="0 0 210 262.5">'
    )
    expect(svg).toContain('fill="none"')
    // a point and a half, in millimetres
    expect(svg).toContain('stroke-width="0.529"')
  })

  it("has each part's lines under its name, and its group's", () => {
    expect(svg.match(/<path /g)).toHaveLength(3)
    expect(svg).toContain("<title>Screws &#38; nuts</title>")
    expect(svg).toContain("<title>Lid screws</title>")
    expect(svg).not.toContain("Not seen from here")
    expect(svg).not.toContain("Nothing of it shows")
  })

  it("gives everything a name of its own that a file can have", () => {
    const names = [...svg.matchAll(/<g id="([^"]+)">/g)].map((m) => m[1])
    expect(names).toEqual(["screws", "screws_2", "_4_nuts"])
  })

  it("has the names of the parts in a group of their own, each with its line and its dot", () => {
    const labelled = svgOf({
      title: "Box",
      placing: { middle: [0, 0], by: 1 },
      groups: [],
      labels: [
        {
          said: "Lid & <hinge>",
          line: [36.5, 100, 39.5, 100, 60, 110],
          at: [60, 110],
          text: { x: 35, y: 101, side: "left" },
        },
        {
          said: "Base",
          line: [173.5, 120, 170.5, 120, 150, 118],
          at: [150, 118],
          text: { x: 175, y: 121, side: "right" },
        },
      ],
    })
    expect(labelled).toContain('<g id="labels"')
    // the line is of dots: no length to each, and round ends
    expect(labelled).toContain(
      '<path d="M36.5 100L39.5 100L60 110" stroke-dasharray="0 0.9"/>'
    )
    expect(labelled).toMatch(/<g id="labels"[^>]*stroke-linecap="round"/)
    expect(labelled).toContain('<circle cx="60" cy="110"')
    // a name at the left ends at the drawing's side, and one at the right begins there
    expect(labelled).toMatch(
      /<text x="35" y="101" text-anchor="end"[^>]*>Lid &#38; &#60;hinge&#62;</
    )
    expect(labelled).toMatch(
      /<text x="175" y="121" text-anchor="start"[^>]*>Base</
    )
    // (half bold: it is small, and is read against the lines of the drawing)
    expect(labelled).toMatch(/<text x="175"[^>]*font-weight="600"/)
    expect(
      svgOf({ title: "Box", placing: { middle: [0, 0], by: 1 }, groups: [] })
    ).not.toContain("labels")
  })

  it("says nothing a file cannot", () => {
    expect(svg).toContain(
      "<title>Sensor &#34;box&#34; &#60;1&#62;, front view (1:1)</title>"
    )
  })
})
