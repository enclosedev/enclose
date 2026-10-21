import * as THREE from "three"
import { describe, expect, it } from "vitest"

import type { Vec3 } from "@shared/api"
import type { Section } from "@/lib/store"
import { cutsOf, nearestOn, passesThrough, readCuts } from "./cuts"

const cut = {
  position: [1, 2, 3],
  turn: [0, 0, 0, 1],
  flipped: true,
}

describe("readCuts", () => {
  it("reads back what was kept", () => {
    expect(readCuts(JSON.stringify({ a: cut }))).toEqual({ a: cut })
  })

  it("has none where none was kept, or where what was kept cannot be read", () => {
    expect(readCuts(null)).toEqual({})
    expect(readCuts("not json")).toEqual({})
    expect(readCuts("[1, 2]")).toEqual({})
    expect(readCuts("null")).toEqual({})
  })

  it("drops a cut that does not read as one, and keeps the rest", () => {
    const kept = {
      whole: cut,
      short: { ...cut, position: [1, 2] },
      unturned: { ...cut, turn: null },
      neither: { ...cut, flipped: "yes" },
      odd: { ...cut, position: [1, "2", 3] },
      nothing: null,
    }
    expect(readCuts(JSON.stringify(kept))).toEqual({ whole: cut })
  })

  it("keeps nothing but the cut itself", () => {
    expect(readCuts(JSON.stringify({ a: { ...cut, extra: 1 } }))).toEqual({
      a: cut,
    })
  })
})

describe("cutsOf", () => {
  const cuts = readCuts(JSON.stringify({ a: cut, b: cut }))

  it("lets go of the cut of a project that is gone", () => {
    expect(cutsOf(cuts, [{ id: "b" }, { id: "c" }])).toEqual({ b: cut })
  })

  it("is the same cuts while every project is still there", () => {
    expect(cutsOf(cuts, [{ id: "a" }, { id: "b" }])).toBe(cuts)
  })
})

describe("where a cut stands", () => {
  // across Z, 30 up, and the same tilted an eighth of a turn about X
  const level: Section = {
    position: [0, 0, 30],
    turn: [0, 0, 0, 1],
    flipped: false,
  }
  const tilt = Math.PI / 8
  const tilted: Section = {
    ...level,
    turn: [Math.sin(tilt), 0, 0, Math.cos(tilt)],
  }
  const box = (from: Vec3, to: Vec3) =>
    new THREE.Box3(new THREE.Vector3(...from), new THREE.Vector3(...to))

  it("goes through a box with some of it either side, and not one it misses", () => {
    expect(passesThrough(level, box([-5, -5, 20], [5, 5, 40]))).toBe(true)
    expect(passesThrough(level, box([-5, -5, 40], [5, 5, 60]))).toBe(false)
    expect(passesThrough(tilted, box([-5, 100, 20], [5, 110, 40]))).toBe(false)
  })

  it("has its handle where it comes nearest a point, anywhere along it", () => {
    expect(nearestOn(level, [8, -2, 50])).toEqual([8, -2, 30])
    const on = new THREE.Vector3(...nearestOn(tilted, [8, -2, 50]))
    // on the cut, and straight across it from the point
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(...tilted.turn)
    )
    expect(
      on
        .clone()
        .sub(new THREE.Vector3(0, 0, 30))
        .dot(normal)
    ).toBeCloseTo(0, 9)
    const across = new THREE.Vector3(8, -2, 50).sub(on)
    expect(across.clone().cross(normal).length()).toBeCloseTo(0, 9)
  })
})
