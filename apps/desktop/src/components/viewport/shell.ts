// What a part's surfaces come to as a whole: whether they close a volume, and which way
// is into it. A cut through a part that is closed leaves a face that can be filled in;
// through one that is not, there is no telling its inside from its outside.

import { weld } from "./contours"

type Mesh = { position: ArrayLike<number>; index: ArrayLike<number> }

/**
 * Whether the triangles of a part's meshes, taken together, close a volume: every line
 * between two points is the side of two triangles, or of four, and never of one alone.
 * And for each mesh, which way each of its points moves when the part is drawn in a
 * little: into the part, by the faces that meet there (x y z a point, one long).
 */
export function shellOf(meshes: Mesh[]): {
  closed: boolean
  inward: Float32Array[]
} {
  const { ids, count } = weld(meshes.map((mesh) => mesh.position))
  // The way out of the part at each point: the ways its faces face there, each counting
  // for as much of the turn about the point as it takes up. Counted so, it does not
  // matter how a face happens to be cut into triangles.
  const out = new Float64Array(count * 3)
  const sides = new Map<number, number>()
  let triangles = 0

  meshes.forEach(({ position, index }, m) => {
    for (let t = 0; t + 2 < index.length; t += 3) {
      const corners = [index[t], index[t + 1], index[t + 2]]
      const points = corners.map((corner) => ids[m][corner])
      const at = corners.map((corner) =>
        [0, 1, 2].map((axis) => position[corner * 3 + axis])
      )
      const to = (from: number, end: number) =>
        [0, 1, 2].map((axis) => at[end][axis] - at[from][axis])
      const [u, v] = [to(0, 1), to(0, 2)]
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ]
      const area = Math.hypot(...normal)
      if (area === 0 || new Set(points).size < 3) continue
      triangles++
      for (let corner = 0; corner < 3; corner++) {
        const [p, q] = [
          to(corner, (corner + 1) % 3),
          to(corner, (corner + 2) % 3),
        ]
        const cos =
          (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) /
          (Math.hypot(...p) * Math.hypot(...q))
        const turn = Math.acos(Math.min(1, Math.max(-1, cos)))
        for (let axis = 0; axis < 3; axis++)
          out[points[corner] * 3 + axis] += (normal[axis] / area) * turn
      }
      for (let side = 0; side < 3; side++) {
        const [low, high] = [points[side], points[(side + 1) % 3]].sort(
          (a, b) => a - b
        )
        const line = low * count + high
        sides.set(line, (sides.get(line) ?? 0) + 1)
      }
    }
  })

  let closed = triangles > 0
  for (const uses of sides.values()) if (uses % 2 === 1) closed = false

  const inward = meshes.map(({ position }, m) => {
    const ways = new Float32Array(position.length)
    for (let i = 0; i < position.length / 3; i++) {
      const point = ids[m][i] * 3
      const length = Math.hypot(out[point], out[point + 1], out[point + 2])
      if (length === 0) continue
      for (let axis = 0; axis < 3; axis++)
        ways[i * 3 + axis] = -out[point + axis] / length
    }
    return ways
  })
  return { closed, inward }
}
