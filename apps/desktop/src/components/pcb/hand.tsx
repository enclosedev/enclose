// The hand a circuit board can be shown on in 3D, for how big the board is beside one:
// an open hand, palm up, as big as a man's, with the board lying in the middle of its
// palm. It reaches in from behind the board, its fingers to the front, as a board is
// held out to whoever looks at it. It is drawn as the model's reference scenes are (see viewport/reference.tsx),
// in one tone with its lines over it, and is there to be looked past.
//
// hand.glb is made from Blender Studio's Human Base Meshes, which are in the public
// domain, by kit/figure/hand.py: in metres, as glTF is, with the middle of the palm over
// the origin and the highest of it at nothing, its fingers pointing away from the front.
import * as React from "react"
import * as THREE from "three"

import { useThemeColors } from "@/lib/css-color"
import { loadSurfaces } from "@/components/viewport/load"
import { InReference } from "@/components/viewport/reference"
import { MODEL_TO_WORLD } from "@/components/viewport/rig"
import handUrl from "./hand.glb?url"

/** The hand, in the model's frame (mm, Z up): loaded once, the first time it is wanted. */
let hand: Promise<THREE.BufferGeometry> | null = null
const loadHand = () => {
  hand ??= loadSurfaces([handUrl])
  // it would not load: the next asking tries again
  hand.catch(() => (hand = null))
  return hand
}

/** The hand, once it is loaded, while it is wanted (`on`): null till then, and while not. */
export function useHand(on: boolean): THREE.BufferGeometry | null {
  const [had, setHad] = React.useState<THREE.BufferGeometry | null>(null)
  React.useEffect(() => {
    if (!on) return
    let over = false
    loadHand().then(
      (loaded) => {
        if (!over) setHad(loaded)
      },
      (error: unknown) => console.error("[hand]", error)
    )
    return () => {
      over = true
    }
  }, [on])
  return on ? had : null
}

/**
 * Where the hand goes under a board, in the model's frame: the middle of its palm under
 * the middle of the board, and the palm just under the lowest of it (what is on its
 * underside too). `board` is the box round the board, in the same frame.
 */
const palmUnder = (board: THREE.Box3) => {
  const middle = board.getCenter(new THREE.Vector3())
  return new THREE.Vector3(middle.x, middle.y, board.min.z)
}

/**
 * How the hand is turned from how hand.glb has it, which is with its fingers pointing
 * away from the front: half round, about the middle of its palm.
 */
const TURNED: [number, number, number] = [0, 0, Math.PI]

/** The box round a board with the hand under it, in the model's frame: for the camera to take in. */
export function withHand(board: THREE.Box3, geometry: THREE.BufferGeometry) {
  const box = geometry.boundingBox ?? new THREE.Box3()
  return box
    .clone()
    .applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...TURNED))
    )
    .translate(palmUnder(board))
    .union(board)
}

/** The occasion the hand is drawn on to be told apart, for its lines (see InReference). */
const TOLD = new THREE.Layers()
TOLD.set(1)

/** The hand under a board, `board` the box round it in the model's frame. */
export function Hand({
  geometry,
  board,
}: {
  geometry: THREE.BufferGeometry
  board: THREE.Box3
}) {
  const colors = useThemeColors()
  const at = React.useMemo(() => palmUnder(board), [board])
  return (
    <group rotation={MODEL_TO_WORLD}>
      <group position={at} rotation={TURNED}>
        <InReference
          geometry={geometry}
          colors={colors}
          occasion={TOLD}
          order={1}
        />
      </group>
    </group>
  )
}
