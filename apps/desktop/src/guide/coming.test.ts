import * as THREE from "three"
import { describe, expect, it } from "vitest"

import type { Vec3 } from "@shared/api"
import { readGuide, scenesOf } from "@shared/assembly-format"
import { comingFrom, COMES_FROM, type Comer } from "./coming"

/** How far across the thing is, in these, mm: and so how far off a part with nothing to go by is. */
const ACROSS = 200
const FAR = ACROSS * COMES_FROM.share

/** A part that takes up this room, and that the model pulls this way when it is pulled apart. */
const part = (min: Vec3, max: Vec3, away: Vec3 = [0, 0, 0]): Comer => ({
  box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
  away: new THREE.Vector3(...away),
  comes: new Map(),
})

/** Where the parts of a guide come from, by id and then by step, as plain numbers. */
function coming(steps: object[], parts: Record<string, Comer>) {
  const guide = readGuide({
    title: "Clock",
    steps: steps.map((step) => ({ title: "Do", text: "It.", ...step })),
  })
  const shown = new Map(Object.entries(parts))
  comingFrom(guide, scenesOf(guide), shown, ACROSS)
  return (id: string, step: number) =>
    shown
      .get(id)!
      .comes.get(step)
      ?.toArray()
      .map((n) => Math.round(n * 100) / 100)
}

/** A plate on the table, a hundred across. */
const base = () => part([-50, -50, 0], [50, 50, 10])

describe("comingFrom", () => {
  it("has everything a step puts on come from where the step says", () => {
    const from = coming(
      [{ parts: ["base"] }, { parts: ["lid", "screws"], from: [0, 0, 60] }],
      {
        base: base(),
        lid: part([-50, -50, 10], [50, 50, 14]),
        // (whatever the model says of where it goes when pulled apart)
        screws: part([-40, -40, 12], [40, 40, 16], [0, 0, 30]),
      }
    )
    expect(from("lid", 1)).toEqual([0, 0, 60])
    expect(from("screws", 1)).toEqual([0, 0, 60])
    expect(from("lid", 0)).toBeUndefined()
  })

  it("brings the first part down from above, with nothing there before it", () => {
    const from = coming([{ parts: ["base"] }], { base: base() })
    expect(from("base", 0)).toEqual([0, 0, FAR])
  })

  it("brings each part of a step in its own way, from outside what is there", () => {
    const from = coming(
      [{ parts: ["base"] }, { parts: ["left", "right", "back"] }],
      {
        base: base(),
        left: part([-85, -5, 0], [-75, 5, 10]),
        right: part([75, -5, 0], [85, 5, 10]),
        // a little to one side of straight behind: taken to be straight behind
        back: part([5, 75, 0], [15, 85, 10]),
      }
    )
    expect(from("left", 1)).toEqual([-FAR, 0, 0])
    expect(from("right", 1)).toEqual([FAR, 0, 0])
    expect(from("back", 1)).toEqual([0, FAR, 0])
  })

  it("brings a part that is in the middle of the rest down from above", () => {
    const from = coming([{ parts: ["base"] }, { parts: ["pin"] }], {
      base: base(),
      pin: part([-2, -2, 3], [2, 2, 7]),
    })
    expect(from("pin", 1)).toEqual([0, 0, FAR])
  })

  it("goes back along the way the model pulls a part apart, further off, within what it may be", () => {
    const from = coming(
      [{ parts: ["base"] }, { parts: ["lid", "foot", "cable"] }],
      {
        base: base(),
        lid: part([-50, -50, 10], [50, 50, 14], [0, 0, 20]),
        // pulled hardly at all: it starts no nearer than the least
        foot: part([-5, -5, -4], [5, 5, 0], [0, 0, -4]),
        // pulled a long way: no further than the most
        cable: part([-5, -60, 2], [5, -50, 8], [0, -100, 0]),
      }
    )
    expect(from("lid", 1)).toEqual([0, 0, 30])
    expect(from("foot", 1)).toEqual([0, 0, -ACROSS * COMES_FROM.least])
    expect(from("cable", 1)).toEqual([0, -ACROSS * COMES_FROM.most, 0])
  })

  describe("of what is made up apart", () => {
    const parts = () => ({
      base: base(),
      ring: part([-40, -40, 40], [40, 40, 46]),
      // off to one side of the ring, and pulled its own way when the model is
      dot: part([28, -4, 40], [36, 4, 44], [30, 0, 0]),
    })
    const made = [
      { parts: ["base"] },
      { sub: "Ring", parts: ["ring"] },
      { sub: "Ring", parts: ["dot"], from: [0, 0, -25] },
    ]

    it("has a part come twice: on to that, and with it on to what it is fitted to", () => {
      const from = coming(
        [...made, { parts: [], fits: ["Ring"], from: [0, 0, 50] }],
        parts()
      )
      // the ring is laid down with nothing there before it, the base being out of sight
      expect(from("ring", 1)).toEqual([0, 0, FAR])
      expect(from("dot", 2)).toEqual([0, 0, -25])
      expect(from("ring", 3)).toEqual([0, 0, 50])
      expect(from("dot", 3)).toEqual([0, 0, 50])
    })

    it("brings it in all one way where the step does not say, as the one thing it now is", () => {
      const from = coming([...made, { parts: [], fits: ["Ring"] }], parts())
      // from over the base, which is where the ring is: and the dot with it, whichever
      // way the model pulls the dot
      expect(from("ring", 3)).toEqual([0, 0, FAR])
      expect(from("dot", 3)).toEqual(from("ring", 3))
    })

    it("brings a part of the step's own in its own way beside it", () => {
      const from = coming([...made, { parts: ["peg"], fits: ["Ring"] }], {
        ...parts(),
        peg: part([75, -5, 0], [85, 5, 10]),
      })
      expect(from("ring", 3)).toEqual([0, 0, FAR])
      expect(from("peg", 3)).toEqual([FAR, 0, 0])
    })
  })

  it("is never nearer than a part can be seen to come from, however small the thing", () => {
    const guide = readGuide({
      title: "Pin",
      steps: [{ title: "Do", text: "It.", parts: ["pin"] }],
    })
    const pin = part([0, 0, 0], [1, 1, 4])
    comingFrom(guide, scenesOf(guide), new Map([["pin", pin]]), 5)
    expect(pin.comes.get(0)?.toArray()).toEqual([0, 0, COMES_FROM.mm])
  })
})
