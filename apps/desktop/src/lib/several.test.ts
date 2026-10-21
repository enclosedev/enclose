import { describe, expect, it } from "vitest"

import { NO_SWEEP, sweptTo, toggled, toggledAll } from "./several"

const order = ["a", "b", "c", "d", "e", "f", "g", "h"]

describe("toggled", () => {
  it("has a thing join what is picked, or leave it, in the list's order", () => {
    expect(toggled(order, ["e"], "b").ids).toEqual(["b", "e"])
    expect(toggled(order, ["b", "e"], "b").ids).toEqual(["e"])
    expect(toggled(order, [], "b").ids).toEqual(["b"])
  })

  it("is where the next sweep starts from", () => {
    expect(toggled(order, ["e"], "b").sweep).toEqual({ from: "b", over: [] })
  })
})

describe("sweptTo", () => {
  const clicked = { from: "c", over: [] }

  it("picks everything from the thing last clicked to this one, either way", () => {
    expect(sweptTo(order, ["c"], clicked, "f").ids).toEqual([
      "c",
      "d",
      "e",
      "f",
    ])
    expect(sweptTo(order, ["c"], clicked, "a").ids).toEqual(["a", "b", "c"])
  })

  it("picks from the same thing to another, in place of the last sweep", () => {
    const far = sweptTo(order, ["c"], clicked, "g")
    expect(far.ids).toEqual(["c", "d", "e", "f", "g"])
    const nearer = sweptTo(order, far.ids, far.sweep, "e")
    expect(nearer.ids).toEqual(["c", "d", "e"])
    expect(sweptTo(order, nearer.ids, nearer.sweep, "a").ids).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("keeps what was picked otherwise", () => {
    const two = toggled(order, ["a"], "e")
    expect(sweptTo(order, two.ids, two.sweep, "g").ids).toEqual([
      "a",
      "e",
      "f",
      "g",
    ])
  })

  it("picks the one thing, with the rest, where there is nowhere to sweep from", () => {
    const first = sweptTo(order, [], NO_SWEEP, "c")
    expect(first).toEqual({ ids: ["c"], sweep: { from: "c", over: [] } })
    expect(sweptTo(order, first.ids, first.sweep, "e").ids).toEqual([
      "c",
      "d",
      "e",
    ])
    // what was clicked is picked no longer
    expect(sweptTo(order, ["g"], clicked, "e").ids).toEqual(["e", "g"])
  })

  it("passes over what is not there to pick", () => {
    expect(sweptTo(order, ["c"], clicked, "g", ["d", "f"]).ids).toEqual([
      "c",
      "e",
      "g",
    ])
  })
})

describe("toggledAll", () => {
  it("has all of several things join what is picked", () => {
    expect(toggledAll(order, ["a", "c"], ["c", "d", "e"])).toEqual([
      "a",
      "c",
      "d",
      "e",
    ])
  })

  it("has them all leave it, where every one of them is picked", () => {
    expect(toggledAll(order, ["a", "c", "d", "e"], ["c", "d", "e"])).toEqual([
      "a",
    ])
  })
})
