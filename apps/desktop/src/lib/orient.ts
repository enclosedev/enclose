// The model's three axes, and the handful of turns the view tools need between them.
// Everything here is in the model's own frame: millimetres, Z up.
import * as THREE from "three"

import type { Vec3 } from "@shared/api"

export type Axis = "x" | "y" | "z"
export type Sign = 1 | -1
export type Turn = [x: number, y: number, z: number, w: number]

export const AXES: Axis[] = ["x", "y", "z"]
export const UNIT: Record<Axis, Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
}

/** The axis a direction lies most nearly along, which way, and whether it is square on. */
export function nearestAxis(direction: Vec3): {
  axis: Axis
  sign: Sign
  exact: boolean
} {
  const length = Math.hypot(...direction) || 1
  const index = [0, 1, 2].reduce((best, i) =>
    Math.abs(direction[i]) > Math.abs(direction[best]) ? i : best
  )
  const along = direction[index] / length
  // within about a degree and a half
  return {
    axis: AXES[index],
    sign: along < 0 ? -1 : 1,
    exact: Math.abs(along) > 0.9997,
  }
}

/** The turn that carries +Z to point along an axis. */
export function turnTo(axis: Axis, sign: Sign): Turn {
  const to = new THREE.Vector3(...UNIT[axis]).multiplyScalar(sign)
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    to
  )
  return [q.x, q.y, q.z, q.w]
}

/** Where +Z ends up after a turn. */
export function normalOf(turn: Turn): Vec3 {
  const v = new THREE.Vector3(0, 0, 1).applyQuaternion(
    new THREE.Quaternion(...turn)
  )
  return [v.x, v.y, v.z]
}

const TOP = { azimuth: 0, polar: 0 }

/**
 * The camera angles for looking at the model from the end of one of its axes: the angle
 * round the vertical, and the angle down from straight above, as three.js measures them
 * (its vertical is Y, so the model's Z).
 */
export function viewFrom(
  axis: Axis,
  sign: Sign
): { azimuth: number; polar: number } {
  // From above, the model's back is at the top of the view. From below it still is: the
  // model is turned over sideways, the way a thing in the hand is, not end over end.
  if (axis === "z") return sign > 0 ? TOP : { azimuth: Math.PI, polar: Math.PI }
  if (axis === "x") return { azimuth: (sign * Math.PI) / 2, polar: Math.PI / 2 }
  // the model's +Y is three.js's -Z
  return { azimuth: sign > 0 ? Math.PI : 0, polar: Math.PI / 2 }
}

/**
 * How far round under what it looks at a camera can go and still be above the ground:
 * as the angle down from straight above, so a quarter turn is level with what it looks
 * at, and half a turn straight below it. `above` is how far above the ground what it
 * looks at is, and `distance` how far from that the camera is. Looking at something
 * higher than it is far from, it can go all the way under.
 */
export function lowestPolar(above: number, distance: number): number {
  return Math.acos(Math.min(1, Math.max(-1, -above / distance)))
}

/**
 * Which way a camera faces that looks at something from round it: `azimuth` round the
 * vertical and `polar` down from straight above, as three.js measures them (its vertical
 * is Y), with the picture turned `roll` about its middle. Straight above and straight
 * below it is still a way of facing: what is to the right of the picture is known from
 * the angle round the vertical alone.
 */
export function facingFrom(
  azimuth: number,
  polar: number,
  roll = 0
): THREE.Quaternion {
  const back = new THREE.Vector3().setFromSphericalCoords(1, polar, azimuth)
  const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth))
  const up = back.clone().cross(right)
  return new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back))
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll)
    )
}

/**
 * Where what a camera looks at goes when the camera is turned about some other point,
 * from facing one way to facing another: round that point, by the same turn. So that
 * the point stays where it is in the picture, and all the rest goes round it.
 */
export function carriedRound(
  target: THREE.Vector3,
  about: THREE.Vector3,
  was: THREE.Quaternion,
  is: THREE.Quaternion
): THREE.Vector3 {
  const turn = is.clone().multiply(was.clone().invert())
  return target.clone().sub(about).applyQuaternion(turn).add(about)
}

/** `to`, shifted by whole turns to be as near `from` as it can get: the short way round. */
export function nearestTurn(from: number, to: number): number {
  const full = Math.PI * 2
  return from + ((((to - from + Math.PI) % full) + full) % full) - Math.PI
}

/**
 * The set views, in the order of their shortcuts: Cmd+2 is the first. (Cmd+1 is the view
 * a model opens with, which is not along an axis.) Front is the model's -Y side.
 */
export const VIEWS: { name: string; axis: Axis; sign: Sign }[] = [
  { name: "Front", axis: "y", sign: -1 },
  { name: "Back", axis: "y", sign: 1 },
  { name: "Top", axis: "z", sign: 1 },
  { name: "Bottom", axis: "z", sign: -1 },
  { name: "Right", axis: "x", sign: 1 },
  { name: "Left", axis: "x", sign: -1 },
]
