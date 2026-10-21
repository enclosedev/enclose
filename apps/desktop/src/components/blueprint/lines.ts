// The lines of a model as they are seen from one side, flat: what a drawing of it shows.
//
// A part's lines are its edges, as the CAD has them, and the outline of each curved face,
// which is wherever the face turns away from the eye (see viewport/contours.ts). Of all
// of them, the ones to draw are the ones nothing is in front of. So every line is held
// against every triangle of every part that lies over it in the picture, and whatever of
// the line is behind the triangle is left out. That is worked out and not sampled: where
// a line goes behind something is where it stops, however closely the drawing is looked
// at afterwards.
//
// Nothing here fits to the last decimal. A part's edges are the CAD's own curves, and its
// surfaces are flat pieces laid along them, a little inside the curve or a little out. A
// line that lies in a surface would be hidden by it, here and there, if "behind" were
// taken at its word. So a line is behind a surface only when it is further behind than
// the two can differ by (ON). And two lines of the drawing that run along one another
// nearer than they can differ by are one line, drawn once (SAME): the far rim of a round
// hole, seen straight down it, is the near rim.
import type { Vec3 } from "@shared/api"

/**
 * A way of looking at the model, as three directions in its own frame, each one long:
 * to the right of the picture, up it, and out of it towards the eye.
 */
export type Looking = { right: Vec3; up: Vec3; back: Vec3 }

/** One part, as a drawing takes it. */
export type Body = {
  /** its surfaces, each a mesh, in the part's own frame */
  skins: { position: ArrayLike<number>; index: ArrayLike<number> }[]
  /** its edges: x1 y1 z1 x2 y2 z2 per line, in the part's own frame */
  edges: ArrayLike<number>
  /** the lines its curved faces may show their outline at (see viewport/contours.ts) */
  contours: { ends: ArrayLike<number>; ways: ArrayLike<number> }
  /** where the part is in the model: 16 numbers, column by column, as three.js keeps them */
  place: ArrayLike<number>
}

/**
 * A line of the drawing, as far as it goes without a break: x y, x y, in the model's own
 * measure, x to the right and y up. `closed` when it ends where it began.
 */
export type Stroke = { points: number[]; closed: boolean }

/**
 * How far behind a surface a line can be, in mm, and still be taken to lie in it: a
 * little more than a mesh strays from the surface it is made along.
 */
const ON = 0.1
/**
 * How steeply a line can meet a surface and still be one that runs along it: the sine
 * of the angle. Steeper, and it is going through the surface, or up to it.
 */
const ALONGSIDE = Math.sin((20 * Math.PI) / 180)
/** How far behind a surface, in mm, is behind it at all. */
const BEHIND = 1e-3
/**
 * How far outside a triangle a line that runs along its side can be, across the picture,
 * and still count as under it, in mm. And how nearly along the side it has to run: the
 * sine of the most it may be askew.
 */
const UNDER = 1e-3
const RUNS_ALONG = Math.sin((0.5 * Math.PI) / 180)
/** A stretch of a line shorter than this share of it is no stretch. */
const NO_STRETCH = 1e-9
/**
 * A triangle seen more nearly edge-on than this hides nothing: the least that how it
 * faces the eye can be, as a share of facing it squarely.
 */
const EDGE_ON = 1e-3
/**
 * How nearly edge on a triangle of a curved face is seen for it to be where the face
 * turns away, whichever way it faces: how it faces the eye, as a share of facing it
 * squarely. It is more than EDGE_ON by enough that no outline falls between the two: a
 * triangle a little short of edge on is so thin in the picture that the edge its
 * neighbours make the outline lies along the side of the next triangle, under it.
 */
const TURNING = 5e-3
/** Less of a line than this, in mm, is nothing. */
const SPECK = 2e-3
/**
 * How near two lines run to be the one line, in mm: two edges, and an outline with
 * anything, an outline being only as good as the mesh it was found on.
 */
const SAME = [0.06, 0.12]
/** And how nearly the same way they go: the sine of the most they may be askew. */
const ASKEW = Math.sin((20 * Math.PI) / 180)
/** A stroke by itself that is shorter than this, in mm, is a dot and no line. */
const DOT = 0.05
/** How near two ends of lines are, in mm, to be joined there. */
const JOINED = 2e-3
/** The finest the picture is cut up, to find what lies over a line: 2 to this, a side. */
const FINEST = 11
/** How finely it is cut up to find the lines that run along a line: this many a side. */
const ALONG = 256
/** How many triangles, or lines, are gone through before whoever waits is let in. */
const AT_A_TIME = { triangles: 1 << 16, lines: 512 }

const EDGE = 0
const OUTLINE = 1

/**
 * A part's own frame to the picture's: x across it, y up it, z out of it towards the eye.
 * Twelve numbers, four to each of the three.
 */
function frameOf(looking: Looking, place: ArrayLike<number>): number[] {
  const frame: number[] = []
  for (const way of [looking.right, looking.up, looking.back])
    for (let column = 0; column < 4; column++)
      frame.push(
        way[0] * place[column * 4] +
          way[1] * place[column * 4 + 1] +
          way[2] * place[column * 4 + 2]
      )
  return frame
}

/**
 * The picture cut into squares, to find the triangles that lie over a place in it. It is
 * cut up several times over, each twice as finely as the last, and a triangle is kept
 * where the squares are just big enough for it: in four of them at the most, however
 * the big triangles of a flat face and the small ones of a round one are mixed.
 */
type Squares = {
  /** where the picture starts, and how far across it is */
  x: number
  y: number
  side: number
  finest: number
  /** where each cutting-up starts among the squares */
  bases: number[]
  /** whether a cutting-up has anything in it */
  used: boolean[]
  /** for each square, where its triangles start in `held`: and one more, for the last */
  starts: Uint32Array
  held: Uint32Array
}

/** The squares a triangle goes in: set by `squaresOf`, and read at once. */
const into = { level: 0, i0: 0, i1: 0, j0: 0, j1: 0 }

/** Find the squares a triangle goes in. False for one that hides nothing: edge-on, or none at all. */
function squaresOf(
  faces: Float32Array,
  o: number,
  x: number,
  y: number,
  side: number,
  finest: number
): boolean {
  const x0 = faces[o]
  const y0 = faces[o + 1]
  const x1 = faces[o + 3]
  const y1 = faces[o + 4]
  const x2 = faces[o + 6]
  const y2 = faces[o + 7]
  const ux = x1 - x0
  const uy = y1 - y0
  const uz = faces[o + 5] - faces[o + 2]
  const vx = x2 - x0
  const vy = y2 - y0
  const vz = faces[o + 8] - faces[o + 2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  if (!(nz * nz > EDGE_ON * EDGE_ON * (nx * nx + ny * ny + nz * nz)))
    return false
  const lowX = Math.min(x0, x1, x2) - UNDER
  const highX = Math.max(x0, x1, x2) + UNDER
  const lowY = Math.min(y0, y1, y2) - UNDER
  const highY = Math.max(y0, y1, y2) + UNDER
  const size = Math.max(highX - lowX, highY - lowY)
  const level =
    size >= side ? 0 : Math.min(finest, Math.floor(Math.log2(side / size)))
  const n = 1 << level
  const per = n / side
  const last = n - 1
  into.level = level
  into.i0 = Math.min(last, Math.max(0, Math.floor((lowX - x) * per)))
  into.i1 = Math.min(last, Math.max(0, Math.floor((highX - x) * per)))
  into.j0 = Math.min(last, Math.max(0, Math.floor((lowY - y) * per)))
  into.j1 = Math.min(last, Math.max(0, Math.floor((highY - y) * per)))
  return true
}

function* squared(
  faces: Float32Array,
  count: number,
  x: number,
  y: number,
  side: number
): Generator<void, Squares> {
  const finest = Math.min(
    FINEST,
    Math.max(3, Math.ceil(Math.log2(Math.sqrt(count || 1))) + 1)
  )
  const bases: number[] = []
  let squares = 0
  for (let level = 0; level <= finest; level++) {
    bases.push(squares)
    squares += (1 << level) * (1 << level)
  }
  const used = bases.map(() => false)
  // counted first, so that every square's triangles lie together
  const starts = new Uint32Array(squares + 1)
  for (let t = 0; t < count; t++) {
    if ((t + 1) % AT_A_TIME.triangles === 0) yield
    if (!squaresOf(faces, t * 9, x, y, side, finest)) continue
    used[into.level] = true
    const n = 1 << into.level
    for (let j = into.j0; j <= into.j1; j++)
      for (let i = into.i0; i <= into.i1; i++)
        starts[bases[into.level] + j * n + i + 1]++
  }
  for (let square = 0; square < squares; square++)
    starts[square + 1] += starts[square]
  const held = new Uint32Array(starts[squares])
  const next = starts.slice(0, squares)
  for (let t = 0; t < count; t++) {
    if ((t + 1) % AT_A_TIME.triangles === 0) yield
    if (!squaresOf(faces, t * 9, x, y, side, finest)) continue
    const n = 1 << into.level
    for (let j = into.j0; j <= into.j1; j++)
      for (let i = into.i0; i <= into.i1; i++)
        held[next[bases[into.level] + j * n + i]++] = t
  }
  return { x, y, side, finest, bases, used, starts, held }
}

// The line being looked at, one at a time: its two ends in the picture, the box round
// it there, and the nearest a triangle has to come to the eye to be in front of any of it.
let ax = 0
let ay = 0
let az = 0
let bx = 0
let by = 0
let bz = 0
let lowX = 0
let highX = 0
let lowY = 0
let highY = 0
let nearer = 0
/** how long it is, in the model and not in the picture */
let reach = 0
/** which way it runs in the picture, as a direction one long */
let runX = 0
let runY = 0
/** What of it has been found hidden so far: from, to, as shares of its length. */
const hid: number[] = []
/** All of it is hidden: there is no more to find. */
let gone = false

/** Hold the line against one triangle, and note what of it the triangle hides. */
function against(faces: Float32Array, o: number) {
  const z0 = faces[o + 2]
  const z1 = faces[o + 5]
  const z2 = faces[o + 8]
  if ((z0 > z1 ? (z0 > z2 ? z0 : z2) : z1 > z2 ? z1 : z2) < nearer) return
  const x0 = faces[o]
  const x1 = faces[o + 3]
  const x2 = faces[o + 6]
  if (x0 < lowX && x1 < lowX && x2 < lowX) return
  if (x0 > highX && x1 > highX && x2 > highX) return
  const y0 = faces[o + 1]
  const y1 = faces[o + 4]
  const y2 = faces[o + 7]
  if (y0 < lowY && y1 < lowY && y2 < lowY) return
  if (y0 > highY && y1 > highY && y2 > highY) return

  // Where the line is under the triangle, in the picture: inside each of its three
  // sides. A line that runs along a side is under it, on the side or as good as: but
  // one that only crosses a side, or stops at it, is under the triangle up to the side
  // and no further.
  const nz = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)
  const turn = nz > 0 ? 1 : -1
  let start = 0
  let end = 1
  let ex = x1 - x0
  let ey = y1 - y0
  let side = Math.sqrt(ex * ex + ey * ey)
  let give =
    Math.abs(ex * runY - ey * runX) <= RUNS_ALONG * side ? UNDER * side : 0
  let da = turn * (ex * (ay - y0) - ey * (ax - x0)) + give
  let db = turn * (ex * (by - y0) - ey * (bx - x0)) + give
  if (da < 0) {
    if (db < 0) return
    start = da / (da - db)
  } else if (db < 0) end = da / (da - db)
  ex = x2 - x1
  ey = y2 - y1
  side = Math.sqrt(ex * ex + ey * ey)
  give = Math.abs(ex * runY - ey * runX) <= RUNS_ALONG * side ? UNDER * side : 0
  da = turn * (ex * (ay - y1) - ey * (ax - x1)) + give
  db = turn * (ex * (by - y1) - ey * (bx - x1)) + give
  if (da < 0) {
    if (db < 0) return
    start = Math.max(start, da / (da - db))
  } else if (db < 0) end = Math.min(end, da / (da - db))
  ex = x0 - x2
  ey = y0 - y2
  side = Math.sqrt(ex * ex + ey * ey)
  give = Math.abs(ex * runY - ey * runX) <= RUNS_ALONG * side ? UNDER * side : 0
  da = turn * (ex * (ay - y2) - ey * (ax - x2)) + give
  db = turn * (ex * (by - y2) - ey * (bx - x2)) + give
  if (da < 0) {
    if (db < 0) return
    start = Math.max(start, da / (da - db))
  } else if (db < 0) end = Math.min(end, da / (da - db))
  if (!(end - start > NO_STRETCH)) return

  // And where, of that, the line is behind the triangle. How far behind is measured
  // square to the triangle, since one seen nearly edge-on is a long way in front of
  // whatever lies in it, a little to one side. A line that runs along the triangle and
  // is nowhere further behind it than the two can differ by lies in it, and is not
  // hidden by it at all. Any other is hidden from where it goes behind: one that comes
  // up to a surface from behind is hidden all the way to it.
  const nx = (y1 - y0) * (z2 - z0) - (z1 - z0) * (y2 - y0)
  const ny = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0)
  const square = -turn / Math.sqrt(nx * nx + ny * ny + nz * nz)
  const ga = ((ax - x0) * nx + (ay - y0) * ny + (az - z0) * nz) * square
  const gb = ((bx - x0) * nx + (by - y0) * ny + (bz - z0) * nz) * square
  const gs = ga + start * (gb - ga)
  const ge = ga + end * (gb - ga)
  if (gs <= ON && ge <= ON && Math.abs(gb - ga) < ALONGSIDE * reach) return
  if (gs > BEHIND) {
    if (!(ge > BEHIND)) end = Math.min(end, (BEHIND - ga) / (gb - ga))
  } else if (ge > BEHIND) start = Math.max(start, (BEHIND - ga) / (gb - ga))
  else return
  if (!(end - start > NO_STRETCH)) return
  if (start <= NO_STRETCH && end >= 1 - NO_STRETCH) gone = true
  hid.push(start, end)
}

/**
 * What of the line is seen, as shares of its length: from, to, from, to, written into
 * `seen`. Returns how many numbers that is. `mark` is a number no other line has, and
 * `marks` where each triangle keeps the last it was held against, so that one in several
 * squares is held against a line once.
 */
function seenOf(
  squares: Squares,
  faces: Float32Array,
  marks: Uint32Array,
  mark: number,
  seen: number[]
): number {
  const { starts, held } = squares
  hid.length = 0
  gone = false
  lowX = Math.min(ax, bx) - UNDER
  highX = Math.max(ax, bx) + UNDER
  lowY = Math.min(ay, by) - UNDER
  highY = Math.max(ay, by) + UNDER
  nearer = Math.min(az, bz)
  reach = Math.hypot(bx - ax, by - ay, bz - az)
  const dx = bx - ax
  const dy = by - ay
  const run = Math.hypot(dx, dy)
  runX = dx / run
  runY = dy / run
  const flat = Math.abs(dx) >= Math.abs(dy)

  for (let level = 0; level <= squares.finest && !gone; level++) {
    if (!squares.used[level]) continue
    const n = 1 << level
    const per = n / squares.side
    const base = squares.bases[level]
    let i0 = Math.floor((lowX - squares.x) * per)
    let i1 = Math.floor((highX - squares.x) * per)
    let j0 = Math.floor((lowY - squares.y) * per)
    let j1 = Math.floor((highY - squares.y) * per)
    if (i1 < 0 || j1 < 0 || i0 >= n || j0 >= n) continue
    i0 = Math.max(i0, 0)
    j0 = Math.max(j0, 0)
    i1 = Math.min(i1, n - 1)
    j1 = Math.min(j1, n - 1)
    // A short line is in a square or two. A long one crosses many, and the box round
    // it many more: it is followed across, a column of squares at a time.
    const few = (i1 - i0 + 1) * (j1 - j0 + 1) <= 6
    const outer0 = few || !flat ? j0 : i0
    const outer1 = few || !flat ? j1 : i1
    for (let outer = outer0; outer <= outer1 && !gone; outer++) {
      let inner0: number
      let inner1: number
      if (few) {
        inner0 = i0
        inner1 = i1
      } else if (flat) {
        const xa = Math.max(lowX, squares.x + outer / per)
        const xb = Math.min(highX, squares.x + (outer + 1) / per)
        const ya = ay + ((xa - ax) * dy) / dx
        const yb = ay + ((xb - ax) * dy) / dx
        inner0 = Math.max(
          j0,
          Math.floor((Math.min(ya, yb) - 2 * UNDER - squares.y) * per)
        )
        inner1 = Math.min(
          j1,
          Math.floor((Math.max(ya, yb) + 2 * UNDER - squares.y) * per)
        )
      } else {
        const ya = Math.max(lowY, squares.y + outer / per)
        const yb = Math.min(highY, squares.y + (outer + 1) / per)
        const xa = ax + ((ya - ay) * dx) / dy
        const xb = ax + ((yb - ay) * dx) / dy
        inner0 = Math.max(
          i0,
          Math.floor((Math.min(xa, xb) - 2 * UNDER - squares.x) * per)
        )
        inner1 = Math.min(
          i1,
          Math.floor((Math.max(xa, xb) + 2 * UNDER - squares.x) * per)
        )
      }
      for (let inner = inner0; inner <= inner1 && !gone; inner++) {
        const square =
          base + (few || !flat ? outer * n + inner : inner * n + outer)
        for (let k = starts[square]; k < starts[square + 1]; k++) {
          const t = held[k]
          if (marks[t] === mark) continue
          marks[t] = mark
          against(faces, t * 9)
          if (gone) break
        }
      }
    }
  }

  if (gone) return 0
  if (hid.length === 0) {
    seen[0] = 0
    seen[1] = 1
    return 2
  }
  let stretches: [number, number][] = [[hid[0], hid[1]]]
  if (hid.length > 2) {
    stretches = []
    for (let k = 0; k < hid.length; k += 2) stretches.push([hid[k], hid[k + 1]])
    stretches.sort((one, other) => one[0] - other[0])
  }
  let count = 0
  let at = 0
  for (const [from, to] of stretches) {
    if (from > at) {
      seen[count++] = at
      seen[count++] = from
    }
    if (to > at) at = to
  }
  if (at < 1) {
    seen[count++] = at
    seen[count++] = 1
  }
  return count
}

/** Go over the squares of a grid that a line crosses, or comes within `pad` of. */
function across(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pad: number,
  x: number,
  y: number,
  per: number,
  n: number,
  each: (square: number) => void
) {
  const last = n - 1
  const clamp = (v: number) => Math.min(last, Math.max(0, Math.floor(v)))
  const i0 = clamp((Math.min(x1, x2) - pad - x) * per)
  const i1 = clamp((Math.max(x1, x2) + pad - x) * per)
  const j0 = clamp((Math.min(y1, y2) - pad - y) * per)
  const j1 = clamp((Math.max(y1, y2) + pad - y) * per)
  if ((i1 - i0 + 1) * (j1 - j0 + 1) <= 6) {
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) each(j * n + i)
    return
  }
  const dx = x2 - x1
  const dy = y2 - y1
  if (Math.abs(dx) >= Math.abs(dy)) {
    for (let i = i0; i <= i1; i++) {
      const xa = Math.max(Math.min(x1, x2), x + i / per - pad)
      const xb = Math.min(Math.max(x1, x2), x + (i + 1) / per + pad)
      const ya = y1 + ((xa - x1) * dy) / dx
      const yb = y1 + ((xb - x1) * dy) / dx
      const from = Math.max(j0, clamp((Math.min(ya, yb) - pad - y) * per))
      const to = Math.min(j1, clamp((Math.max(ya, yb) + pad - y) * per))
      for (let j = from; j <= to; j++) each(j * n + i)
    }
  } else {
    for (let j = j0; j <= j1; j++) {
      const ya = Math.max(Math.min(y1, y2), y + j / per - pad)
      const yb = Math.min(Math.max(y1, y2), y + (j + 1) / per + pad)
      const xa = x1 + ((ya - y1) * dx) / dy
      const xb = x1 + ((yb - y1) * dx) / dy
      const from = Math.max(i0, clamp((Math.min(xa, xb) - pad - x) * per))
      const to = Math.min(i1, clamp((Math.max(xa, xb) + pad - x) * per))
      for (let i = from; i <= to; i++) each(j * n + i)
    }
  }
}

/** The stretch of a line that is within some bounds so far, as shares of its length. */
let from = 0
let to = 1

/**
 * Narrow that stretch to where something that goes evenly from `p` at one end of the line
 * to `q` at the other is no less than `low` and no more than `high`.
 */
function within(p: number, q: number, low: number, high: number) {
  if (p < low) {
    if (q < low) from = Infinity
    else from = Math.max(from, (low - p) / (q - p))
  } else if (q < low) to = Math.min(to, (low - p) / (q - p))
  if (p > high) {
    if (q > high) from = Infinity
    else from = Math.max(from, (high - p) / (q - p))
  } else if (q > high) to = Math.min(to, (high - p) / (q - p))
}

/** The lines that are seen, as they come: in pieces, and some of them twice over. */
type Pieces = {
  /** x1 y1 x2 y2 of each */
  ends: number[]
  /** the part each is of, by its place among the parts */
  of: number[]
  /** whether each is an edge or an outline */
  kind: number[]
}

/**
 * The pieces with each line of the drawing in them once. A piece that runs along one
 * already kept, as near as makes them one line, is left out, as far as it does: all of
 * it, or the stretch of it that does.
 *
 * Which of two lines that run together is kept is a matter of which is come to first.
 * Edges are, before outlines, so that where the two run together it is the edge that is
 * drawn. And among edges, or among outlines, the longest unbroken runs are: an edge that
 * is all in sight before the bits of another that show beside it, which are often no
 * more than what is seen of a line that is really behind (the rim at the back of a
 * round hole, where the flat pieces of the surface in front fall short of the curve).
 * A run is kept or left out as one, so that two parts that share a curve do not end
 * up with alternate pieces of it each.
 */
function* once(
  pieces: Pieces,
  x: number,
  y: number,
  side: number
): Generator<void, Pieces> {
  const kept: Pieces = { ends: [], of: [], kind: [] }
  const runOf: number[] = []
  const runs: number[] = []
  for (let piece = 0; piece < pieces.of.length; piece++) {
    const o = piece * 4
    const on =
      piece > 0 &&
      pieces.of[piece] === pieces.of[piece - 1] &&
      pieces.kind[piece] === pieces.kind[piece - 1] &&
      pieces.ends[o] === pieces.ends[o - 2] &&
      pieces.ends[o + 1] === pieces.ends[o - 1]
    if (!on) runs.push(0)
    runOf.push(runs.length - 1)
    runs[runs.length - 1] += Math.hypot(
      pieces.ends[o + 2] - pieces.ends[o],
      pieces.ends[o + 3] - pieces.ends[o + 1]
    )
  }
  const order = pieces.of
    .map((_, piece) => piece)
    .sort(
      (one, other) =>
        pieces.kind[one] - pieces.kind[other] ||
        runs[runOf[other]] - runs[runOf[one]] ||
        one - other
    )
  const per = ALONG / side
  const squares: (number[] | undefined)[] = new Array(ALONG * ALONG)
  /** the last piece each kept line was held against */
  const marks: number[] = []
  const covered: [number, number][] = []
  const keep = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    piece: number
  ) => {
    const index = kept.of.length
    kept.ends.push(x1, y1, x2, y2)
    kept.of.push(pieces.of[piece])
    kept.kind.push(pieces.kind[piece])
    marks.push(-1)
    across(x1, y1, x2, y2, 0, x, y, per, ALONG, (square) => {
      const there = squares[square]
      if (there) there.push(index)
      else squares[square] = [index]
    })
  }

  for (const [turn, piece] of order.entries()) {
    if ((turn + 1) % AT_A_TIME.lines === 0) yield
    const x1 = pieces.ends[piece * 4]
    const y1 = pieces.ends[piece * 4 + 1]
    const x2 = pieces.ends[piece * 4 + 2]
    const y2 = pieces.ends[piece * 4 + 3]
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    const near = SAME[pieces.kind[piece]]
    covered.length = 0
    across(x1, y1, x2, y2, near, x, y, per, ALONG, (square) => {
      const there = squares[square]
      if (!there) return
      for (const other of there) {
        if (marks[other] === piece) continue
        marks[other] = piece
        const cx = kept.ends[other * 4]
        const cy = kept.ends[other * 4 + 1]
        const ux = kept.ends[other * 4 + 2] - cx
        const uy = kept.ends[other * 4 + 3] - cy
        const along = Math.hypot(ux, uy)
        if (Math.abs(ux * dy - uy * dx) > ASKEW * along * length) continue
        // The piece as the other line has it: how far along that line each of its
        // ends is, and how far to one side of it.
        const a = ((x1 - cx) * ux + (y1 - cy) * uy) / along
        const b = ((x2 - cx) * ux + (y2 - cy) * uy) / along
        const beside = ((y1 - cy) * ux - (x1 - cx) * uy) / along
        const then = ((y2 - cy) * ux - (x2 - cx) * uy) / along
        from = 0
        to = 1
        within(beside, then, -near, near)
        within(a, b, 0, along)
        if (to > from) covered.push([from, to])
      }
    })
    if (covered.length === 0) {
      keep(x1, y1, x2, y2, piece)
      continue
    }
    // What is left of it, between the stretches that are drawn already: but for a
    // stretch too short to be a line apart from the one it runs out of.
    covered.sort((one, other) => one[0] - other[0])
    covered.push([1, 1])
    let at = 0
    for (const [start, end] of covered) {
      if ((start - at) * length >= near)
        keep(
          // an end of the piece itself is that very point, to meet the next at
          at <= 0 ? x1 : x1 + dx * at,
          at <= 0 ? y1 : y1 + dy * at,
          start >= 1 ? x2 : x1 + dx * start,
          start >= 1 ? y2 : y1 + dy * start,
          piece
        )
      if (end > at) at = end
    }
  }
  return kept
}

/**
 * The lines of one part, joined up end to end as far as they go: on round a corner, and
 * stopping where three or more meet, or none.
 */
function joined(ends: number[]): Stroke[] {
  const count = ends.length / 4
  // Ends that are in the same place are one place. A place is a square of a grid as
  // fine as two ends can be apart and still meet, or the square next to it.
  const places = new Map<number, number>()
  const at: number[] = []
  const meeting: number[][] = []
  const placeOf = (px: number, py: number): number => {
    const i = Math.round(px / JOINED)
    const j = Math.round(py / JOINED)
    for (const [di, dj] of NEARBY) {
      const found = places.get((i + di) * 0x8000000 + (j + dj))
      if (found === undefined) continue
      if (
        (di === 0 && dj === 0) ||
        Math.hypot(at[found * 2] - px, at[found * 2 + 1] - py) <= JOINED
      )
        return found
    }
    const made = meeting.length
    places.set(i * 0x8000000 + j, made)
    at.push(px, py)
    meeting.push([])
    return made
  }
  const endAt = new Int32Array(count * 2)
  for (let line = 0; line < count; line++) {
    const from = placeOf(ends[line * 4], ends[line * 4 + 1])
    const to = placeOf(ends[line * 4 + 2], ends[line * 4 + 3])
    endAt[line * 2] = from
    endAt[line * 2 + 1] = to
    if (from === to) continue
    meeting[from].push(line)
    meeting[to].push(line)
  }

  const strokes: Stroke[] = []
  const done = new Uint8Array(count)
  /** Follow the lines on from a place, by one of them, until they stop or come back round. */
  const follow = (start: number, first: number) => {
    const through = [start]
    let place = start
    let line = first
    for (;;) {
      done[line] = 1
      place = endAt[line * 2] === place ? endAt[line * 2 + 1] : endAt[line * 2]
      through.push(place)
      if (place === start || meeting[place].length !== 2) break
      const [one, other] = meeting[place]
      line = one === line ? other : one
      if (done[line]) break
    }
    const closed = through.length > 3 && place === start
    if (closed) through.pop()
    // a point in the middle of a straight run says nothing: left out
    const points: number[] = []
    const many = through.length
    for (let k = 0; k < many; k++) {
      const x = at[through[k] * 2]
      const y = at[through[k] * 2 + 1]
      const inside = closed || (k > 0 && k < many - 1)
      if (inside) {
        const before = through[(k + many - 1) % many]
        const after = through[(k + 1) % many]
        const ux = x - at[before * 2]
        const uy = y - at[before * 2 + 1]
        const vx = at[after * 2] - x
        const vy = at[after * 2 + 1] - y
        const straight =
          Math.abs(ux * vy - uy * vx) <=
            1e-7 * Math.hypot(ux, uy) * Math.hypot(vx, vy) &&
          ux * vx + uy * vy > 0
        if (straight) continue
      }
      points.push(x, y)
    }
    if (points.length < 4) return
    // A stroke that joins nothing and is shorter than any line of a drawing is a speck
    // of one that is hidden, showing at some join of the surface in front of it: with
    // the round ends lines are drawn with, it would be a dot.
    if (!closed) {
      let length = 0
      for (let i = 2; i < points.length && length < DOT; i += 2)
        length += Math.hypot(
          points[i] - points[i - 2],
          points[i + 1] - points[i - 1]
        )
      if (length < DOT) return
    }
    strokes.push({ points, closed })
  }
  // from every place where a run of lines ends, along each run; and then the runs that
  // have no end, which go round
  for (let place = 0; place < meeting.length; place++) {
    if (meeting[place].length === 2) continue
    for (const line of meeting[place]) if (!done[line]) follow(place, line)
  }
  for (let line = 0; line < count; line++)
    if (!done[line] && endAt[line * 2] !== endAt[line * 2 + 1])
      follow(endAt[line * 2], line)
  return strokes
}

const NEARBY = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * Draw the parts as they are seen, looked at one way: for each part, in the order they
 * were given, the lines of it that show. It is done a little at a time, and gives way
 * between times (a `yield`), so that whoever has it done can see to something else, or
 * give it up; run straight through, it is done in one go.
 */
export function* drawn(
  bodies: Body[],
  looking: Looking
): Generator<void, Stroke[][]> {
  const frames = bodies.map((body) => frameOf(looking, body.place))

  let triangles = 0
  for (const body of bodies)
    for (const skin of body.skins)
      triangles += Math.floor(skin.index.length / 3)
  const faces = new Float32Array(triangles * 9)
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  let filled = 0
  for (const [index, body] of bodies.entries()) {
    const f = frames[index]
    for (const skin of body.skins) {
      const { position } = skin
      const there = new Float32Array(position.length)
      for (let i = 0; i + 2 < position.length; i += 3) {
        const x = position[i]
        const y = position[i + 1]
        const z = position[i + 2]
        const px = f[0] * x + f[1] * y + f[2] * z + f[3]
        const py = f[4] * x + f[5] * y + f[6] * z + f[7]
        there[i] = px
        there[i + 1] = py
        there[i + 2] = f[8] * x + f[9] * y + f[10] * z + f[11]
        if (px < box.x0) box.x0 = px
        if (px > box.x1) box.x1 = px
        if (py < box.y0) box.y0 = py
        if (py > box.y1) box.y1 = py
      }
      for (let i = 0; i + 2 < skin.index.length; i += 3)
        for (let corner = 0; corner < 3; corner++) {
          const from = skin.index[i + corner] * 3
          faces[filled++] = there[from]
          faces[filled++] = there[from + 1]
          faces[filled++] = there[from + 2]
        }
      yield
    }
  }

  let most = 0
  for (const body of bodies)
    most +=
      Math.floor(body.edges.length / 6) +
      Math.floor(body.contours.ends.length / 6)
  const lines = new Float64Array(most * 6)
  const lineOf = new Uint32Array(most)
  const lineKind = new Uint8Array(most)
  let count = 0
  const line = (
    f: number[],
    from: ArrayLike<number>,
    i: number,
    of: number,
    kind: number
  ) => {
    const o = count * 6
    for (let end = 0; end < 2; end++) {
      const x = from[i + end * 3]
      const y = from[i + end * 3 + 1]
      const z = from[i + end * 3 + 2]
      lines[o + end * 3] = f[0] * x + f[1] * y + f[2] * z + f[3]
      lines[o + end * 3 + 1] = f[4] * x + f[5] * y + f[6] * z + f[7]
      lines[o + end * 3 + 2] = f[8] * x + f[9] * y + f[10] * z + f[11]
    }
    // seen end on, it is a point
    if (
      Math.hypot(lines[o + 3] - lines[o], lines[o + 4] - lines[o + 1]) < SPECK
    )
      return
    for (const end of [o, o + 3]) {
      box.x0 = Math.min(box.x0, lines[end])
      box.x1 = Math.max(box.x1, lines[end])
      box.y0 = Math.min(box.y0, lines[end + 1])
      box.y1 = Math.max(box.y1, lines[end + 1])
    }
    lineOf[count] = of
    lineKind[count] = kind
    count++
  }
  for (const [index, body] of bodies.entries())
    for (let i = 0; i + 5 < body.edges.length; i += 6)
      line(frames[index], body.edges, i, index, EDGE)
  for (const [index, body] of bodies.entries()) {
    const f = frames[index]
    const { ends, ways } = body.contours
    for (let i = 0; i + 5 < ends.length; i += 6) {
      // An outline, from here, where one of the two triangles that meet at the line
      // faces the eye and the other does not. And where either is seen edge on, or as
      // good as: such a triangle is itself the outline, both its edges at once, the one
      // behind the other, and which of them its neighbours would have it be is chance.
      // Both are held up to be looked at, and the nearer is the one that shows.
      const one = f[8] * ways[i] + f[9] * ways[i + 1] + f[10] * ways[i + 2]
      const other =
        f[8] * ways[i + 3] + f[9] * ways[i + 4] + f[10] * ways[i + 5]
      if (
        one * other <= 0 ||
        Math.abs(one) < TURNING ||
        Math.abs(other) < TURNING
      )
        line(f, ends, i, index, OUTLINE)
    }
  }
  yield
  if (count === 0) return bodies.map(() => [])

  const side = Math.max(box.x1 - box.x0, box.y1 - box.y0, SPECK) * 1.001
  const squares = yield* squared(faces, triangles, box.x0, box.y0, side)

  const pieces: Pieces = { ends: [], of: [], kind: [] }
  const marks = new Uint32Array(triangles)
  const seen: number[] = []
  for (let index = 0; index < count; index++) {
    if ((index + 1) % AT_A_TIME.lines === 0) yield
    const o = index * 6
    ax = lines[o]
    ay = lines[o + 1]
    az = lines[o + 2]
    bx = lines[o + 3]
    by = lines[o + 4]
    bz = lines[o + 5]
    const many = seenOf(squares, faces, marks, index + 1, seen)
    const length = Math.hypot(bx - ax, by - ay)
    for (let k = 0; k < many; k += 2) {
      const from = seen[k]
      const to = seen[k + 1]
      if ((to - from) * length < SPECK) continue
      // an end of the line itself is that very point, to meet the next line at
      pieces.ends.push(
        from <= 0 ? ax : ax + (bx - ax) * from,
        from <= 0 ? ay : ay + (by - ay) * from,
        to >= 1 ? bx : ax + (bx - ax) * to,
        to >= 1 ? by : ay + (by - ay) * to
      )
      pieces.of.push(lineOf[index])
      pieces.kind.push(lineKind[index])
    }
  }

  const kept = yield* once(pieces, box.x0, box.y0, side)
  const mine: number[][] = bodies.map(() => [])
  for (let index = 0; index < kept.of.length; index++)
    mine[kept.of[index]].push(
      kept.ends[index * 4],
      kept.ends[index * 4 + 1],
      kept.ends[index * 4 + 2],
      kept.ends[index * 4 + 3]
    )
  const strokes: Stroke[][] = []
  for (const ends of mine) {
    strokes.push(joined(ends))
    yield
  }
  return strokes
}

/** The same, done in one go. */
export function drawnNow(bodies: Body[], looking: Looking): Stroke[][] {
  const run = drawn(bodies, looking)
  for (;;) {
    const step = run.next()
    if (step.done) return step.value
  }
}
