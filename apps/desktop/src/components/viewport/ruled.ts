// How a part's faces are ruled into squares, for the look that draws them so.
//
// Each face is ruled by itself, into about the same number of squares whatever its size:
// a small face is ruled finely and a large one coarsely, and the two are told apart at a
// glance. The lines are where the face is cut by flat planes, set evenly apart along
// each of the part's three axes from one end of the face to the other. On a flat face
// that is square to the axes they are a plain grid; round a hole they are rings, and
// lines down its length.
//
// A face is as many squares across as a power of two. Every other line can then be left
// out, and every other one of those, and what is left is still evenly spaced: which is
// how the lines are thinned when the face is seen small (see RULING in scene.tsx).

/** About how many squares a face is ruled into. */
const SQUARES = 64
/** The most squares a face is across, however long and thin it is. */
const MOST = 1024

/** How the faces of one mesh are ruled, as what draws them is told it. */
export type Ruled = {
  /** for each corner, how far across its face it is along each axis, in squares */
  at: Float32Array
  /** for each corner, how many squares across its face is along each axis */
  across: Uint16Array
}

/**
 * How the faces of one mesh are ruled. `faceOf` says which face each triangle is of.
 * No two faces share a corner in a mesh read from a CAD file; in one where they do, the
 * corner goes by the last of them.
 */
export function ruledOf(
  position: ArrayLike<number>,
  index: ArrayLike<number>,
  faceOf: ArrayLike<number>
): Ruled {
  const corners = position.length / 3
  const triangles = index.length / 3
  let faces = 0
  for (let t = 0; t < triangles; t++) faces = Math.max(faces, faceOf[t] + 1)

  const area = new Float64Array(faces)
  const low = new Float64Array(faces * 3).fill(Infinity)
  const high = new Float64Array(faces * 3).fill(-Infinity)
  const faceAt = new Uint32Array(corners)
  for (let t = 0; t < triangles; t++) {
    const face = faceOf[t]
    const [a, b, c] = [
      index[t * 3] * 3,
      index[t * 3 + 1] * 3,
      index[t * 3 + 2] * 3,
    ]
    for (const corner of [a, b, c]) {
      faceAt[corner / 3] = face
      for (let axis = 0; axis < 3; axis++) {
        const value = position[corner + axis]
        if (value < low[face * 3 + axis]) low[face * 3 + axis] = value
        if (value > high[face * 3 + axis]) high[face * 3 + axis] = value
      }
    }
    const [ux, uy, uz] = [0, 1, 2].map((n) => position[b + n] - position[a + n])
    const [vx, vy, vz] = [0, 1, 2].map((n) => position[c + n] - position[a + n])
    area[face] +=
      Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }

  const counts = new Uint16Array(faces * 3)
  for (let face = 0; face < faces; face++) {
    const side = Math.sqrt(area[face] / SQUARES)
    for (let axis = 0; axis < 3; axis++) {
      const span = high[face * 3 + axis] - low[face * 3 + axis]
      const squares =
        side > 0 && span > 0 ? Math.round(Math.log2(span / side)) : 0
      counts[face * 3 + axis] = Math.min(MOST, 2 ** Math.max(0, squares))
    }
  }

  const at = new Float32Array(corners * 3)
  const across = new Uint16Array(corners * 3)
  for (let corner = 0; corner < corners; corner++) {
    const face = faceAt[corner]
    for (let axis = 0; axis < 3; axis++) {
      const from = low[face * 3 + axis]
      const span = high[face * 3 + axis] - from
      const count = counts[face * 3 + axis]
      across[corner * 3 + axis] = count
      // a face with no depth along an axis is nowhere near a line across it
      at[corner * 3 + axis] =
        span > 0 ? ((position[corner * 3 + axis] - from) / span) * count : 0.5
    }
  }
  return { at, across }
}
