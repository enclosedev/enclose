import { describe, expect, it } from "vitest"

import { clearFor, columnFor, labelsOf } from "./labels"
import type { Stroke } from "./lines"
import { MARGIN, SHEET, WRITING, type Placing } from "./sheet"

/** Life size, with the model's own middle at the sheet's. */
const PLACING: Placing = { middle: [0, 0], by: 1 }
const COLUMN = 30

/** A part drawn as a box: so far across and so far up, about a place in the drawing. */
const box = (label: string, x: number, y: number, wide = 10, high = 6) => ({
  label,
  strokes: [
    {
      points: [
        x - wide / 2,
        y - high / 2,
        x + wide / 2,
        y - high / 2,
        x + wide / 2,
        y + high / 2,
        x - wide / 2,
        y + high / 2,
      ],
      closed: true,
    },
  ] as Stroke[],
})

describe("the names of the parts on a sheet", () => {
  it("names a part on the side of the drawing it is on", () => {
    const [left, right] = labelsOf(
      [box("Left foot", -40, 0), box("Right foot", 40, 0)],
      PLACING,
      COLUMN
    )
    expect(left).toMatchObject({ said: "Left foot", text: { side: "left" } })
    expect(right).toMatchObject({ said: "Right foot", text: { side: "right" } })
    expect(left.text.x).toBeLessThan(SHEET.width / 2 - 40)
    expect(right.text.x).toBe(SHEET.width - left.text.x)
  })

  it("draws a line from the name that ends on the part, at its near side", () => {
    const [label] = labelsOf([box("Left foot", -40, 0)], PLACING, COLUMN)
    // the part's left side, on the sheet: and level with the middle of it
    expect(label.at[0]).toBeCloseTo(SHEET.width / 2 - 45, 9)
    expect(label.line.slice(-2)).toEqual(label.at)
    expect(label.line[0]).toBeGreaterThan(label.text.x)
    expect(label.line[1]).toBe(label.line[3])
    expect(label.line[1]).toBeLessThan(label.text.y)
    expect(label.text.y - label.line[1]).toBeLessThan(WRITING)
  })

  it("has no name for a part with no line to show", () => {
    const labels = labelsOf(
      [box("Lid", -40, 0), { label: "Spring", strokes: [] }],
      PLACING,
      COLUMN
    )
    expect(labels.map((label) => label.said)).toEqual(["Lid"])
  })

  it("names parts that are one over another turn about, left and right", () => {
    const stack = [30, 10, -10, -30].map((y, n) => box(`Layer ${n + 1}`, 0, y))
    const labels = labelsOf(stack, PLACING, COLUMN)
    const side = (said: string) =>
      labels.find((label) => label.said === said)!.text.side
    expect(["Layer 1", "Layer 2", "Layer 3", "Layer 4"].map(side)).toEqual([
      "left",
      "right",
      "left",
      "right",
    ])
  })

  it("keeps the names in a column a line apart, in the order of their parts", () => {
    // a dozen parts at all but the same height, at one side
    const crowd = Array.from({ length: 12 }, (_, n) =>
      box(`Pin ${n + 1}`, -40 - n, n * 0.1, 2, 2)
    )
    const feet = labelsOf(crowd, PLACING, COLUMN).map((label) => label.text.y)
    for (let i = 1; i < feet.length; i++)
      expect(feet[i] - feet[i - 1]).toBeGreaterThan(WRITING)
    expect(Math.min(...feet)).toBeGreaterThan(0)
    expect(Math.max(...feet)).toBeLessThan(SHEET.height)
  })

  it("keeps every name on the sheet, though its part is at the very foot of it", () => {
    const low = Array.from({ length: 6 }, (_, n) =>
      box(`Foot ${n + 1}`, -40, -SHEET.height / 2 + 2 + n, 4, 1)
    )
    for (const { text } of labelsOf(low, PLACING, COLUMN))
      expect(text.y).toBeLessThan(SHEET.height - 5)
  })

  it("names the biggest parts, where there are more than a sheet has room to name", () => {
    const many = Array.from({ length: 400 }, (_, n) =>
      box(`Part ${n}`, (n % 2 ? 1 : -1) * 40, (n % 50) - 25, 1 + n / 100, 1)
    )
    const labels = labelsOf(many, PLACING, COLUMN)
    expect(labels.length).toBeLessThan(400)
    expect(labels.length).toBeGreaterThan(50)
    // the last of them is the widest, and the first is not among those named
    const said = labels.map((label) => label.said)
    expect(said).toContain("Part 399")
    expect(said).not.toContain("Part 0")
    for (const side of ["left", "right"]) {
      const feet = labels
        .filter((label) => label.text.side === side)
        .map((label) => label.text.y)
        .sort((a, b) => a - b)
      for (let i = 1; i < feet.length; i++)
        expect(feet[i] - feet[i - 1]).toBeGreaterThan(WRITING)
      expect(feet[0]).toBeGreaterThan(0)
    }
  })

  it("cuts a name short that is longer than its column is wide", () => {
    const [label] = labelsOf(
      [box("Back cover screws, M2.5 × 8, stainless, countersunk", -40, 0)],
      PLACING,
      COLUMN
    )
    expect(label.said.endsWith("…")).toBe(true)
    expect(label.said.length).toBeLessThan(30)
    expect(label.said.startsWith("Back cover")).toBe(true)
  })
})

describe("the room the names take", () => {
  it("is columns as wide as the longest name, within bounds", () => {
    expect(columnFor(["Lid", "Base"])).toBeLessThan(
      columnFor(["Carrier bearings"])
    )
    const long = columnFor(["A name that goes on for a very long time indeed"])
    expect(
      columnFor(["A name that goes on for a very long time indeed, twice"])
    ).toBe(long)
    expect(columnFor([])).toBeGreaterThan(0)
  })

  it("is kept clear of the drawing, and more of it where the size is said as well", () => {
    const column = columnFor(["Carrier bearings"])
    expect(clearFor(column, false)).toBeGreaterThan(MARGIN)
    expect(clearFor(column, false)).toBeGreaterThan(column)
    expect(clearFor(column, true)).toBeGreaterThan(clearFor(column, false))
  })
})
