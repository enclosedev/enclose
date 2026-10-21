// What a drawing says of how big the model is: how wide, how high and how deep, each as
// a thin line with an arrowhead at either end and the figure over it, set a little way
// out from the model, with two lines coming out from the model to say what it is between.
//
// A side seen square on shows two of the three, across the top of the drawing and down
// its left. A corner shows all three: the width and the depth along the two edges nearest
// the eye of the face that is turned away, the floor seen from above or the top seen from
// below, and the height up the edge that stands furthest to one side.
import type { Vec3 } from "@shared/api"
import type { Unit } from "@/lib/preferences"
import type { Looking } from "./lines"
import { FIGURES, onSheet, type Dimension, type Placing } from "./sheet"

/** The room the model takes up, as two opposite corners of it, in its own measure. */
export type Room = { min: Vec3; max: Vec3 }

type Point = [x: number, y: number]

/** How tall a capital of the figures is, in mm. */
const CAPITAL = 0.727 * FIGURES

/** How far from the model the lines out from it begin, in mm on the sheet. */
const CLEAR = 1.5
/** How far out from the model a measurement's own line is. */
const OUT = 9
/** How far past that line the lines out from the model go on. */
const PAST = 1.5
/** An arrowhead: how long, and how wide across its back. */
const ARROW = { long: 2.6, wide: 0.9 }
/** How far over its line a figure stands. */
const OVER = 1.1

const MM_TO_AN_INCH = 25.4

/**
 * A length as a drawing writes it: millimetres to the tenth, without a nought that says
 * nothing; inches to the hundredth, with theirs, as inches are written.
 */
export function lengthSaid(mm: number, unit: Unit): string {
  return unit === "in"
    ? (mm / MM_TO_AN_INCH).toFixed(2)
    : String(Math.round(mm * 10) / 10)
}

/**
 * A measurement between two places on the sheet, set out from them one way: `out` is that
 * way, one long. It need not be square to the line between the two, and on a corner view
 * it is not.
 */
function measured(a: Point, b: Point, out: Point, said: string): Dimension {
  const off = (p: Point, far: number): Point => [
    p[0] + out[0] * far,
    p[1] + out[1] * far,
  ]
  const from = off(a, OUT)
  const to = off(b, OUT)
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  const along: Point = [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
  const across: Point = [-along[1], along[0]]
  // An arrowhead points out at each end, from inside. Where there is no room for the
  // two between the ends, they point in from outside, each on a little line of its own.
  const inside = length >= 3 * ARROW.long
  const way = inside ? 1 : -1
  const head = (tip: Point, back: number): number[] => {
    const base: Point = [
      tip[0] + along[0] * back * ARROW.long,
      tip[1] + along[1] * back * ARROW.long,
    ]
    const half = ARROW.wide / 2
    return [
      ...tip,
      base[0] + across[0] * half,
      base[1] + across[1] * half,
      base[0] - across[0] * half,
      base[1] - across[1] * half,
    ]
  }
  const tail = inside ? 0 : ARROW.long * 1.8
  const lines = [
    [...off(a, CLEAR), ...off(a, OUT + PAST)],
    [...off(b, CLEAR), ...off(b, OUT + PAST)],
    [
      from[0] - along[0] * tail,
      from[1] - along[1] * tail,
      to[0] + along[0] * tail,
      to[1] + along[1] * tail,
    ],
  ]

  // The figure reads along the line, left to right, or bottom to top where the line
  // stands up; and it is on the side of the line away from the model.
  const flip = along[0] < -1e-9 || (Math.abs(along[0]) <= 1e-9 && along[1] > 0)
  const read: Point = flip ? [-along[0], -along[1]] : along
  const up: Point = [read[1], -read[0]]
  const outside = up[0] * out[0] + up[1] * out[1] >= 0
  const raised = outside ? OVER : -(OVER + CAPITAL)
  return {
    lines,
    arrows: [head(from, way), head(to, -way)],
    text: {
      said,
      x: (from[0] + to[0]) / 2 + up[0] * raised,
      y: (from[1] + to[1]) / 2 + up[1] * raised,
      turn: (Math.atan2(read[1], read[0]) * 180) / Math.PI,
    },
  }
}

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * The measurements a sheet shows of the room a model takes up: its width and height, or
 * whichever two of the three a side shows; all three, from a corner.
 */
export function dimensionsOf(
  room: Room,
  looking: Looking,
  flat: boolean,
  placing: Placing,
  unit: Unit
): Dimension[] {
  const { min, max } = room
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  if (size.every((length) => !(length > 0))) return []
  const place = (p: readonly number[]): Point =>
    onSheet(dot(p, looking.right), dot(p, looking.up), placing)

  if (flat) {
    const corners = Array.from({ length: 8 }, (_, i) =>
      place([
        i & 1 ? max[0] : min[0],
        i & 2 ? max[1] : min[1],
        i & 4 ? max[2] : min[2],
      ])
    )
    const left = Math.min(...corners.map((corner) => corner[0]))
    const right = Math.max(...corners.map((corner) => corner[0]))
    const top = Math.min(...corners.map((corner) => corner[1]))
    const bottom = Math.max(...corners.map((corner) => corner[1]))
    const taken = (way: Vec3) =>
      Math.abs(way[0]) * size[0] +
      Math.abs(way[1]) * size[1] +
      Math.abs(way[2]) * size[2]
    return [
      measured(
        [left, top],
        [right, top],
        [0, -1],
        lengthSaid(taken(looking.right), unit)
      ),
      measured(
        [left, bottom],
        [left, top],
        [-1, 0],
        lengthSaid(taken(looking.up), unit)
      ),
    ]
  }

  // From a corner. The side of the model the eye is on, each way; and the face that is
  // turned away from it, up or down.
  const { back } = looking
  const near = [0, 1, 2].map((axis) => (back[axis] > 0 ? max[axis] : min[axis]))
  const far = [0, 1, 2].map((axis) => (back[axis] > 0 ? min[axis] : max[axis]))
  const towards = [0, 1, 2].map((axis) => (back[axis] > 0 ? 1 : -1))
  const lying = (way: readonly number[]): Point => {
    const x = dot(way, looking.right)
    const y = -dot(way, looking.up)
    const length = Math.hypot(x, y) || 1
    return [x / length, y / length]
  }
  return [
    measured(
      place([far[0], near[1], far[2]]),
      place([near[0], near[1], far[2]]),
      lying([0, towards[1], 0]),
      lengthSaid(size[0], unit)
    ),
    measured(
      place([near[0], near[1], far[2]]),
      place([near[0], far[1], far[2]]),
      lying([towards[0], 0, 0]),
      lengthSaid(size[1], unit)
    ),
    measured(
      place([far[0], near[1], min[2]]),
      place([far[0], near[1], max[2]]),
      lying([-towards[0], 0, 0]),
      lengthSaid(size[2], unit)
    ),
  ]
}
