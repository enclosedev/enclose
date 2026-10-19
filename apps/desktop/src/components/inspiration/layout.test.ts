import { describe, expect, it } from "vitest"

import {
  boundsOf,
  fitting,
  GAP,
  onBoard,
  overlaps,
  pileOf,
  placed,
  pushedAside,
  spreadOf,
  takenIn,
  widthFor,
  zoomedOn,
  type Box,
} from "./layout"

/** Always the same numbers, each from 0 to 1, as Math.random would give. */
function seeded(seed = 7) {
  let at = seed
  return () => {
    at = (at * 16807) % 2147483647
    return (at - 1) / 2147483646
  }
}

describe("widthFor", () => {
  it("makes a wide picture wider than a tall one, and neither too much", () => {
    const wide = widthFor([1600, 900], 0.5)
    const tall = widthFor([900, 1600], 0.5)
    expect(wide).toBeGreaterThan(tall)
    expect(widthFor([8000, 100], 0.5)).toBe(520)
    expect(widthFor([100, 8000], 0.5)).toBe(170)
  })
})

describe("placed", () => {
  it("puts the first of them where it was asked for, when there is room", () => {
    expect(placed([], [{ w: 300, h: 200 }], [40, 60], seeded())).toEqual([
      [40, 60],
    ])
  })

  it("puts each where it covers nothing there is, and none of the others", () => {
    const taken: Box[] = [{ x: 0, y: 0, w: 400, h: 300 }]
    const sizes = Array.from({ length: 12 }, (_, index) => ({
      w: 200 + index * 10,
      h: 180,
    }))
    const at = placed(taken, sizes, [0, 0], seeded())
    const boxes = at.map(([x, y], index) => ({ x, y, ...sizes[index] }))
    for (const [index, box] of boxes.entries()) {
      // (each was put down rounded, so by less than a unit it may come closer)
      expect(overlaps(box, taken[0], GAP - 1)).toBe(false)
      for (const other of boxes.slice(index + 1))
        expect(overlaps(box, other, GAP - 1)).toBe(false)
    }
    // and none of them far off
    const all = boundsOf(boxes)!
    expect(all.w).toBeLessThan(3000)
  })
})

describe("pileOf", () => {
  it("has the first on top, square, and those under the fourth lie under it", () => {
    const pile = pileOf(6)
    expect(pile[0]).toEqual({ dx: 0, dy: 0, turn: 0 })
    expect(new Set(pile.slice(0, 4).map((one) => one.turn)).size).toBe(4)
    expect(pile[5]).toEqual(pile[3])
  })
})

describe("spreadOf", () => {
  it("lays a group out in rows about where it lies, none on another", () => {
    const pictures = Array.from({ length: 7 }, (_, index) => ({
      pixels: (index % 2 ? [800, 1200] : [1600, 1000]) as [number, number],
    }))
    const boxes = spreadOf(pictures, [500, -200])
    expect(boxes).toHaveLength(7)
    for (const [index, box] of boxes.entries())
      for (const other of boxes.slice(index + 1))
        expect(overlaps(box, other)).toBe(false)
    const all = boundsOf(boxes)!
    expect(all.x).toBeCloseTo(500, 0)
    expect(all.y).toBeCloseTo(-200, 0)
    // more than one row, and not much wider than tall
    expect(new Set(boxes.map((box) => box.y)).size).toBeGreaterThan(1)
    expect(all.w / all.h).toBeLessThan(2.5)
  })

  it("keeps each picture's shape", () => {
    const [box] = spreadOf([{ pixels: [2000, 1000] }], [0, 0])
    expect(box.w / box.h).toBeCloseTo(2)
  })
})

describe("pushedAside", () => {
  const clear: Box = { x: 0, y: 0, w: 400, h: 300 }

  it("moves out of the way only what is in it, straight out, until it is clear", () => {
    const moved = pushedAside(
      [
        { id: "right", box: { x: 250, y: 0, w: 200, h: 100 } },
        { id: "below", box: { x: 0, y: 200, w: 100, h: 100 } },
        { id: "far", box: { x: 2000, y: 0, w: 100, h: 100 } },
      ],
      clear,
      20
    )
    expect([...moved.keys()]).toEqual(["right", "below"])
    const [rx, ry] = moved.get("right")!
    expect(ry).toBeCloseTo(0)
    expect(250 + rx).toBeCloseTo(200 + 100 + 20)
    const [bx, by] = moved.get("below")!
    expect(bx).toBeCloseTo(0)
    expect(200 + by).toBeCloseTo(150 + 50 + 20)
  })

  it("sends what lies right on the middle out each its own way", () => {
    const moved = pushedAside(
      [
        { id: "a", box: { x: 0, y: 0, w: 100, h: 100 } },
        { id: "b", box: { x: 0, y: 0, w: 100, h: 100 } },
      ],
      clear,
      10
    )
    const [a, b] = [moved.get("a")!, moved.get("b")!]
    expect(a).not.toEqual(b)
    for (const [index, [dx, dy]] of [a, b].entries())
      expect(
        overlaps({ x: dx, y: dy, w: 100, h: 100 }, clear, 9),
        `the ${index ? "second" : "first"}`
      ).toBe(false)
  })
})

describe("takenIn", () => {
  const items = [
    { id: "in", box: { x: 0, y: 0, w: 100, h: 100 } },
    { id: "edge", box: { x: 140, y: 0, w: 100, h: 100 } },
    { id: "out", box: { x: 600, y: 0, w: 100, h: 100 } },
  ]
  const drawn = { x: 20, y: 0, w: 260, h: 200 }

  it("takes what is wholly within it, or drawn the other way what it touches", () => {
    expect(takenIn(drawn, items, false)).toEqual(["in"])
    expect(takenIn(drawn, items, true)).toEqual(["in", "edge"])
  })
})

describe("the camera", () => {
  const view = { width: 1000, height: 800 }
  const edges = { top: 0, right: 0, bottom: 0, left: 0 }

  it("shows the whole of a box, filling so much of the view, and comes no nearer than asked", () => {
    expect(fitting({ x: 50, y: 60, w: 500, h: 200 }, view, edges, 0.8)).toEqual(
      { x: 50, y: 60, zoom: 1 }
    )
    expect(
      fitting({ x: 0, y: 0, w: 4000, h: 1000 }, view, edges, 0.8).zoom
    ).toBeCloseTo(0.2)
  })

  it("puts the box in the middle of what the edges leave of the view", () => {
    const camera = fitting(
      { x: 0, y: 0, w: 100, h: 100 },
      view,
      { top: 100, right: 0, bottom: 0, left: 0 },
      0.5
    )
    // the middle of the box is halfway down what is left: 450 px from the top
    const [, y] = onBoard(camera, view, 500, 450)
    expect(y).toBeCloseTo(0)
  })

  it("zooms on the place under the pointer, which stays there", () => {
    const camera = { x: 10, y: 20, zoom: 1 }
    const near = zoomedOn(camera, view, 2, 800, 100)
    expect(near.zoom).toBe(2)
    expect(onBoard(near, view, 800, 100)).toEqual(
      onBoard(camera, view, 800, 100)
    )
  })
})
