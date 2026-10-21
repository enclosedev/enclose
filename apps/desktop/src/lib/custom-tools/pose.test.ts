import { describe, expect, it } from "vitest"

import { after, AT_HOME, atHome, carrying, placed, turning } from "./pose"

const near = (got: number[], wanted: number[]) =>
  got.forEach((n, index) => expect(n).toBeCloseTo(wanted[index], 9))

describe("turning", () => {
  it("turns anticlockwise about Z, seen from above", () => {
    near(placed(turning([0, 0, 0], [0, 0, 1], 90), [10, 0, 5]), [0, 10, 5])
  })

  it("leaves the point it turns about where it was", () => {
    const pose = turning([3, 4, 5], [1, 2, 3], 77)
    near(placed(pose, [3, 4, 5]), [3, 4, 5])
    near(placed(pose, [4, 6, 8]), [4, 6, 8])
  })

  it("turns about a line that is not through the origin", () => {
    near(placed(turning([10, 0, 0], [0, 0, 1], 180), [12, 0, 0]), [8, 0, 0])
  })

  it("goes by the direction of an axis, not its length", () => {
    near(turning([1, 2, 3], [0, 0, 5], 30), turning([1, 2, 3], [0, 0, 1], 30))
  })

  it("does nothing about no axis at all", () => {
    expect(atHome(turning([1, 2, 3], [0, 0, 0], 30))).toBe(true)
  })
})

describe("after", () => {
  it("does the first move first", () => {
    const pose = after(turning([0, 0, 0], [0, 0, 1], 90), carrying([10, 0, 0]))
    near(placed(pose, [0, 0, 0]), [0, 10, 0])
    const other = after(carrying([10, 0, 0]), turning([0, 0, 0], [0, 0, 1], 90))
    near(placed(other, [0, 0, 0]), [10, 0, 0])
  })

  it("carries a forearm round with the arm it is on", () => {
    // the elbow is 100 along X from the shoulder: bent a quarter, then the whole arm
    // raised a quarter, the hand 50 past the elbow ends up back over the shoulder's side
    const elbow = turning([100, 0, 0], [0, 0, 1], 90)
    const shoulder = turning([0, 0, 0], [0, 0, 1], 90)
    near(placed(after(shoulder, elbow), [150, 0, 0]), [-50, 100, 0])
  })
})

describe("atHome", () => {
  it("is so of a part that was not moved, or was moved back", () => {
    expect(atHome(AT_HOME)).toBe(true)
    expect(atHome(after(carrying([-1, 0, 0]), carrying([1, 0, 0])))).toBe(true)
    expect(atHome(carrying([0, 0, 0.01]))).toBe(false)
  })
})
