import * as THREE from "three"
import { MeshBVH } from "three-mesh-bvh"
import { describe, expect, it } from "vitest"

import {
  reaches,
  sidesOf,
  spills,
  takenIn,
  type Box,
  type Shape,
} from "./within"

/** A camera 10 back from the middle of the scene, looking at it. */
function lens() {
  const made = new THREE.PerspectiveCamera(30, 800 / 600, 0.1, 100)
  made.position.set(0, 0, 10)
  made.lookAt(0, 0, 0)
  made.updateMatrixWorld()
  made.updateProjectionMatrix()
  return made
}
/** The same from the same place with no lens: 8 of the scene's units across, 6 up. */
function flat() {
  const made = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100)
  made.position.set(0, 0, 10)
  made.lookAt(0, 0, 0)
  made.updateMatrixWorld()
  made.updateProjectionMatrix()
  return made
}

/** A cube two units a side, its middle at `at`: with a lens, it is under a third of the view across. */
function cube(at: [number, number, number] = [0, 0, 0]): Shape {
  const geometry = new THREE.BoxGeometry(2, 2, 2)
  geometry.boundsTree = new MeshBVH(geometry)
  return { geometry, matrixWorld: new THREE.Matrix4().makeTranslation(...at) }
}

const box = (
  left: number,
  right: number,
  bottom: number,
  top: number
): Box => ({
  left,
  right,
  bottom,
  top,
})
const AROUND = box(-0.5, 0.5, -0.6, 0.6)
const LEFT_HALF = box(-0.5, 0, -0.6, 0.6)
const BESIDE = box(0.6, 0.9, -0.6, 0.6)

describe("reaches", () => {
  it("is so of what a box is drawn around, and of what it only crosses", () => {
    const sides = sidesOf(lens(), AROUND)
    expect(reaches(cube(), sides, null)).toBe(true)
    expect(reaches(cube(), sidesOf(lens(), LEFT_HALF), null)).toBe(true)
  })

  it("is not so of what is beside the box", () => {
    expect(reaches(cube(), sidesOf(lens(), BESIDE), null)).toBe(false)
    expect(reaches(cube([5, 0, 0]), sidesOf(lens(), AROUND), null)).toBe(false)
  })

  it("is so of a face the box is drawn in the middle of, with no corner of it inside", () => {
    const small = sidesOf(lens(), box(-0.05, 0.05, -0.05, 0.05))
    expect(reaches(cube(), small, null)).toBe(true)
  })

  it("is so of an edge a thin box lies across", () => {
    // across the cube's right-hand side, which is at about 0.31
    const thin = sidesOf(lens(), box(0.2, 0.45, -0.02, 0.02))
    expect(reaches(cube(), thin, null)).toBe(true)
  })

  it("goes by where a part is, not where it was made", () => {
    const moved = cube([3, 0, 0])
    expect(reaches(moved, sidesOf(lens(), AROUND), null)).toBe(false)
    // three to the right of the middle is most of the way to the edge of the view
    expect(reaches(moved, sidesOf(lens(), box(0.5, 1, -0.6, 0.6)), null)).toBe(
      true
    )
  })

  it("is not so of what is behind the eye", () => {
    expect(reaches(cube([0, 0, 20]), sidesOf(lens(), AROUND), null)).toBe(false)
  })

  it("leaves out what a cut has taken away", () => {
    // the half of the scene to the right is kept
    const cut = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
    const leftOfMiddle = sidesOf(lens(), box(-0.5, -0.02, -0.6, 0.6))
    expect(reaches(cube(), leftOfMiddle, null)).toBe(true)
    expect(reaches(cube(), leftOfMiddle, cut)).toBe(false)
    expect(reaches(cube(), sidesOf(lens(), AROUND), cut)).toBe(true)
  })

  it("is the same with no lens", () => {
    // the cube is a quarter of the way across such a view, either side of the middle
    expect(
      reaches(cube(), sidesOf(flat(), box(-0.3, 0.3, -0.4, 0.4)), null)
    ).toBe(true)
    expect(
      reaches(cube(), sidesOf(flat(), box(0.3, 0.6, -0.4, 0.4)), null)
    ).toBe(false)
    expect(
      reaches(cube(), sidesOf(flat(), box(0.2, 0.6, -0.1, 0.1)), null)
    ).toBe(true)
  })
})

describe("spills", () => {
  it("is not so of what is wholly inside the box", () => {
    expect(spills(cube(), sidesOf(lens(), AROUND), null)).toBe(false)
    expect(
      spills(cube(), sidesOf(flat(), box(-0.3, 0.3, -0.4, 0.4)), null)
    ).toBe(false)
  })

  it("is so of what the box only crosses", () => {
    expect(spills(cube(), sidesOf(lens(), LEFT_HALF), null)).toBe(true)
    expect(
      spills(cube(), sidesOf(flat(), box(-0.3, 0.2, -0.4, 0.4)), null)
    ).toBe(true)
  })

  it("counts only what a cut has left", () => {
    const cut = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
    // around the half that is kept, and none of the half that is gone
    const rightHalf = sidesOf(lens(), box(-0.01, 0.5, -0.6, 0.6))
    expect(spills(cube(), rightHalf, null)).toBe(true)
    expect(spills(cube(), rightHalf, cut)).toBe(false)
  })
})

describe("takenIn", () => {
  const parts = (): [string, Shape[]][] => [
    ["middle", [cube()]],
    ["right", [cube([3, 0, 0])]],
    ["both", [cube(), cube([-3, 0, 0])]],
  ]

  it("takes every part the box touches", () => {
    const sides = sidesOf(lens(), AROUND)
    expect(takenIn(parts(), sides, null, false)).toEqual(["middle", "both"])
  })

  it("takes only the parts wholly inside it, when asked for those", () => {
    const sides = sidesOf(lens(), AROUND)
    expect(takenIn(parts(), sides, null, true)).toEqual(["middle"])
    // out past the edge of the view, to where the part on the left ends
    const wide = sidesOf(lens(), box(-1.5, 0.5, -0.6, 0.6))
    expect(takenIn(parts(), wide, null, true)).toEqual(["middle", "both"])
  })

  it("takes nothing where there is nothing", () => {
    const sides = sidesOf(lens(), box(-0.4, 0.4, 0.7, 0.9))
    expect(takenIn(parts(), sides, null, false)).toEqual([])
  })
})
