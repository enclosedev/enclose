// What the rest of the window - and through it, Claude - can ask of the 3D view. Each
// entry is set while a model is on screen and null otherwise.
import * as React from "react"
import * as THREE from "three"

import type { Vec3 } from "@shared/api"
import type { Axis, Sign } from "@/lib/orient"

export const bridge: {
  /** the view as it is right now, as a JPEG */
  screenshot: (() => { data: string; mimeType: string }) | null
  /** every part of the model, with its size and whether it is showing */
  parts: (() => unknown[]) | null
  /** swing the camera round to look at the model from the end of one of its axes */
  lookFrom: ((axis: Axis, sign: Sign) => void) | null
  /** orbit, as a drag of this many pixels would */
  orbit: ((dx: number, dy: number) => void) | null
  /** where the camera is from what it looks at, as a direction in the model's frame */
  eye: (() => Vec3) | null
  /** whether the view is a flat one, with no perspective */
  flat: (() => boolean) | null
  /**
   * bring the camera to what fills this box of the model, a part of it; or, with no box,
   * take it back to where it was before. `covered` is how many pixels of the view's
   * right side something lies over: the part is put in the middle of the rest
   */
  focus: ((box: THREE.Box3 | null, covered?: number) => void) | null
  /**
   * bring the camera to what fills this box of the model for this once, with `covered`
   * as above: it is not kept to it, and there is nowhere for it to be taken back to
   */
  goTo: ((box: THREE.Box3, covered?: number) => void) | null
  /**
   * where on the model a place in the window points, in the view's own frame: null
   * where it points at none of it
   */
  under: ((clientX: number, clientY: number) => THREE.Vector3 | null) | null
  /** the box that what is picked out fills, in the model's frame: null with nothing picked out */
  picked: (() => THREE.Box3 | null) | null
  /**
   * the box that what is on show of the model fills where it stands, in the model's
   * frame: null with all of it on show
   */
  shown: (() => THREE.Box3 | null) | null
  /**
   * true while a handle in the view is being dragged, or a box drawn across it: not the
   * moment to pick the part under the pointer
   */
  handling: boolean
  /**
   * The camera of a circuit board's 3D, in PCB mode, which keeps to itself otherwise:
   * what the keys turn it with. Look at the board from the end of one of its axes, or
   * go back to the view it opened with; or bring it to what fills a box of the board,
   * as `goTo` does the model's. Set while a board is on screen in 3D.
   */
  board: {
    lookFrom: (axis: Axis, sign: Sign) => void
    home: () => void
    goTo: (box: THREE.Box3, covered?: number) => void
  } | null
} = {
  screenshot: null,
  parts: null,
  lookFrom: null,
  orbit: null,
  eye: null,
  flat: null,
  focus: null,
  goTo: null,
  under: null,
  picked: null,
  shown: null,
  handling: false,
  board: null,
}

// How the camera is turned, for the small widgets drawn outside the 3D view that have to
// turn with it. It is the turn that carries a direction in the model's frame into the
// camera's: x to the right of the screen, y up it, z out of it.
let turn = new THREE.Quaternion()
const listeners = new Set<() => void>()

export function publishOrientation(next: THREE.Quaternion) {
  if (turn.equals(next)) return
  turn = next.clone()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The camera's orientation, kept current as it moves. */
export function useOrientation(): THREE.Quaternion {
  return React.useSyncExternalStore(subscribe, () => turn)
}

// lets a script drive the view when the app is being checked without a person at it
if (import.meta.env.DEV) Object.assign(window, { __bridge: bridge })
