import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"

// what draws the hand, and loads it, which want a window: none of it is needed here
vi.mock("@/components/viewport/load", () => ({}))
vi.mock("@/components/viewport/reference", () => ({}))
vi.mock("@/components/viewport/rig", () => ({ MODEL_TO_WORLD: [0, 0, 0] }))
vi.mock("@/lib/css-color", () => ({}))
vi.mock("./hand.glb?url", () => ({ default: "hand.glb" }))

const { withHand } = await import("./hand")

describe("withHand", () => {
  it("takes in the board and the hand under it, the middle of its palm under the board's, reaching in from behind", () => {
    // a board 80 by 62, 1.6 thick, with a part 3 mm deep on its underside
    const board = new THREE.Box3(
      new THREE.Vector3(-30, -21, -3.8),
      new THREE.Vector3(50, 41, 0.8)
    )
    // the hand as hand.glb has it: its palm's middle over the origin, the palm at 0
    const hand = new THREE.BufferGeometry()
    hand.boundingBox = new THREE.Box3(
      new THREE.Vector3(-58, -97, -58),
      new THREE.Vector3(93, 141, 0)
    )
    // turned half round, to reach in from behind the board: its fingers to the front
    const box = withHand(board, hand)
    const near = (got: THREE.Vector3, want: number[]) =>
      got.toArray().forEach((one, at) => expect(one).toBeCloseTo(want[at], 6))
    near(box.min, [10 - 93, 10 - 141, -3.8 - 58])
    near(box.max, [10 + 58, 10 + 97, 0.8])
  })
})
