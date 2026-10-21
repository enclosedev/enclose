import { describe, expect, it } from "vitest"

import { contoursOf, weld } from "./contours"

const always = () => true

/** Two triangles sharing the line from (0,0,0) to (0,1,0), the second lifted by `rise`. */
const hinge = (rise: number) => ({
  position: [0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, rise],
  index: [0, 1, 2, 3, 5, 4],
})

/** The side of a prism of `sides` sides standing on the ground, two triangles a side. */
function prism(sides: number) {
  const position: number[] = []
  const index: number[] = []
  const at = (i: number, z: number) => [
    Math.cos((i / sides) * 2 * Math.PI),
    Math.sin((i / sides) * 2 * Math.PI),
    z,
  ]
  for (let i = 0; i < sides; i++) {
    const base = position.length / 3
    // each side has corners of its own, as a mesh with a normal to each corner has
    position.push(...at(i, 0), ...at(i + 1, 0), ...at(i + 1, 1), ...at(i, 1))
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return { position, index }
}

describe("contoursOf", () => {
  it("keeps the line where two triangles of a bending surface meet", () => {
    const { position, index } = hinge(0.2)
    const { ends, ways } = contoursOf(position, index, always)
    expect(ends).toHaveLength(6)
    expect(ways).toHaveLength(6)
    expect([ends.slice(0, 3), ends.slice(3)].sort()).toEqual([
      [0, 0, 0],
      [0, 1, 0],
    ])
    const dot = ways[0] * ways[3] + ways[1] * ways[4] + ways[2] * ways[5]
    expect(dot).toBeGreaterThan(0.9)
    expect(dot).toBeLessThan(1)
  })

  it("keeps none where they lie in one plane", () => {
    const { position, index } = hinge(0)
    expect(contoursOf(position, index, always).ends).toEqual([])
  })

  it("keeps none where the two are not of one surface", () => {
    const { position, index } = hinge(0.2)
    expect(contoursOf(position, index, () => false).ends).toEqual([])
  })

  it("finds the lines up the side of a cylinder, and not the ones across its sides", () => {
    const { position, index } = prism(24)
    const { ends } = contoursOf(position, index, always)
    expect(ends).toHaveLength(24 * 6)
    for (let line = 0; line < 24; line++) {
      const [x1, y1, z1, x2, y2, z2] = ends.slice(line * 6, line * 6 + 6)
      expect([x1, y1]).toEqual([x2, y2])
      expect(Math.abs(z2 - z1)).toBe(1)
    }
  })

  it("tells what it is asked of which two triangles, and how they are turned", () => {
    const { position, index } = hinge(1)
    const asked: number[][] = []
    contoursOf(position, index, (a, b, cos) => {
      asked.push([a, b, Math.round(cos * 1000) / 1000])
      return true
    })
    expect(asked).toEqual([[1, 0, 0.707]])
  })
})

describe("weld", () => {
  /** Welding as it was done by words: every point by where it is, to the grain. */
  function byWords(lists: number[][]) {
    const known = new Map<string, number>()
    const ids = lists.map((position) =>
      Array.from({ length: position.length / 3 }, (_, i) => {
        const key = [0, 1, 2]
          .map((axis) => Math.round(position[i * 3 + axis] / 1e-4))
          .join()
        let id = known.get(key)
        if (id === undefined) known.set(key, (id = known.size))
        return id
      })
    )
    return { ids, count: known.size }
  }

  it("numbers points as welding them by words did", () => {
    // a few points written many times, a hair apart, across several lists
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const points = Array.from({ length: 50 }, () =>
      [0, 1, 2].map(() => (random() - 0.5) * 400)
    )
    const lists = Array.from({ length: 4 }, () =>
      Array.from(
        { length: 300 },
        () => points[Math.floor(random() * 50)]
      ).flatMap((point) =>
        point.map((value) => value + (random() - 0.5) * 1e-5)
      )
    )
    const { ids, count } = weld(lists)
    const words = byWords(lists)
    expect(count).toBe(words.count)
    expect(ids.map((list) => [...list])).toEqual(words.ids)
  })

  it("tells apart two points that come to the same number", () => {
    // (1, 0, 0) and (0, y, 0) in grains, with y picked for the two to come out alike
    const mod = 2n ** 32n
    const inverse = (n: bigint) => {
      let [a, b, x, y] = [n, mod, 1n, 0n]
      while (b) {
        const q = a / b
        ;[a, b, x, y] = [b, a - q * b, y, x - q * y]
      }
      return ((x % mod) + mod) % mod
    }
    const y = Number((0x9e3779b1n * inverse(0x85ebca77n)) % mod)
    const grain = 1e-4
    const { ids, count } = weld([[grain, 0, 0, 0, y * grain, 0, grain, 0, 0]])
    expect(count).toBe(2)
    expect([...ids[0]]).toEqual([0, 1, 0])
  })
})
