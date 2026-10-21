import * as THREE from "three"
import { describe, expect, it } from "vitest"

import {
  nearPairs,
  objectsOf,
  piecesOf,
  pieceWith,
  waysOut,
  wholeOf,
} from "./apart"

/** A part in a group, in a box from one corner to the other. */
const part = (
  group: string,
  low: [number, number, number],
  high: [number, number, number]
) => ({
  group,
  box: new THREE.Box3(new THREE.Vector3(...low), new THREE.Vector3(...high)),
})
const GROUPS = [
  { id: "case", shell: true },
  { id: "board", shell: false },
  { id: "screws", shell: false },
  { id: "parts", shell: false },
]
/** How many pieces there are, and which parts share one. */
const same = (pieces: number[], a: number, b: number) => pieces[a] === pieces[b]

describe("piecesOf", () => {
  // a board with a chip on it and a pin through it; a lid and a base that meet; two
  // screws far apart
  const model = [
    part("board", [0, 0, 0], [50, 30, 1.6]),
    part("board", [10, 10, 1.6], [15, 15, 3]),
    part("board", [40, 5, -3], [41, 6, 2]),
    part("case", [-5, -5, -5], [55, 35, 0]),
    part("case", [-5, -5, 0], [55, 35, 10]),
    part("screws", [-4, -4, 0], [-2, -2, 8]),
    part("screws", [52, 32, 0], [54, 34, 8]),
  ]

  it("keeps the parts of a group that touch one another together", () => {
    const pieces = piecesOf(model, GROUPS, 100)
    expect(same(pieces, 0, 1)).toBe(true)
    expect(same(pieces, 0, 2)).toBe(true)
  })

  it("lets the parts of a group that do not touch go their own ways", () => {
    const pieces = piecesOf(model, GROUPS, 100)
    expect(same(pieces, 5, 6)).toBe(false)
  })

  it("takes the outside apart part by part, though its parts meet", () => {
    const pieces = piecesOf(model, GROUPS, 100)
    expect(same(pieces, 3, 4)).toBe(false)
  })

  it("never puts parts of different groups together", () => {
    const pieces = piecesOf(model, GROUPS, 100)
    // the screws are in among the case and by the board
    expect(new Set(pieces).size).toBe(5)
  })

  it("follows a chain: what touches something that touches a third goes with both", () => {
    const pieces = piecesOf(
      [
        part("board", [0, 0, 0], [10, 10, 1]),
        part("board", [20, 0, 0], [30, 10, 1]),
        part("board", [10, 0, 0], [20, 10, 1]),
        part("screws", [0, 0, 5], [1, 1, 6]),
      ],
      GROUPS,
      40
    )
    expect(same(pieces, 0, 1)).toBe(true)
    expect(same(pieces, 0, 2)).toBe(true)
  })

  it("counts as touching what is drawn a hair apart, and further in a large model", () => {
    const pair = (gap: number) => [
      part("board", [0, 0, 0], [10, 10, 1]),
      part("board", [0, 0, 1 + gap], [10, 10, 2 + gap]),
      part("screws", [0, 0, 5], [1, 1, 6]),
    ]
    expect(same(piecesOf(pair(0.2), GROUPS, 20), 0, 1)).toBe(true)
    expect(same(piecesOf(pair(1), GROUPS, 20), 0, 1)).toBe(false)
    expect(same(piecesOf(pair(1), GROUPS, 1000), 0, 1)).toBe(true)
  })

  it("takes a model that is all one group, or in no group, apart part by part", () => {
    const stacked = (group: string) => [
      part(group, [0, 0, 0], [10, 10, 1]),
      part(group, [0, 0, 1], [10, 10, 2]),
    ]
    expect(piecesOf(stacked("board"), GROUPS, 20)).toEqual([0, 1])
    const mixed = [...stacked("parts"), part("board", [0, 0, 2], [10, 10, 3])]
    expect(new Set(piecesOf(mixed, GROUPS, 20)).size).toBe(3)
  })
})

describe("wholeOf", () => {
  // a board with two chips on it, a lid and a screw
  const parts = [
    { id: "lid", piece: 0 },
    { id: "board", piece: 1 },
    { id: "chip", piece: 1 },
    { id: "screw", piece: 3 },
    { id: "socket", piece: 1 },
  ]

  it("takes the rest of a piece with any part of it", () => {
    expect(wholeOf(parts, ["chip"])).toEqual(["board", "chip", "socket"])
  })

  it("takes a part that is a piece of its own alone", () => {
    expect(wholeOf(parts, ["lid"])).toEqual(["lid"])
    expect(wholeOf(parts, [])).toEqual([])
  })

  it("gives them in the model's order, each once, whatever order they were asked for in", () => {
    expect(wholeOf(parts, ["screw", "socket", "chip", "lid"])).toEqual([
      "lid",
      "board",
      "chip",
      "screw",
      "socket",
    ])
  })

  it("leaves out what is no part of the model", () => {
    expect(wholeOf(parts, ["gone", "screw"])).toEqual(["screw"])
  })
})

describe("pieceWith", () => {
  const GROUPS = [
    { id: "case", label: "Case" },
    { id: "board", label: "Main board" },
    { id: "buttons", label: "Buttons" },
  ]
  const part = (id: string, group: string, piece: number, across = 1) => ({
    id,
    label: id.replaceAll("_", " "),
    group,
    piece,
    across,
  })
  // a lid; a board with a chip and a socket on it, which is all of its group; and two
  // buttons, each a cap on a switch, which are one group between them
  const parts = [
    part("lid", "case", 0, 90),
    part("pcb", "board", 1, 60),
    part("chip", "board", 1, 8),
    part("socket", "board", 1, 12),
    part("power_cap", "buttons", 4, 9),
    part("power_switch", "buttons", 4, 14),
    part("record_cap", "buttons", 6, 20),
    part("record_switch", "buttons", 6, 14),
  ]

  it("is nothing for a part that is a piece by itself, or no part at all", () => {
    expect(pieceWith(parts, GROUPS, "lid")).toBeNull()
    expect(pieceWith(parts, GROUPS, "gone")).toBeNull()
  })

  it("goes by its group's name when it is the whole of the group", () => {
    expect(pieceWith(parts, GROUPS, "chip")).toEqual({
      label: "Main board",
      parts: ["pcb", "chip", "socket"],
    })
  })

  it("goes by its widest part, and how many more, when it is only some of the group", () => {
    expect(pieceWith(parts, GROUPS, "power_cap")).toEqual({
      label: "power switch and 1 more",
      parts: ["power_cap", "power_switch"],
    })
    expect(pieceWith(parts, GROUPS, "record_switch")?.label).toBe(
      "record cap and 1 more"
    )
  })

  it("goes by its widest part where the model does not say what its group is called", () => {
    expect(pieceWith(parts, [], "socket")?.label).toBe("pcb and 2 more")
  })

  describe("objectsOf", () => {
    it("takes the pieces that are all picked out as objects, each once", () => {
      expect(
        objectsOf(parts, GROUPS, [
          "record_switch",
          "record_cap",
          "power_switch",
          "power_cap",
        ])
      ).toEqual({
        objects: [
          {
            label: "power switch and 1 more",
            parts: ["power_cap", "power_switch"],
          },
          {
            label: "record cap and 1 more",
            parts: ["record_cap", "record_switch"],
          },
        ],
        loose: [],
      })
    })

    it("leaves the parts of a piece that is not all picked out as parts", () => {
      expect(
        objectsOf(parts, GROUPS, ["chip", "pcb", "power_cap", "power_switch"])
      ).toEqual({
        objects: [
          {
            label: "power switch and 1 more",
            parts: ["power_cap", "power_switch"],
          },
        ],
        loose: ["pcb", "chip"],
      })
    })

    it("has a part that is a piece by itself as a part", () => {
      expect(
        objectsOf(parts, GROUPS, ["lid", "pcb", "chip", "socket"])
      ).toEqual({
        objects: [{ label: "Main board", parts: ["pcb", "chip", "socket"] }],
        loose: ["lid"],
      })
    })

    it("is nothing of nothing, and takes no account of parts the model has not", () => {
      expect(objectsOf(parts, GROUPS, [])).toEqual({ objects: [], loose: [] })
      expect(objectsOf(parts, GROUPS, ["gone"])).toEqual({
        objects: [],
        loose: [],
      })
    })
  })
})

describe("waysOut", () => {
  /** A piece in a box from one corner to the other, its stuff about the middle of that. */
  const piece = (
    low: [number, number, number],
    high: [number, number, number],
    /** where its stuff is, if that is not the middle of its box */
    centre?: [number, number, number]
  ) => {
    const box = new THREE.Box3(
      new THREE.Vector3(...low),
      new THREE.Vector3(...high)
    )
    return {
      box,
      centre: centre
        ? new THREE.Vector3(...centre)
        : box.getCenter(new THREE.Vector3()),
    }
  }
  type Piece = ReturnType<typeof piece>
  const MIDDLE = new THREE.Vector3(0, 0, 0)
  /** The pieces' boxes, where they are once the model is pulled this far apart. */
  const pulled = (pieces: Piece[], ways: THREE.Vector3[], far = 1) =>
    pieces.map(({ box }, index) =>
      box.clone().translate(ways[index].clone().multiplyScalar(far))
    )
  const anyInAnother = (boxes: THREE.Box3[]) =>
    boxes.some((a, i) => boxes.some((b, j) => j > i && a.intersectsBox(b)))

  it("sends pieces that are clear of one another straight out from the middle", () => {
    const pieces = [
      piece([10, 0, 0], [20, 10, 10]),
      piece([-20, 0, 0], [-10, 10, 10]),
    ]
    const ways = waysOut(pieces, MIDDLE, 50)
    expect(ways[0].toArray()).toEqual([15, 5, 5])
    expect(ways[1].toArray()).toEqual([-15, 5, 5])
  })

  it("lifts what lies on something clear of it, and lowers what it lay on", () => {
    const base = piece([-50, -30, -10], [50, 30, 2])
    const board = piece([-40, -20, -2], [40, 20, 0])
    const pieces = [base, board]
    const ways = waysOut(pieces, MIDDLE, 120)
    // only up and down: that is the short way out
    expect(ways[1].x).toBe(0)
    expect(ways[1].y).toBe(0)
    const [low, high] = pulled(pieces, ways)
    expect(high.min.z - low.max.z).toBeCloseTo(120 * 0.03, 6)
    expect(Math.abs(ways[1].z)).toBeLessThan(Math.abs(ways[0].z))
  })

  it("takes a board up out of the shell it lies in, not down through its floor", () => {
    // the shell is a floor with walls: its stuff is low in its box, under the board,
    // though the middle of the box is over it
    const shell = piece([-50, -30, -10], [50, 30, 0], [0, 0, -8.5])
    const board = piece([-40, -20, -8], [40, 20, -6])
    const pieces = [shell, board]
    const ways = waysOut(pieces, MIDDLE, 120)
    const [under, over] = pulled(pieces, ways)
    expect(over.min.z).toBeGreaterThan(under.max.z)
  })

  it("leaves no piece in another, however many are laid one on the next", () => {
    const pieces = [
      piece([-50, -30, -10], [50, 30, 0], [0, 0, -9]),
      piece([-45, -25, -8], [45, 25, -6]),
      piece([-30, -20, -6], [30, 20, 3]),
      piece([-50, -30, 0], [50, 30, 10], [0, 0, 9]),
      // a screw down through all of them, near a corner
      piece([40, 20, -10], [43, 23, 10]),
    ]
    const ways = waysOut(pieces, MIDDLE, 125)
    expect(anyInAnother(pulled(pieces, ways))).toBe(false)
    const heights = pulled(pieces, ways)
      .slice(0, 4)
      .map((box) => box.min.z)
    expect(heights).toEqual([...heights].sort((a, b) => a - b))
  })

  it("keeps a face over the works it covers, when the works come up out of the case", () => {
    // a clock: a case, a movement low in it that lifts the case off itself, the works
    // in the middle of the case, and a face let into the top of the case over them
    const body = piece([-60, -60, -25], [60, 60, 25], [0, 0, 0.2])
    const movement = piece([-20, -20, -25], [20, 20, 19.4], [0, 0, -13.2])
    const works = piece([-40, -40, -6], [40, 40, 23], [0, 0, 0.7])
    const face = piece([-45, -45, 19.4], [45, 45, 25], [0, 0, 23.6])
    const pieces = [body, movement, works, face]
    const boxes = pulled(pieces, waysOut(pieces, MIDDLE, 204))
    expect(anyInAnother(boxes)).toBe(false)
    // the works are lifted clear of the case, which takes them up to where the face
    // has got to: and the face goes on up ahead of them
    expect(boxes[3].min.z).toBeGreaterThan(boxes[2].max.z)
  })

  it("keeps it over them when they are moved right past it, too", () => {
    // the same, with a face thin enough to be left in the room between the case and
    // the works lifted clear of it, touching neither
    const body = piece([-60, -60, -25], [60, 60, 25], [0, 0, 0.2])
    const movement = piece([-20, -20, -25], [20, 20, -5], [0, 0, -8])
    const works = piece([-40, -40, -6], [40, 40, 23], [0, 0, 0.7])
    const face = piece([-45, -45, 23], [45, 45, 25])
    const pieces = [body, movement, works, face]
    const boxes = pulled(pieces, waysOut(pieces, MIDDLE, 150))
    expect(anyInAnother(boxes)).toBe(false)
    expect(boxes[3].min.z).toBeGreaterThan(boxes[2].max.z)
  })

  it("lets a thing be moved past what is inside it, which is on no side of it", () => {
    // a block with nine tubes through it, a lid on it and a base under it: the block
    // goes off to one side of the tubes, and none of them is sent on ahead of it
    const block = piece([-20, -20, 0], [20, 20, 40])
    const tubes = [-12, 0, 12].flatMap((x) =>
      [-12, 0, 12].map((y) => piece([x - 4, y - 4, 0], [x + 4, y + 4, 40]))
    )
    const lid = piece([-20, -20, 32], [20, 20, 46], [0, 0, 40])
    const base = piece([-20, -20, -5], [20, 20, 8], [0, 0, 0])
    const pieces = [block, ...tubes, lid, base]
    const ways = waysOut(pieces, new THREE.Vector3(0, 0, 20.6), 76)
    expect(anyInAnother(pulled(pieces, ways))).toBe(false)
    for (const way of ways.slice(1, 10)) expect(way.length()).toBeLessThan(30)
  })

  it("takes a clock apart part by part, each to somewhere near, the face uppermost", () => {
    // every part of a clock by itself: a case with a face let into its top, flush with
    // it, and the works and a movement inside, one thing in another all the way in
    const clock: [string, number[], number[], number[]][] = [
      ["body", [-70, -70, -24.9], [70, 70, 25], [0, 0, 0.2]],
      ["back_cover", [-67.7, -67.7, -24.9], [67.7, 67.7, 4.1], [0, 0, -19.3]],
      ["outer_carrier", [-58.7, -58.7, -6.1], [58.7, 58.7, 23], [0, 0, -2.7]],
      ["planet_shaft_1", [-25.9, -8.9, 9.5], [-8.1, 8.9, 18.4], [-17, 0, 11.4]],
      ["planet_shaft_2", [8.1, -8.9, 9.5], [25.9, 8.9, 18.4], [17, 0, 11.4]],
      ["hour_carrier", [-39.5, -6, 12.2], [39.5, 6, 22.8], [0, 0, 14.7]],
      ["planet_gear_1", [-25.9, -8.9, 14.7], [-8.1, 8.9, 18.4], [-17, 0, 16.5]],
      ["planet_gear_2", [8.1, -8.9, 14.7], [25.9, 8.9, 18.4], [17, 0, 16.5]],
      ["minute_sun_gear", [-10, -9.9, 15.5], [10, 9.9, 18.4], [0, 0, 16.9]],
      ["hour_dot", [-10, 29.6, 21.5], [10, 44.4, 23.9], [0, 37, 22.7]],
      ["middle_ring", [-46.5, -46.5, 19.7], [46.5, 46.5, 25], [0, -0.5, 23.7]],
      ["minute_dot", [-10, 48.6, 21.7], [10, 63.4, 24.1], [0, 56, 22.8]],
      ["outer_ring", [-65, -65, 19.3], [65, 65, 25], [0, -0.8, 23.9]],
      ["seconds_dot", [-10, 9.6, 20.3], [10, 24.4, 24.1], [0, 17, 22]],
      ["seconds_disc", [-27.5, -27.5, 20.1], [27.5, 27.5, 25], [0, -0.5, 23.2]],
      ["carrier_bearings", [-13, -13, -6.1], [13, 13, 3.9], [0, 0, -1.1]],
      [
        "contact_2",
        [-26.2, -24.2, -22.7],
        [-25.5, -9.1, -9.8],
        [-26, -17.3, -15.6],
      ],
      [
        "contact_1",
        [25.2, -24.8, -20.9],
        [26, -9.1, -10.5],
        [25.8, -18.1, -15.5],
      ],
      ["seconds_pin", [-0.3, -0.2, 14], [0.3, 0.2, 19], [0, 0, 16.5]],
      ["battery", [-25.8, -25.5, -25], [25.3, -11.5, -11], [0, -18.5, -18]],
      [
        "setting_wheel",
        [11.2, -9.9, -25],
        [26.2, 5.1, -21.7],
        [18.7, -2.4, -23.5],
      ],
      [
        "movement_case",
        [-27.5, -27.5, -24.7],
        [27.5, 27.5, -8.7],
        [-0.3, -2.1, -15.5],
      ],
      ["movement_shaft", [-4, -4, -9.7], [4, 4, 19.3], [0, 0, 1.9]],
      ["movement_nut", [-6.9, -6, 4.2], [6.9, 6, 6.7], [0, 0, 5.4]],
      ["screws", [-60.5, -60.5, -24.2], [60.5, 60.5, -14.1], [0, 0, -20.2]],
    ]
    const across = 204
    const pieces = clock.map(([, low, high, centre]) =>
      piece(
        low as [number, number, number],
        high as [number, number, number],
        centre as [number, number, number]
      )
    )
    const ways = waysOut(pieces, MIDDLE, across)
    const boxes = pulled(pieces, ways)
    expect(anyInAnother(boxes)).toBe(false)
    for (const way of ways) expect(way.length()).toBeLessThan(across)
    const at = (name: string) => boxes[clock.findIndex(([id]) => id === name)]
    for (const ring of ["outer_ring", "middle_ring", "seconds_disc"])
      for (const under of ["body", "outer_carrier", "hour_carrier"])
        expect(at(ring).min.z).toBeGreaterThan(at(under).max.z)
  })

  it("moves a piece out sideways where that is the short way", () => {
    // a cap on the end of a long body, and a button that comes through it
    const body = piece([-50, -10, -10], [50, 10, 10])
    const cap = piece([50, -12, -12], [54, 12, 12])
    const button = piece([46, -2, -2], [56, 2, 2])
    const pieces = [body, cap, button]
    const ways = waysOut(pieces, MIDDLE, 110)
    expect(anyInAnother(pulled(pieces, ways))).toBe(false)
    expect(ways[1].z).toBe(0)
    expect(ways[2].z).toBe(0)
  })

  it("only parts them further when the model is pulled further apart", () => {
    const pieces = [
      piece([-50, -30, -10], [50, 30, 2], [0, 0, -8]),
      piece([-40, -20, -2], [40, 20, 0]),
      piece([-10, -10, -1], [10, 10, 6]),
    ]
    const ways = waysOut(pieces, MIDDLE, 120)
    for (const far of [1, 1.5, 2.5, 4])
      expect(anyInAnother(pulled(pieces, ways, far))).toBe(false)
  })
})

describe("nearPairs", () => {
  /** Every two boxes clear of one another along no more than one axis, gone through one by one. */
  const everyTwo = (boxes: THREE.Box3[]) => {
    const pairs: number[] = []
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const clear = (["x", "y", "z"] as const).filter(
          (axis) =>
            boxes[a].max[axis] < boxes[b].min[axis] ||
            boxes[b].max[axis] < boxes[a].min[axis]
        )
        if (clear.length <= 1) pairs.push(a, b)
      }
    return pairs
  }

  it("finds the same two boxes as going through every two, in the same order", () => {
    let seed = 11
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    // (on a coarse grid, so that many only touch, and some are one inside another)
    const at = () => Math.round(random() * 40)
    for (let round = 0; round < 40; round++) {
      const boxes = Array.from({ length: 5 + round * 3 }, () => {
        const low = new THREE.Vector3(at(), at(), at())
        const size = new THREE.Vector3(at(), at(), at()).multiplyScalar(0.3)
        return new THREE.Box3(low, low.clone().add(size))
      })
      // and a box round nothing, which is clear of everything
      boxes.splice(round % boxes.length, 0, new THREE.Box3())
      expect(nearPairs(boxes)).toEqual(everyTwo(boxes))
    }
  })

  it("leaves out boxes far apart", () => {
    const boxes = [0, 100, 200].map(
      (x) =>
        new THREE.Box3(
          new THREE.Vector3(x, x, 0),
          new THREE.Vector3(x + 1, x + 1, 1)
        )
    )
    expect(nearPairs(boxes)).toEqual([])
  })
})
