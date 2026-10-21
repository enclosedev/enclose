import { describe, expect, it } from "vitest"

import { readGuide } from "@shared/assembly-format"
import { standing, stoodIn, towards, type Stand } from "./standing"

/** A guide of three steps, and how the parts of each stand in them. */
const STEPS = 3
const ALREADY: Stand[] = ["on", "on", "on"]
const FIRST: Stand[] = ["coming", "on", "on"]
const SECOND: Stand[] = ["away", "coming", "on"]
const THIRD: Stand[] = ["away", "away", "coming"]

describe("standing", () => {
  it("has the thing whole before the first step, in its own colours", () => {
    for (const stands of [ALREADY, FIRST, THIRD])
      expect(standing(-1, stands)).toMatchObject({
        there: 1,
        out: 0,
        own: 1,
      })
  })

  it("has a step's parts in place and lit once the step is done, and nothing of the later ones", () => {
    expect(standing(1, SECOND)).toEqual({ there: 1, out: 0, lit: 1, own: 0 })
    expect(standing(1, THIRD).there).toBe(0)
    expect(standing(1, FIRST)).toEqual({ there: 1, out: 0, lit: 0, own: 0 })
    expect(standing(1, ALREADY)).toEqual({ there: 1, out: 0, lit: 0, own: 0 })
  })

  it("brings a step's parts in from where they come from as the step goes on", () => {
    const begun = standing(1.05, THIRD)
    const half = standing(1.5, THIRD)
    const nearly = standing(1.95, THIRD)
    expect(begun.out).toBeGreaterThan(half.out)
    expect(half.out).toBeGreaterThan(nearly.out)
    expect(nearly.out).toBeLessThan(0.01)
    expect(begun.there).toBeLessThan(0.2)
    expect(half.there).toBe(1)
    expect(half.lit).toBe(1)
    expect(standing(1.3, SECOND).lit).toBeLessThan(1)
    expect(standing(1.7, SECOND).lit).toBe(0)
  })

  it("lets the whole go before the first parts come in, which were there in it", () => {
    const going = standing(-0.8, FIRST)
    expect(going.out).toBe(0)
    expect(going.there).toBeGreaterThan(0)
    expect(going.there).toBeLessThan(1)
    expect(standing(-0.6, FIRST).there).toBe(0)
    expect(standing(-0.6, THIRD).there).toBe(0)
    const coming = standing(-0.3, FIRST)
    expect(coming.out).toBeGreaterThan(0)
    expect(coming.there).toBeGreaterThan(0)
  })

  it("has the thing in its own colours again once the last step is done with", () => {
    expect(standing(STEPS - 1, FIRST).own).toBe(0)
    expect(standing(STEPS, FIRST)).toEqual({
      there: 1,
      out: 0,
      lit: 0,
      own: 1,
    })
  })
})

// A base; then a ring laid down apart and a dot put in it; then the ring, dot and all,
// put on the base; then a lid.
const clock = readGuide({
  title: "Clock",
  already: ["wall"],
  steps: [
    { title: "Start", text: "Lay it down.", parts: ["base"] },
    { sub: "Ring", title: "Lay", text: "Face down.", parts: ["ring"] },
    { sub: "ring", title: "Dot", text: "Twist it in.", parts: ["dot"] },
    { title: "Fit", text: "Press it on.", parts: [], fits: ["Ring"] },
    { title: "Close", text: "Set it on.", parts: ["lid"] },
  ],
})

describe("stoodIn", () => {
  const { stands, cuts } = stoodIn(clock)

  it("has a step done to the thing itself seen with all that is on it so far", () => {
    expect(stands.get("wall")).toEqual(["on", "away", "away", "on", "on"])
    expect(stands.get("base")).toEqual(["coming", "away", "away", "on", "on"])
    expect(stands.get("lid")).toEqual([
      "away",
      "away",
      "away",
      "away",
      "coming",
    ])
  })

  it("has what is made up apart seen alone, and then come on whole", () => {
    expect(stands.get("ring")).toEqual(["away", "coming", "on", "coming", "on"])
    expect(stands.get("dot")).toEqual([
      "away",
      "away",
      "coming",
      "coming",
      "on",
    ])
  })

  it("says which steps are done to another thing than the one before", () => {
    // (and that the thing finished is the thing itself, as the last step was)
    expect(cuts).toEqual([false, true, false, true, false, false])
  })

  it("has one thing gone and the other come before the parts of such a step come in", () => {
    const [base, ring, dot] = ["base", "ring", "dot"].map((id) =>
      stands.get(id)!
    )
    expect(standing(0.1, base, cuts)).toMatchObject({ out: 0 })
    expect(standing(0.1, base, cuts).there).toBeLessThan(1)
    expect(standing(0.3, base, cuts).there).toBe(0)
    expect(standing(0.3, ring, cuts).there).toBe(0)
    expect(standing(0.7, ring, cuts).out).toBeGreaterThan(0)
    expect(standing(1.2, ring, cuts)).toMatchObject({ there: 1, out: 0 })
    expect(standing(1.2, dot, cuts).out).toBeGreaterThan(0)
    expect(standing(2.1, ring, cuts)).toMatchObject({ out: 0 })
    expect(standing(2.3, ring, cuts).there).toBe(0)
    expect(standing(2.3, base, cuts)).toMatchObject({ there: 1, out: 0 })
    const [one, other] = [standing(2.7, ring, cuts), standing(2.7, dot, cuts)]
    expect(one.out).toBeGreaterThan(0)
    expect(other).toEqual(one)
    expect(standing(3, dot, cuts)).toEqual({ there: 1, out: 0, lit: 1, own: 0 })
  })
})

describe("towards", () => {
  it("goes a step in as long as a step takes", () => {
    expect(towards(0, 1, 0.45, 0.9)).toBeCloseTo(0.5)
    expect(towards(1, 0, 0.45, 0.9)).toBeCloseTo(0.5)
  })

  it("arrives, and goes no further", () => {
    expect(towards(0.9, 1, 0.5, 0.9)).toBe(1)
    expect(towards(2, 2, 0.5, 0.9)).toBe(2)
  })

  it("goes faster to what is further off", () => {
    const near = towards(0, 1, 0.1, 0.9)
    const far = towards(0, 5, 0.1, 0.9)
    expect(far).toBeCloseTo(near * 5)
  })
})
