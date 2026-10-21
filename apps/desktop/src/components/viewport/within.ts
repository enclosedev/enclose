// Which parts a box drawn across the view takes in.
//
// The box is flat on the screen, and what it takes in goes back from it through the
// whole of the model: a part deep inside another is taken as readily as one in front.
// So a box is four planes, the sides of what is seen through it, and a part is measured
// against them triangle by triangle. That goes by way of the tree a click's triangle is
// found with, so most of a part is settled by a box around it and never looked at.
import * as THREE from "three"
import {
  CONTAINED,
  INTERSECTED,
  NOT_INTERSECTED,
  type MeshBVH,
} from "three-mesh-bvh"

/** A box on the screen, in the view's own measure: from -1 to 1 across it, and up it. */
export type Box = { left: number; right: number; bottom: number; top: number }

/** Something drawn: its triangles, and where they are in the world. A mesh is one. */
export type Shape = {
  geometry: THREE.BufferGeometry
  matrixWorld: THREE.Matrix4
}

/** The least a box is taken to measure, either way: one drawn as a line still has sides. */
const LEAST = 1e-6
/** How far past a side, in mm, is still on it: what rounding comes to, and no more. */
const ON = 1e-6

/**
 * The sides of what is seen through a box on the screen: four planes in the world's
 * frame, each facing into it. They are the same whether or not the camera has a lens,
 * and with one they meet at the eye, so nothing behind it is between them.
 */
export function sidesOf(camera: THREE.Camera, box: Box): THREE.Plane[] {
  const across = Math.max(box.right - box.left, LEAST)
  const up = Math.max(box.top - box.bottom, LEAST)
  // the view, with the box made the whole of it
  const filled = new THREE.Matrix4()
    .set(
      2 / across,
      0,
      0,
      -(box.left + box.right) / across,
      0,
      2 / up,
      0,
      -(box.bottom + box.top) / up,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    )
    .multiply(camera.projectionMatrix)
    .multiply(camera.matrixWorldInverse)
  // the first four are the sides: the other two are how near and how far it is drawn
  return new THREE.Frustum()
    .setFromProjectionMatrix(filled)
    .planes.slice(0, 4)
    .map((plane) => plane.clone())
}

/** Planes of the world's, as a shape's own triangles meet them. */
function inFrameOf(shape: Shape, planes: THREE.Plane[]) {
  const toShape = shape.matrixWorld.clone().invert()
  return planes.map((plane) => plane.clone().applyMatrix4(toShape))
}

/** How far the corner of a box that is furthest the way a plane faces is from it. */
const furthest = (box: THREE.Box3, { normal, constant }: THREE.Plane) =>
  normal.x * (normal.x >= 0 ? box.max.x : box.min.x) +
  normal.y * (normal.y >= 0 ? box.max.y : box.min.y) +
  normal.z * (normal.z >= 0 ? box.max.z : box.min.z) +
  constant
/** And the corner that is least far that way. */
const nearest = (box: THREE.Box3, { normal, constant }: THREE.Plane) =>
  normal.x * (normal.x >= 0 ? box.min.x : box.max.x) +
  normal.y * (normal.y >= 0 ? box.min.y : box.max.y) +
  normal.z * (normal.z >= 0 ? box.min.z : box.max.z) +
  constant

const corners = (triangle: {
  a: THREE.Vector3
  b: THREE.Vector3
  c: THREE.Vector3
}) => [
  triangle.a.x,
  triangle.a.y,
  triangle.a.z,
  triangle.b.x,
  triangle.b.y,
  triangle.b.z,
  triangle.c.x,
  triangle.c.y,
  triangle.c.z,
]

/**
 * What is left of a flat shape on the side of a plane that the plane faces. The shape is
 * its corners in order, x y z each; so is what comes back, which has none if nothing is
 * left.
 */
function kept(shape: number[], { normal, constant }: THREE.Plane): number[] {
  const left: number[] = []
  const count = shape.length / 3
  for (let i = 0; i < count; i++) {
    const a = i * 3
    const b = ((i + 1) % count) * 3
    const fromA =
      normal.x * shape[a] +
      normal.y * shape[a + 1] +
      normal.z * shape[a + 2] +
      constant
    const fromB =
      normal.x * shape[b] +
      normal.y * shape[b + 1] +
      normal.z * shape[b + 2] +
      constant
    if (fromA >= 0) left.push(shape[a], shape[a + 1], shape[a + 2])
    if (fromA >= 0 !== fromB >= 0) {
      const along = fromA / (fromA - fromB)
      left.push(
        shape[a] + (shape[b] - shape[a]) * along,
        shape[a + 1] + (shape[b + 1] - shape[a + 1]) * along,
        shape[a + 2] + (shape[b + 2] - shape[a + 2]) * along
      )
    }
  }
  return left
}

/**
 * Whether any of a shape shows within a box: some of it is between all four sides, and,
 * where the model is cut open, on the side of the cut that is kept.
 */
export function reaches(
  shape: Shape,
  sides: THREE.Plane[],
  cut: THREE.Plane | null
): boolean {
  const tree = shape.geometry.boundsTree as MeshBVH | undefined
  if (!tree) return false
  const planes = inFrameOf(shape, cut ? [...sides, cut] : sides)
  return tree.shapecast({
    intersectsBounds: (box) =>
      planes.some((plane) => furthest(box, plane) < 0)
        ? NOT_INTERSECTED
        : planes.every((plane) => nearest(box, plane) >= 0)
          ? CONTAINED
          : INTERSECTED,
    intersectsTriangle: (triangle, _, contained) =>
      contained || planes.reduce(kept, corners(triangle)).length > 0,
  })
}

/**
 * Whether any of what shows of a shape lies outside a box: of what the cut keeps of it,
 * where the model is cut open.
 */
export function spills(
  shape: Shape,
  sides: THREE.Plane[],
  cut: THREE.Plane | null
): boolean {
  const tree = shape.geometry.boundsTree as MeshBVH | undefined
  if (!tree) return false
  const around = inFrameOf(shape, sides)
  const [open] = cut ? inFrameOf(shape, [cut]) : [null]
  return tree.shapecast({
    // nothing here shows, or all of it is within: either way none of it spills
    intersectsBounds: (box) =>
      (open && furthest(box, open) < 0) ||
      around.every((plane) => nearest(box, plane) >= 0)
        ? NOT_INTERSECTED
        : INTERSECTED,
    intersectsTriangle: (triangle) => {
      const shown = open ? kept(corners(triangle), open) : corners(triangle)
      for (let i = 0; i < shown.length; i += 3)
        for (const { normal, constant } of around)
          if (
            normal.x * shown[i] +
              normal.y * shown[i + 1] +
              normal.z * shown[i + 2] +
              constant <
            -ON
          )
            return true
      return false
    },
  })
}

/**
 * Those of some parts that a box takes in, each part given as the shapes it is drawn
 * with. `whole` takes only the parts that show wholly within the box; without it, every
 * part that shows within the box at all is taken.
 */
export function takenIn<Part>(
  parts: Iterable<[Part, Shape[]]>,
  sides: THREE.Plane[],
  cut: THREE.Plane | null,
  whole: boolean
): Part[] {
  const taken: Part[] = []
  for (const [part, shapes] of parts) {
    if (!shapes.some((shape) => reaches(shape, sides, cut))) continue
    if (whole && shapes.some((shape) => spills(shape, sides, cut))) continue
    taken.push(part)
  }
  return taken
}
