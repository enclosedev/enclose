import { describe, expect, it } from "vitest"

import {
  askedAgain,
  back,
  briefly,
  coloured,
  forth,
  hiddenWith,
  hidingSaid,
  later,
  NO_HISTORY,
  rearranged,
  record,
  recolour,
  rehidden,
  saidOf,
  type Colours,
} from "./undo"

const given: Colours = { lid: "red", base: "blue" }

describe("recolour", () => {
  it("says what the parts had, and what they are given", () => {
    expect(recolour(given, ["lid", "screw"], "green", 5)).toEqual({
      kind: "colour",
      at: 5,
      undoneAt: null,
      before: { lid: "red", screw: null },
      after: { lid: "green", screw: "green" },
    })
  })

  it("takes no account of a part that has the colour already", () => {
    expect(recolour(given, ["lid", "base"], "red", 5)).toMatchObject({
      before: { base: "blue" },
      after: { base: "red" },
    })
  })

  it("is nothing where nothing changes", () => {
    expect(recolour(given, ["lid"], "red", 5)).toBeNull()
    expect(recolour(given, ["screw"], null, 5)).toBeNull()
    expect(recolour(given, [], "red", 5)).toBeNull()
  })

  it("gives a part the model's own colour back", () => {
    expect(recolour(given, ["lid"], null, 5)).toMatchObject({
      before: { lid: "red" },
      after: { lid: null },
    })
  })
})

describe("coloured", () => {
  it("puts parts to what a change says, and leaves the rest", () => {
    expect(coloured(given, { lid: "green", screw: "pink" })).toEqual({
      lid: "green",
      base: "blue",
      screw: "pink",
    })
  })

  it("takes a colour away from a part that is to have the model's own", () => {
    expect(coloured(given, { lid: null })).toEqual({ base: "blue" })
  })
})

describe("the history of what was done by hand", () => {
  const first = recolour(given, ["lid"], "green", 1)!
  const second = recolour(given, ["base"], null, 2)!

  it("takes back the latest first, and puts back in the order it was done", () => {
    const history = record(record(NO_HISTORY, first), second)
    const one = back(history, 10)!
    expect(one.change).toBe(second)
    const two = back(one.history, 11)!
    expect(two.change).toBe(first)
    expect(back(two.history, 12)).toBeNull()
    expect(two.history.undone.map((change) => change.undoneAt)).toEqual([
      10, 11,
    ])

    const again = forth(two.history)!
    expect(again.change).toMatchObject({ at: 1 })
    expect(again.history.done.at(-1)?.undoneAt).toBeNull()
    expect(forth(forth(again.history)!.history)).toBeNull()
  })

  it("lets go of what was taken back once something else is done", () => {
    const { history } = back(record(NO_HISTORY, first), 10)!
    expect(record(history, second)).toEqual({ done: [second], undone: [] })
  })

  it("holds the parts put into groups another way, among the colours", () => {
    const before = { made: [], put: {}, called: {} }
    const after = {
      made: ["g1"],
      put: { lid: { group: "g1", from: "case" } },
      called: {},
    }
    const group = rearranged(before, after, "a grouping", 3)
    expect(group).toEqual({
      kind: "arrangement",
      at: 3,
      undoneAt: null,
      before,
      after,
      said: "a grouping",
    })
    const history = record(record(NO_HISTORY, first), group)
    const one = back(history, 10)!
    expect(one.change).toBe(group)
    expect(back(one.history, 11)!.change).toBe(first)
    expect(forth(one.history)!.change).toMatchObject({ kind: "arrangement" })
  })

  it("has nothing to take back or put back to begin with", () => {
    expect(back(NO_HISTORY, 1)).toBeNull()
    expect(forth(NO_HISTORY)).toBeNull()
  })
})

describe("later", () => {
  it("is whichever was done last", () => {
    expect(later(5, 3)).toBe("mine")
    expect(later(3, 5)).toBe("claudes")
  })

  it("is the one there is, where there is only one", () => {
    expect(later(5, null)).toBe("mine")
    expect(later(null, 5)).toBe("claudes")
    expect(later(null, null)).toBeNull()
  })
})

describe("saidOf", () => {
  it("says what was taken back, and what was put back", () => {
    expect(saidOf("undo", { ok: true, what: "Make it taller" }, true)).toBe(
      "Undid “Make it taller”. ⇧⌘Z puts it back"
    )
    expect(saidOf("redo", { ok: true, what: "Make it taller" }, true)).toBe(
      "Redid “Make it taller”"
    )
    expect(saidOf("undo", { ok: true, what: "Make it taller" }, false)).toBe(
      "Undid “Make it taller”. Shift Ctrl Z puts it back"
    )
  })

  it("says why not, where it could not be", () => {
    expect(saidOf("undo", { ok: false, why: "busy", files: [] }, true)).toBe(
      "Claude is at work: nothing can be undone until it is through"
    )
    expect(saidOf("redo", { ok: false, why: "board", files: [] }, true)).toBe(
      "A board is being made: nothing can be redone until it is done"
    )
    expect(
      saidOf("undo", { ok: false, why: "changed", files: ["model.py"] }, true)
    ).toBe("Not undone: model.py changed since")
    expect(
      saidOf(
        "redo",
        {
          ok: false,
          why: "changed",
          files: ["model.py", "a.glb", "b.glb"],
        },
        true
      )
    ).toBe("Not redone: model.py and 2 more changed since")
    expect(
      saidOf(
        "undo",
        { ok: false, why: "failed", files: [], detail: "no space left" },
        true
      )
    ).toBe("Only part of it could be undone: no space left")
  })

  it("says nothing where there was nothing to do", () => {
    expect(
      saidOf("undo", { ok: false, why: "nothing", files: [] }, true)
    ).toBeNull()
  })
})

describe("parts put out of sight by hand", () => {
  it("are the parts that went, and the ones that came back", () => {
    expect(rehidden(["lid"], ["lid", "screw", "nut"], 5)).toEqual({
      kind: "hidden",
      at: 5,
      undoneAt: null,
      hid: ["screw", "nut"],
      shown: [],
    })
    expect(rehidden(["lid", "screw"], [], 5)).toMatchObject({
      hid: [],
      shown: ["lid", "screw"],
    })
    expect(rehidden(["lid"], ["lid"], 5)).toBeNull()
  })

  it("are taken back and put back for those parts alone", () => {
    const hid = rehidden([], ["screw"], 5)!
    // a part hidden since stays hidden
    expect(hiddenWith(["screw", "lid"], hid, true)).toEqual(["lid"])
    expect(hiddenWith(["lid"], hid, false)).toEqual(["lid", "screw"])
    const shown = rehidden(["screw", "nut"], [], 5)!
    expect(hiddenWith([], shown, true)).toEqual(["screw", "nut"])
    expect(hiddenWith(["screw", "nut"], shown, false)).toEqual([])
  })

  it("are said as what was done to them", () => {
    expect(hidingSaid(rehidden([], ["screw"], 5)!)).toBe("hiding a part")
    expect(hidingSaid(rehidden(["a", "b"], [], 5)!)).toBe("showing 2 parts")
  })
})

describe("what a first Cmd+Z says of a turn", () => {
  it("says to press again, how long the turn took and what it was asked", () => {
    expect(
      askedAgain({ what: "Make it taller", at: 0, took: 58 * 60_000 }, true)
    ).toBe(
      "Press ⌘Z again to undo 58 min of the agent's work: “Make it taller”"
    )
    expect(
      askedAgain({ what: "Make it taller", at: 0, took: null }, false)
    ).toBe("Press Ctrl Z again to undo the agent's last turn: “Make it taller”")
  })

  it("cuts what was asked short at a word", () => {
    expect(
      briefly(
        "I want to work on a new idea. [Image 1] It’s a wall art installation"
      )
    ).toBe("I want to work on a new idea. It’s a…")
    expect(briefly("Make it taller")).toBe("Make it taller")
    expect(briefly("Make it taller.")).toBe("Make it taller")
  })
})
