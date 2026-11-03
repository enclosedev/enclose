// How a model comes apart when it does not say how. Pulled apart part by part, a circuit
// board sheds its components and a switch its pins, which are one object to whoever made
// the model and are in one group for that. So the parts of a group that touch one another
// go as one piece. What still comes apart part by part is the outside of the thing, which
// has to for the inside to be seen, and whatever was never put in a group of its own.
//
// A piece is one object to whoever picks things out of the model too. A click on a part
// picks out the piece it is of, and a box drawn across the view takes in the whole of
// every piece it takes in any of. (The one part is got at with Shift.)
//
// Each piece goes straight out from the middle of the model, by where it is itself. That
// alone leaves what sits inside something else still inside it: a board in the shell it
// is screwed to, one ring within another. So any two pieces left in one another are then
// moved clear, the way that takes the least moving, which for things laid one on another
// is up and down.
//
// Moving one piece clear of a second can take it into a third, or right past it. Where
// the two were plainly one after the other in the model as it was built, a face over the
// works it covers, they stay so: the third is moved on ahead, and not left behind. (One
// piece inside another is on no side of it, and either may be moved past the other.)
//
// Where a piece is, for this, is where the stuff of it is, not the middle of the box
// round it. A shell is a floor with walls: the middle of its box is in the air over the
// floor, and a board lying on the floor is under that. Going by the boxes, the board
// would be taken for the lower of the two and sent down through the floor.
import * as THREE from "three"

/** The group the exporter puts parts in that were given none (kit/enclose.py). */
const NO_GROUP = "parts"
/**
 * How near two parts have to come to count as touching, in mm: this much, or for a
 * large model this share of how far it is across. Parts that are fitted together are
 * seldom drawn quite touching.
 */
const TOUCH = { least: 0.3, share: 0.002 }

/**
 * Which piece each part is of when the model is pulled apart: a number, which the parts
 * of one piece share. `box` is where a part is in the model, and `across` how far the
 * model is from corner to corner. Parts are taken for touching when the boxes round them
 * do, which is more often than the parts themselves: where that is wrong, more of a
 * group goes together than might, and never less.
 */
export function piecesOf(
  parts: { group: string; box: THREE.Box3 }[],
  groups: { id: string; shell: boolean }[],
  across: number
): number[] {
  const piece = parts.map((_, index) => index)
  // a model all in one group has not been grouped at all
  if (new Set(parts.map((part) => part.group)).size < 2) return piece
  const loose = new Set(
    groups.filter((group) => group.shell).map((group) => group.id)
  ).add(NO_GROUP)

  const of = (index: number): number => {
    while (piece[index] !== index) {
      piece[index] = piece[piece[index]]
      index = piece[index]
    }
    return index
  }
  const reach = Math.max(TOUCH.least, across * TOUCH.share)
  const near = new THREE.Box3()
  parts.forEach((part, index) => {
    if (loose.has(part.group)) return
    near.copy(part.box).expandByScalar(reach)
    for (let other = index + 1; other < parts.length; other++)
      if (
        parts[other].group === part.group &&
        near.intersectsBox(parts[other].box)
      )
        piece[of(other)] = of(index)
  })
  return parts.map((_, index) => of(index))
}

/**
 * Some parts with the rest of the pieces they are of: what a box drawn across the view
 * picks out, having taken those in. `parts` is every part of the model with the piece it
 * is of, and what comes back is in the order the model has them.
 */
export function wholeOf<Id>(
  parts: { id: Id; piece: number }[],
  ids: Id[]
): Id[] {
  const wanted = new Set(ids)
  const pieces = new Set(
    parts.filter((part) => wanted.has(part.id)).map((part) => part.piece)
  )
  return parts.filter((part) => pieces.has(part.piece)).map((part) => part.id)
}

/**
 * The piece a part is of, for when that is what is picked out and not the part: what it
 * goes by, and its parts. Null for a part that is a piece by itself. A piece that is the
 * whole of its group goes by the group's name. One that is only some of the group has
 * no name of its own, and goes by that of the part of it that is furthest across, which
 * is what the rest sits on more often than not, and by how many more there are.
 */
export function pieceWith<Id>(
  parts: {
    id: Id
    label: string
    group: string
    piece: number
    /** how far the part is from corner to corner */
    across: number
  }[],
  groups: { id: string; label: string }[],
  id: Id
): { label: string; parts: Id[] } | null {
  const picked = parts.find((part) => part.id === id)
  if (!picked) return null
  const whole = parts.filter((part) => part.piece === picked.piece)
  if (whole.length < 2) return null
  const group = groups.find((one) => one.id === picked.group)
  const all =
    whole.length === parts.filter((part) => part.group === picked.group).length
  const widest = whole.reduce((a, b) => (b.across > a.across ? b : a))
  return {
    label:
      all && group
        ? group.label
        : `${widest.label} and ${whole.length - 1} more`,
    parts: whole.map((part) => part.id),
  }
}

/**
 * Some parts that are picked out together, as what they are to whoever picked them: the
 * whole pieces among them, each one object with what it goes by, and the parts left
 * over, which were picked out for themselves. A piece is here as an object when it is
 * of more than one part and every part of it is picked out. Both are in the order the
 * model has them.
 */
export function objectsOf<Id>(
  parts: {
    id: Id
    label: string
    group: string
    piece: number
    across: number
  }[],
  groups: { id: string; label: string }[],
  ids: Id[]
): { objects: { label: string; parts: Id[] }[]; loose: Id[] } {
  const picked = new Set(ids)
  const pieces = new Map<number, Id[]>()
  for (const part of parts) {
    const piece = pieces.get(part.piece)
    if (piece) piece.push(part.id)
    else pieces.set(part.piece, [part.id])
  }
  const objects: { label: string; parts: Id[] }[] = []
  const loose: Id[] = []
  const found = new Set<number>()
  for (const part of parts) {
    if (!picked.has(part.id)) continue
    const all = pieces.get(part.piece) ?? []
    if (all.length < 2 || !all.every((id) => picked.has(id))) {
      loose.push(part.id)
      continue
    }
    if (found.has(part.piece)) continue
    found.add(part.piece)
    const whole = pieceWith(parts, groups, part.id)
    if (whole) objects.push(whole)
  }
  return { objects, loose }
}

type Axis = "x" | "y" | "z"
const AXES: Axis[] = ["x", "y", "z"]
/**
 * How far one piece is left from another it was moved clear of, as a share of how far
 * the model is across.
 */
const CLEAR = 0.03
/**
 * Things are taken apart up and down, when that is about as good a way as another: a
 * move that way counts for this much of itself, when the least move is looked for.
 */
const UPRIGHT = 0.7
/** How many times over the pieces are gone through, at the most, for any still in one another. */
const ROUNDS = 8
/** More pieces than this are only sent straight out: every two of them cannot be gone through. */
const MOST = 1500
/**
 * The least share of the way out a model is pulled to begin with, and how much more is
 * tried each time something is still in something else there (see clearShare).
 */
const BEGUN = 0.5
const BEGUN_STEP = 0.05
/**
 * How far into one another two parts have to be, at the least, mm, to be taken to be
 * in one another there: not by how big the model is, as touching is, since a model as
 * big as a room would then have a board a few mm through a floor.
 */
const THROUGH = 0.2

/** `high` is to go this much further along an axis than `low` does. */
type Need = { low: number; high: number; by: number }

/**
 * How far each of some pieces has to move along one axis for every need to be met, with
 * the least moving: `at` is where each is along it now. Pieces that needs tie together
 * move about the one of them nearest the `middle`, which stays where it is.
 */
function settle(needs: Need[], at: number[], middle: number): number[] {
  const by = at.map(() => 0)
  const tied = at.map((_, index) => index)
  const of = (index: number): number => {
    while (tied[index] !== index) {
      tied[index] = tied[tied[index]]
      index = tied[index]
    }
    return index
  }
  for (const need of needs) tied[of(need.high)] = of(need.low)
  // Each goes as far as what it has to clear takes it, once that has been taken as far
  // as it goes itself: so each is come to after all it has to clear.
  const onto = new Map<number, Need[]>()
  const waits = at.map(() => 0)
  for (const need of needs) {
    onto.set(need.low, [...(onto.get(need.low) ?? []), need])
    waits[need.high]++
  }
  const left = new Set(at.map((_, index) => index))
  const ready = [...left].filter((index) => waits[index] === 0)
  while (left.size > 0) {
    // Needs can go round in a ring, each piece waiting on the next, since which of two
    // is to be the further is not always told the same way (see waysOut). The lowest
    // of them goes first then, clear of nothing still to come: what that leaves in
    // another is found the next time round.
    const index =
      ready.pop() ??
      [...left].reduce(
        (a, b) => (at[b] < at[a] ? b : a),
        left.values().next().value!
      )
    if (!left.delete(index)) continue
    for (const need of onto.get(index) ?? []) {
      if (!left.has(need.high)) continue
      by[need.high] = Math.max(by[need.high], by[index] + need.by)
      if (--waits[need.high] === 0) ready.push(need.high)
    }
  }
  const stays = new Map<number, number>()
  at.forEach((where, index) => {
    const lot = of(index)
    const kept = stays.get(lot)
    if (
      kept === undefined ||
      Math.abs(where + by[index] - middle) <
        Math.abs(at[kept] + by[kept] - middle)
    )
      stays.set(lot, index)
  })
  return by.map((far, index) => far - by[stays.get(of(index))!])
}

/** A piece as it stands in the model: the box round it, and where the stuff of it is. */
export type Piece = { box: THREE.Box3; centre: THREE.Vector3 }

/**
 * Every two of some boxes that are not clear of one another along more than one axis,
 * the lower numbered first, in order (a b, a b, ...): the only two that can be in one
 * another, or have one gone right past the other (see waysOut). Two that are clear along
 * two axes, or three, are nothing to each other. Found without going through every two:
 * the boxes are taken in order along an axis, and each is only set beside those that
 * begin before it ends.
 */
export function nearPairs(boxes: THREE.Box3[]): number[] {
  const found = new Set<number>()
  const n = boxes.length
  const along = (
    axis: Axis,
    also: (a: THREE.Box3, b: THREE.Box3) => boolean
  ) => {
    const order = boxes
      .map((_, index) => index)
      // (a box round nothing begins nowhere, and goes last)
      .sort((a, b) => boxes[a].min[axis] - boxes[b].min[axis] || 0)
    for (let i = 0; i < n; i++) {
      const a = boxes[order[i]]
      for (let j = i + 1; j < n; j++) {
        const b = boxes[order[j]]
        if (b.min[axis] > a.max[axis]) break
        if (!also(a, b)) continue
        const [low, high] =
          order[i] < order[j] ? [order[i], order[j]] : [order[j], order[i]]
        found.add(low * n + high)
      }
    }
  }
  const meet = (a: THREE.Box3, b: THREE.Box3, axis: Axis) =>
    !(a.max[axis] < b.min[axis] || b.max[axis] < a.min[axis])
  along("x", (a, b) => meet(a, b, "y") || meet(a, b, "z"))
  along("y", (a, b) => meet(a, b, "z"))
  return [...found]
    .sort((a, b) => a - b)
    .flatMap((pair) => [Math.floor(pair / n), pair % n])
}

/**
 * Where each piece goes when the model is pulled apart to its own distances: out from
 * the `middle` by where it is itself, and then clear of any other piece it is still in.
 * `across` is how far the model is from corner to corner. Pulled further apart than
 * that, pieces only get further from one another.
 */
export function waysOut(
  pieces: Piece[],
  middle: THREE.Vector3,
  across: number
): THREE.Vector3[] {
  const ways = pieces.map((piece) => piece.centre.clone().sub(middle))
  if (pieces.length < 2 || pieces.length > MOST) return ways
  const clear = across * CLEAR
  // Whether one piece is plainly before another along an axis, in the model as built:
  // the other reaches further along it at one end, and no less far at the other. A lid
  // let into the top of a case is over the case, though it ends where the case does;
  // works that are short of the case at both ends are inside it, and on no side of it.
  // (No less far, and further, by more than parts meant to be flush are drawn out by.)
  const plain = Math.max(TOUCH.least, across * TOUCH.share)
  const before = (a: number, b: number, axis: Axis) => {
    const low = pieces[b].box.min[axis] - pieces[a].box.min[axis]
    const high = pieces[b].box.max[axis] - pieces[a].box.max[axis]
    return low > -plain && high > -plain && (low > plain || high > plain)
  }
  for (let round = 0; round < ROUNDS; round++) {
    const moved = pieces.map((piece, index) =>
      piece.box.clone().translate(ways[index])
    )
    const centres = pieces.map((piece, index) =>
      piece.centre.clone().add(ways[index])
    )
    const needs: Record<Axis, Need[]> = { x: [], y: [], z: [] }
    let any = false
    const pairs = nearPairs(moved)
    for (let p = 0; p < pairs.length; p += 2) {
      const [a, b] = [pairs[p], pairs[p + 1]]
      if (!moved[a].intersectsBox(moved[b])) {
        // Clear of one another: but one that was moved along the only way there is
        // between them may have gone right past the other. If they were plainly one
        // after the other, it is on the wrong side now, as much as if it had stopped
        // inside it.
        const between = AXES.filter(
          (axis) =>
            moved[a].max[axis] < moved[b].min[axis] ||
            moved[b].max[axis] < moved[a].min[axis]
        )
        if (between.length !== 1) continue
        const [axis] = between
        const [low, high] = before(a, b, axis)
          ? [a, b]
          : before(b, a, axis)
            ? [b, a]
            : [null, null]
        if (low === null || moved[low].min[axis] < moved[high].max[axis])
          continue
        const by = moved[low].max[axis] - moved[high].min[axis] + clear
        needs[axis].push({ low, high, by })
        any = true
        continue
      }
      // the way that parts these two with the least moving, each staying on the side
      // of the other that it is on: the side it was built on, where that is plain,
      // and otherwise the side it is on by now
      let least: (Need & { axis: Axis; cost: number }) | null = null
      for (const axis of AXES) {
        const [low, high] = before(a, b, axis)
          ? [a, b]
          : before(b, a, axis)
            ? [b, a]
            : centres[a][axis] <= centres[b][axis]
              ? [a, b]
              : [b, a]
        const by = moved[low].max[axis] - moved[high].min[axis] + clear
        const cost = by * (axis === "z" ? UPRIGHT : 1)
        if (!least || cost < least.cost) least = { axis, low, high, by, cost }
      }
      if (!least) continue
      needs[least.axis].push(least)
      any = true
    }
    if (!any) break
    for (const axis of AXES) {
      if (needs[axis].length === 0) continue
      const by = settle(
        needs[axis],
        centres.map((centre) => centre[axis]),
        middle[axis]
      )
      ways.forEach((way, index) => {
        way[axis] += by[index]
      })
    }
  }
  return ways
}

/**
 * How far out a model is pulled to begin with, as a share of the way that has every
 * piece clear of every other (`ways`, the way out of each part's piece): the least, from
 * half of it, at which no part is in a part of another piece. Half way out the pieces
 * are already seen to be what they are, and the model is not yet all over the view; but
 * a board half way out of the shell it was in is still through the shell's floor, and
 * goes on out until it is clear of it. All the way out, nothing is in anything.
 *
 * `boxes` is where each part is in the model, and `crosses` whether two parts, each
 * moved that share of its way, are in one another: asked only of two of different
 * pieces whose boxes are further into one another than THROUGH then.
 */
export function clearShare(
  boxes: THREE.Box3[],
  pieces: number[],
  ways: THREE.Vector3[],
  crosses: (a: number, b: number, share: number) => boolean
): number {
  const moved = boxes.map((box) => box.clone())
  const by = new THREE.Vector3()
  const shared = new THREE.Box3()
  const size = new THREE.Vector3()
  const into = (a: number, b: number, share: number) => {
    if (pieces[a] === pieces[b]) return false
    shared.copy(moved[a]).intersect(moved[b])
    if (shared.isEmpty()) return false
    shared.getSize(size)
    return Math.min(size.x, size.y, size.z) > THROUGH && crosses(a, b, share)
  }
  // the two found in one another the last time are likely to be so the next
  let last: [number, number] | null = null
  const anyAt = (share: number) => {
    boxes.forEach((box, index) =>
      moved[index]
        .copy(box)
        .translate(by.copy(ways[index]).multiplyScalar(share))
    )
    const was = last
    if (was && into(was[0], was[1], share)) return true
    const pairs = nearPairs(moved)
    for (let p = 0; p < pairs.length; p += 2) {
      const [a, b] = [pairs[p], pairs[p + 1]]
      // (those two have just been asked about)
      if (was && was[0] === a && was[1] === b) continue
      if (into(a, b, share)) {
        last = [a, b]
        return true
      }
    }
    return false
  }
  for (let step = 0; ; step++) {
    const share = BEGUN + step * BEGUN_STEP
    if (share >= 1 - 1e-9) return 1
    if (!anyAt(share)) return share
  }
}

/** How many times over the parts are gone through, at the most, by unstuck. */
const UNSTUCK_ROUNDS = 8
/** How far one part is left from another it was moved clear of by unstuck, as a share of how far the model is across. */
const UNSTUCK_CLEAR = 0.005

/**
 * Where the parts of a model that says where its own parts go are pulled apart to: where
 * it says (`ways`), but for any that are still in one another there, which are moved
 * clear. A model's numbers go out of date as it changes, and a part that has grown, or
 * moved, can be left through another. Of two in one another, the one the model sends
 * further out (by the axis they part most along) is moved on along that axis, until the
 * boxes round them are clear; and with it every part that goes the same way as it, as
 * the parts of a board do. Two that go the same way are as they were in the model, and
 * are left so. All else stays where the model has it.
 *
 * `boxes` is where each part is in the model, `across` how far the model is from corner
 * to corner, and `crosses` whether two parts, each moved by the way given, are in one
 * another: asked only of two whose boxes are further into one another than THROUGH.
 */
export function unstuck(
  boxes: THREE.Box3[],
  ways: THREE.Vector3[],
  across: number,
  crosses: (a: number, b: number, at: THREE.Vector3[]) => boolean
): THREE.Vector3[] {
  const at = ways.map((way) => way.clone())
  if (boxes.length < 2 || boxes.length > MOST) return at
  const clear = across * UNSTUCK_CLEAR
  // the parts that go the same way, which go on together: each part's lot, by number
  const keys = new Map<string, number>()
  const lots: number[][] = []
  const lotOf = ways.map((way, index) => {
    const key = way
      .toArray()
      .map((n) => n.toFixed(3))
      .join(" ")
    let lot = keys.get(key)
    if (lot === undefined) {
      keys.set(key, (lot = lots.length))
      lots.push([])
    }
    lots[lot].push(index)
    return lot
  })
  // (what stays put of each lot of them tied together: the one nearest the middle of
  // the model as it says it comes apart)
  const middle = boxes
    .reduce(
      (all, box, index) => all.union(box.clone().translate(ways[index])),
      new THREE.Box3()
    )
    .getCenter(new THREE.Vector3())
  const shared = new THREE.Box3()
  const size = new THREE.Vector3()
  const apart = new THREE.Vector3()
  const centre = new THREE.Vector3()
  for (let round = 0; round < UNSTUCK_ROUNDS; round++) {
    const moved = boxes.map((box, index) => box.clone().translate(at[index]))
    const needs: Record<Axis, Need[]> = { x: [], y: [], z: [] }
    let any = false
    const pairs = nearPairs(moved)
    for (let p = 0; p < pairs.length; p += 2) {
      const [a, b] = [pairs[p], pairs[p + 1]]
      if (lotOf[a] === lotOf[b]) continue
      shared.copy(moved[a]).intersect(moved[b])
      if (shared.isEmpty()) continue
      shared.getSize(size)
      if (Math.min(size.x, size.y, size.z) <= THROUGH) continue
      if (!crosses(a, b, at)) continue
      // the axis the model parts them most along, and which it sends further along it
      apart.subVectors(ways[b], ways[a])
      const axis = AXES.reduce((best, one) =>
        Math.abs(apart[one]) > Math.abs(apart[best]) ? one : best
      )
      const [low, high] = apart[axis] < 0 ? [b, a] : [a, b]
      needs[axis].push({
        low: lotOf[low],
        high: lotOf[high],
        by: moved[low].max[axis] - moved[high].min[axis] + clear,
      })
      any = true
    }
    if (!any) break
    // Each axis by itself, every need on it at once: a part between two others, each
    // of which it has to be clear of on the other side, is not sent back and forth.
    for (const axis of AXES) {
      if (needs[axis].length === 0) continue
      const by = settle(
        needs[axis],
        lots.map((lot) => moved[lot[0]].getCenter(centre)[axis]),
        middle[axis]
      )
      lots.forEach((lot, index) => {
        if (by[index] !== 0) for (const part of lot) at[part][axis] += by[index]
      })
    }
  }
  return at
}
