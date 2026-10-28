import path from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

// the kit's own script: plain JavaScript, so imported by its path
type Point = { x: number; y: number }
type Art = {
  imageUrl: string
  width: number
  height: number
  layer: string
  points: number
}
type Kit = {
  outlinesOf: (ink: Float32Array, W: number, H: number) => Point[][]
  simplified: (ring: Point[], stray: number) => Point[]
  artOf: (
    picture: { svg: string; width: number; height: number },
    options: object
  ) => Art
}
let kit: Kit
beforeAll(async () => {
  const file = path.join(import.meta.dirname, "../../../kit/board-art.mjs")
  kit = (await import(file)) as Kit
})

/** Ink drawn by a rule, a dot at a time, with the blank row all round. */
function drawn(
  width: number,
  height: number,
  inked: (x: number, y: number) => boolean
) {
  const W = width + 2
  const H = height + 2
  const ink = new Float32Array(W * H)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      ink[(y + 1) * W + x + 1] = inked(x, y) ? 1 : 0
  return { ink, W, H, width, height }
}

const area = (ring: Point[]) =>
  Math.abs(
    ring.reduce((sum, a, i) => {
      const b = ring[(i + 1) % ring.length]
      return sum + a.x * b.y - b.x * a.y
    }, 0)
  ) / 2

// a frame: a 20-dot square with a 10-dot hole in it
const frame = (x: number, y: number) => !(x >= 5 && x < 15 && y >= 5 && y < 15)

describe("outlinesOf", () => {
  it("traces a shape's outline and its hole, each a closed ring", () => {
    const { ink, W, H } = drawn(20, 20, frame)
    const rings = kit.outlinesOf(ink, W, H)
    expect(rings).toHaveLength(2)
    const areas = rings.map(area).sort((a, b) => b - a)
    // halfway between the dots: on the edge of the dots drawn, but for a corner cut
    // off each corner, outline and hole alike, half a dot each way
    expect(areas[0]).toBeCloseTo(20 * 20 - 4 * 0.125)
    expect(areas[1]).toBeCloseTo(10 * 10 - 4 * 0.125)
  })
})

describe("simplified", () => {
  it("keeps the corners of a square traced dot by dot, and no more", () => {
    const ring: Point[] = []
    for (let i = 0; i < 10; i++) ring.push({ x: i, y: 0 })
    for (let i = 0; i < 10; i++) ring.push({ x: 10, y: i })
    for (let i = 10; i > 0; i--) ring.push({ x: i, y: 10 })
    for (let i = 10; i > 0; i--) ring.push({ x: 0, y: i })
    expect(kit.simplified(ring, 0.1)).toHaveLength(4)
  })
})

describe("artOf", () => {
  const picture = { svg: "", width: 20, height: 20 }
  const svgOf = (art: Art) =>
    decodeURIComponent(art.imageUrl.slice("data:image/svg+xml,".length))

  it("is the size asked for, in an SVG of paths in thousandths of a millimetre", () => {
    const art = kit.artOf(picture, { width: 4, ink: drawn(20, 20, frame) })
    expect(art).toMatchObject({ width: 4, height: 4, layer: "top" })
    const svg = svgOf(art)
    expect(svg).toContain('viewBox="0 0 4000 4000"')
    // straight lines only, which tscircuit takes as they are
    expect(svg).toMatch(/d="M[\d ]+(L[\d ]+)+Z/)
    expect(svg).not.toMatch(/[CQAS]/)
  })

  it("mirrors it for the underside", () => {
    // ink on the left half only
    const half = drawn(20, 20, (x) => x < 10)
    const xs = (art: Art) =>
      [...svgOf(art).matchAll(/[ML](\d+) /g)].map((m) => Number(m[1]))
    const top = xs(kit.artOf(picture, { width: 4, ink: half }))
    const under = kit.artOf(picture, { width: 4, ink: half, bottom: true })
    expect(under.layer).toBe("bottom")
    expect(Math.max(...top)).toBeLessThan(2100)
    expect(Math.min(...xs(under))).toBeGreaterThan(1900)
  })

  it("says when there is nothing to print", () => {
    expect(() =>
      kit.artOf(picture, { width: 4, ink: drawn(20, 20, () => false) })
    ).toThrow(/nothing dark/)
  })
})
