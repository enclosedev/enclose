import { describe, expect, it } from "vitest"

import {
  cutChosen,
  cutsChosen,
  sameCut,
  stillAway,
  type Cut,
  type PutAway,
} from "./put-away"

/** A cut across Z through the middle, as a fresh one is made. */
const across = (): Cut => ({ position: [0, 0, 12], turn: [0, 0, 0, 1] })

describe("the section's handle, put away", () => {
  it("stays away while the cut is where it was put away", () => {
    const away: PutAway = { cut: across(), chosen: cutsChosen() }
    expect(stillAway(away, across(), cutsChosen())).toBe(true)
  })

  it("comes back when the cut is moved", () => {
    const away: PutAway = { cut: across(), chosen: cutsChosen() }
    const pushed: Cut = { ...across(), position: [0, 0, 14] }
    const tilted: Cut = { ...across(), turn: [0.1, 0, 0, 0.995] }
    expect(stillAway(away, pushed, cutsChosen())).toBe(false)
    expect(stillAway(away, tilted, cutsChosen())).toBe(false)
  })

  it("comes back for a cut chosen afresh, even one where the cut already was", () => {
    // put away, then Reset cut (or the key of the axis it is across) makes the same cut
    const away: PutAway = { cut: across(), chosen: cutsChosen() }
    cutChosen()
    expect(stillAway(away, across(), cutsChosen())).toBe(false)
    const again: PutAway = { cut: across(), chosen: cutsChosen() }
    expect(stillAway(again, across(), cutsChosen())).toBe(true)
  })

  it("is not away until it is put away", () => {
    expect(stillAway(null, across(), cutsChosen())).toBe(false)
  })

  it("counts each cut chosen afresh", () => {
    const before = cutsChosen()
    cutChosen()
    cutChosen()
    expect(cutsChosen()).toBe(before + 2)
  })
})

describe("sameCut", () => {
  it("is through the same point, turned the same way", () => {
    expect(sameCut(across(), across())).toBe(true)
    expect(sameCut(across(), { ...across(), position: [0, 1, 12] })).toBe(false)
    expect(sameCut(across(), { ...across(), turn: [0, 0, 1, 0] })).toBe(false)
  })
})
