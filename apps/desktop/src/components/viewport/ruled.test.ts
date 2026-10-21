import { describe, expect, it } from "vitest"

import { ruledOf } from "./ruled"

/** A flat face lying in the ground, from the origin: two triangles, four corners. */
const flat = (wide: number, deep: number, from = [0, 0, 0]) =>
  [
    [0, 0],
    [wide, 0],
    [wide, deep],
    [0, deep],
  ].flatMap(([x, y]) => [from[0] + x, from[1] + y, from[2]])
const TWO = [0, 1, 2, 0, 2, 3]

describe("ruledOf", () => {
  it("rules a square face into eight squares each way", () => {
    const { at, across } = ruledOf(flat(8, 8), TWO, [0, 0])
    expect([...at]).toEqual([0, 0, 0.5, 8, 0, 0.5, 8, 8, 0.5, 0, 8, 0.5])
    expect([...across.slice(0, 3)]).toEqual([8, 8, 1])
  })

  it("rules a small face as finely as a large one coarsely", () => {
    const small = ruledOf(flat(2, 2), TWO, [0, 0])
    const large = ruledOf(flat(200, 200), TWO, [0, 0])
    expect([...small.across.slice(0, 3)]).toEqual([8, 8, 1])
    expect([...large.across.slice(0, 3)]).toEqual([8, 8, 1])
  })

  it("keeps the squares square on a long thin face", () => {
    const { across } = ruledOf(flat(32, 2), TWO, [0, 0])
    expect([...across.slice(0, 3)]).toEqual([32, 2, 1])
  })

  it("has a face a power of two across, whatever its size", () => {
    const { across } = ruledOf(flat(10, 7), TWO, [0, 0])
    expect([...across.slice(0, 3)]).toEqual([8, 8, 1])
  })

  it("is nowhere near a line across an axis the face has no depth along", () => {
    const { at } = ruledOf(flat(8, 8, [0, 0, 5]), TWO, [0, 0])
    expect([at[2], at[5], at[8], at[11]]).toEqual([0.5, 0.5, 0.5, 0.5])
  })

  it("rules each face of a mesh by itself", () => {
    const position = [...flat(16, 16), ...flat(4, 1, [20, 0, 3])]
    const index = [...TWO, ...TWO.map((corner) => corner + 4)]
    const { at, across } = ruledOf(position, index, [0, 0, 1, 1])
    expect([...across.slice(0, 3)]).toEqual([8, 8, 1])
    expect([...across.slice(12, 15)]).toEqual([16, 4, 1])
    // the small one starts from its own corner, not the mesh's
    expect([...at.slice(12, 15)]).toEqual([0, 0, 0.5])
    expect([...at.slice(18, 21)]).toEqual([16, 4, 0.5])
  })

  it("makes nothing of a mesh with nothing in it", () => {
    const { at, across } = ruledOf([], [], [])
    expect(at.length).toBe(0)
    expect(across.length).toBe(0)
  })
})
