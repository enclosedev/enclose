import * as THREE from "three"
import { describe, expect, it } from "vitest"

import type { Vec3 } from "@shared/api"
import { lookingFrom, SHEET, type Seen } from "@/components/blueprint/sheet"
import { FROM, lookingAt, roomOf, SET, setOn } from "./cover"

const near = (got: Vec3, wanted: Vec3) =>
  got.forEach((n, index) => expect(n).toBeCloseTo(wanted[index], 6))
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
/** The room something takes up, to as near as makes no difference. */
const roomy = (got: Seen, wanted: Seen) =>
  (Object.keys(wanted) as (keyof Seen)[]).forEach((edge) =>
    expect(got[edge]).toBeCloseTo(wanted[edge], 6)
  )

/** A part that takes up this room where the model has it, or once it is moved by `home`. */
const part = (min: Vec3, max: Vec3, home = new THREE.Matrix4()) => ({
  box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
  home,
})

describe("lookingAt", () => {
  it("looks back along the way it is given, however long that is", () => {
    near(lookingAt([0, -1, 0]).back, [0, -1, 0])
    near(lookingAt([3, 0, 0]).back, [1, 0, 0])
    const [x, y, z] = lookingAt([1, -2, 0.5]).back
    expect(x / y).toBeCloseTo(-0.5)
    expect(z / y).toBeCloseTo(-0.25)
  })

  it("has the model's right to the eye's right from the front, and up up", () => {
    const { right, up } = lookingAt([0, -1, 0])
    near(right, [1, 0, 0])
    near(up, [0, 0, 1])
  })

  it("keeps the thing upright, from wherever it is looked at", () => {
    for (const from of [
      FROM,
      [-1, -2, 0.5],
      [1, 1.5, -0.4],
      [0.3, -0.5, 1],
    ] as Vec3[]) {
      const { right, up, back } = lookingAt(from)
      expect(right[2]).toBeCloseTo(0)
      expect(dot(right, up)).toBeCloseTo(0)
      expect(dot(right, back)).toBeCloseTo(0)
      expect(dot(up, back)).toBeCloseTo(0)
      if (from[2] > 0) expect(up[2]).toBeGreaterThan(0)
    }
  })

  it("is the corner a blueprint draws, where the guide does not say", () => {
    const corner = lookingFrom({
      azimuth: Math.PI / 4,
      polar: Math.acos(1 / Math.sqrt(3)),
    })
    near(lookingAt(FROM).back, corner.back)
    near(lookingAt(FROM).right, corner.right)
  })

  it("has a front from straight above, and from straight below", () => {
    const above = lookingAt([0, 0, 1])
    expect(above.back[2]).toBeGreaterThan(0.999)
    // the model's front is at the foot of the sheet, and its right to the right
    near(above.right, [1, 0, 0])
    expect(above.up[1]).toBeGreaterThan(0.999)
    const below = lookingAt([0, 0, -1])
    expect(below.back[2]).toBeLessThan(-0.999)
    near(below.right, [1, 0, 0])
  })

  it("is from the front, of a way that points nowhere", () => {
    near(lookingAt([0, 0, 0]).back, [0, -1, 0])
  })
})

describe("roomOf", () => {
  const front = lookingAt([0, -1, 0])

  it("is what the parts take up across and up, as they are looked at", () => {
    roomy(
      roomOf(
        [part([-30, -5, 0], [30, 5, 80]), part([40, -5, 10], [50, 5, 20])],
        front
      ),
      { x0: -30, x1: 50, y0: 0, y1: 80 }
    )
  })

  it("takes a part where the model has it, and not where its own frame does", () => {
    const moved = new THREE.Matrix4().makeTranslation(100, 0, 200)
    roomy(roomOf([part([-10, 0, 0], [10, 5, 30], moved)], front), {
      x0: 90,
      x1: 110,
      y0: 200,
      y1: 230,
    })
  })

  it("is wider seen from a corner than from a side", () => {
    const cube = [part([-10, -10, -10], [10, 10, 10])]
    const corner = roomOf(cube, lookingAt(FROM))
    expect(corner.x1 - corner.x0).toBeCloseTo(20 * Math.SQRT2)
  })
})

describe("setOn", () => {
  /** How much of the sheet a drawing may have, across and down, mm. */
  const wide = SHEET.width * (1 - 2 * SET.side)
  const high = SHEET.height * (SET.foot - SET.top)

  it("draws a thing as big as fills the sheet's room across, where it is wide", () => {
    const { by, paper } = setOn({ x0: -200, x1: 200, y0: 0, y1: 100 })
    expect(paper).toEqual(SHEET)
    expect(400 / by).toBeCloseTo(wide)
    expect(100 / by).toBeLessThan(high)
  })

  it("draws it as big as fills the room down the sheet, where it is tall", () => {
    const { by } = setOn({ x0: -20, x1: 20, y0: 0, y1: 900 })
    expect(900 / by).toBeCloseTo(high)
    expect(40 / by).toBeLessThan(wide)
  })

  it("draws a small thing bigger than life, to fill the sheet all the same", () => {
    expect(setOn({ x0: 0, x1: 10, y0: 0, y1: 10 }).by).toBeLessThan(1)
  })

  it("has it in the middle of that room, which is a little lower than the sheet's own", () => {
    const room = { x0: -200, x1: 200, y0: 100, y1: 300 }
    const { middle, by } = setOn(room)
    expect(middle[0]).toBe(0)
    // what is at the sheet's middle is above the middle of the thing: so the thing
    // is below it, by as much as the room is
    const lower = (middle[1] - 200) / by
    expect(lower).toBeCloseTo(SHEET.height * ((SET.top + SET.foot) / 2 - 0.5))
    expect(lower).toBeGreaterThan(0)
  })

  it("makes something of what takes up no room at all", () => {
    const { by, middle } = setOn({ x0: 5, x1: 5, y0: 7, y1: 7 })
    expect(by).toBeGreaterThan(0)
    expect(Number.isFinite(middle[1])).toBe(true)
  })
})
