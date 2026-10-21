import { describe, expect, it } from "vitest"

import { dimensionsOf, lengthSaid, type Room } from "./dimensions"
import { SHEET, SIDES } from "./sheet"

const side = (name: string) => SIDES.find((one) => one.name === name)!
/** A box 130 wide, 120 deep and 30 high, standing on the ground about the middle. */
const ROOM: Room = { min: [-65, -60, 0], max: [65, 60, 30] }
const LIFE = { middle: [0, 15] as [number, number], by: 1 }

describe("lengthSaid", () => {
  it("writes millimetres to the tenth, and no nought that says nothing", () => {
    expect(lengthSaid(120, "mm")).toBe("120")
    expect(lengthSaid(119.96, "mm")).toBe("120")
    expect(lengthSaid(46.84, "mm")).toBe("46.8")
  })

  it("writes inches to the hundredth", () => {
    expect(lengthSaid(127, "in")).toBe("5.00")
    expect(lengthSaid(30, "in")).toBe("1.18")
  })
})

describe("dimensionsOf", () => {
  it("says the two lengths a side shows: across its top, and down its left", () => {
    const { looking } = side("Front")
    const [across, down] = dimensionsOf(ROOM, looking, true, LIFE, "mm")
    expect(across.text.said).toBe("130")
    expect(down.text.said).toBe("30")
    const [, , line] = across.lines
    expect(line[0]).toBeCloseTo(SHEET.width / 2 - 65)
    expect(line[2]).toBeCloseTo(SHEET.width / 2 + 65)
    expect(line[1]).toBeCloseTo(line[3])
    expect(line[1]).toBeLessThan(SHEET.height / 2 - 15)
    expect(across.text.x).toBeCloseTo(SHEET.width / 2)
    expect(across.text.y).toBeLessThan(line[1])
    expect(across.text.turn).toBeCloseTo(0)
    const [, , upright] = down.lines
    expect(upright[0]).toBeCloseTo(upright[2])
    expect(upright[0]).toBeLessThan(SHEET.width / 2 - 65)
    expect(down.text.x).toBeLessThan(upright[0])
    expect(down.text.turn).toBeCloseTo(-90)
  })

  it("says the depth where a side shows it", () => {
    const from = (name: string) =>
      dimensionsOf(ROOM, side(name).looking, true, LIFE, "mm").map(
        (one) => one.text.said
      )
    expect(from("Top")).toEqual(["130", "120"])
    expect(from("Bottom")).toEqual(["130", "120"])
    expect(from("Left")).toEqual(["120", "30"])
    expect(from("Right")).toEqual(["120", "30"])
  })

  it("says all three from a corner, in the unit asked for", () => {
    for (const name of [
      "Top Left",
      "Top Right",
      "Bottom Left",
      "Bottom Right",
    ]) {
      const said = (unit: "mm" | "in") =>
        dimensionsOf(ROOM, side(name).looking, false, LIFE, unit).map(
          (one) => one.text.said
        )
      expect(said("mm")).toEqual(["130", "120", "30"])
      expect(said("in")).toEqual(["5.12", "4.72", "1.18"])
    }
  })

  it("keeps a corner's figures the right way up, and its height standing", () => {
    for (const name of [
      "Top Left",
      "Top Right",
      "Bottom Left",
      "Bottom Right",
    ]) {
      const [width, depth, height] = dimensionsOf(
        ROOM,
        side(name).looking,
        false,
        LIFE,
        "mm"
      )
      for (const one of [width, depth])
        expect(Math.abs(one.text.turn)).toBeCloseTo(30)
      expect(height.text.turn).toBeCloseTo(-90)
    }
  })

  it("points the arrows in from outside where there is no room between them", () => {
    const thin: Room = { min: [0, 0, 0], max: [100, 100, 4] }
    const [, down] = dimensionsOf(
      thin,
      side("Front").looking,
      true,
      { middle: [50, 2], by: 1 },
      "mm"
    )
    const [, , line] = down.lines
    // the line goes on past both ends, for the arrows to stand on
    expect(Math.abs(line[3] - line[1])).toBeGreaterThan(4)
  })

  it("says nothing of nothing", () => {
    const none: Room = { min: [0, 0, 0], max: [0, 0, 0] }
    expect(dimensionsOf(none, side("Front").looking, true, LIFE, "mm")).toEqual(
      []
    )
  })
})
