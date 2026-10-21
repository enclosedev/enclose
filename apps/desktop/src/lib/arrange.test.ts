import { describe, expect, it } from "vitest"

import {
  arranged,
  grouped,
  LOOSE,
  NOT_ARRANGED,
  readArrangement,
  renamed,
  ungrouped,
  UNNAMED,
  untouched,
  type Arrangement,
} from "./arrange"

const model = {
  groups: [
    { id: "case", label: "Case", shell: true },
    { id: "board", label: "Board", shell: false },
    { id: "screws", label: "Screws", shell: false },
  ],
  parts: [
    { id: "lid", group: "case" },
    { id: "base", group: "case" },
    { id: "pcb", group: "board" },
    { id: "chip", group: "board" },
    { id: "m3", group: "screws" },
  ],
}
type Told = Parameters<typeof arranged>[0]
const told = model as unknown as Told

/** The groups by what they go by, each with the parts in it, as the list shows them. */
const shown = (
  arrangement: Arrangement,
  named = {},
  of: Told = told
): Record<string, string[]> => {
  const { groups, of: places } = arranged(of, arrangement, named)
  return Object.fromEntries(
    groups.map((group) => [
      group.label,
      of.parts
        .filter((part) => places.get(part.id) === group.id)
        .map((part) => part.id),
    ])
  )
}

describe("arranged", () => {
  it("is the model's own groups where nothing was done by hand", () => {
    expect(arranged(told, NOT_ARRANGED, {}).groups).toEqual(model.groups)
    expect(shown(NOT_ARRANGED)).toEqual({
      Case: ["lid", "base"],
      Board: ["pcb", "chip"],
      Screws: ["m3"],
    })
  })
})

describe("grouped", () => {
  const made = grouped(told, NOT_ARRANGED, ["chip", "m3"], "g1")!

  it("puts a group made by hand first, with its parts out of where they were", () => {
    expect(Object.entries(shown(made))).toEqual([
      [UNNAMED, ["chip", "m3"]],
      ["Case", ["lid", "base"]],
      ["Board", ["pcb"]],
    ])
  })

  it("puts the latest made first, and drops a group left with no parts", () => {
    const again = grouped(told, made, ["chip", "pcb"], "g2")!
    expect(
      Object.keys(shown(again, { g1: "Fixings", g2: "Electronics" }))
    ).toEqual(["Electronics", "Fixings", "Case"])
    const all = grouped(told, again, ["m3", "lid"], "g3")!
    expect(Object.keys(shown(all, { g1: "Fixings" }))).not.toContain("Fixings")
  })

  it("goes by the name the agent gave it, and before that by one written by hand", () => {
    expect(Object.keys(shown(made, { g1: "Fixings" }))[0]).toBe("Fixings")
    const called = renamed(
      told,
      made,
      { g1: "Fixings" },
      "g1",
      "  Odd   bits "
    )!
    expect(Object.keys(shown(called, { g1: "Fixings" }))[0]).toBe("Odd bits")
  })

  it("is the outside of the thing only if all that is in it was", () => {
    const outside = grouped(told, NOT_ARRANGED, ["lid", "base"], "g1")
    // those two are a group already
    expect(outside).toBeNull()
    const lid = grouped(told, NOT_ARRANGED, ["lid"], "g1")!
    expect(arranged(told, lid, {}).groups[0].shell).toBe(true)
    expect(arranged(told, made, {}).groups[0].shell).toBe(false)
  })

  it("is nothing where the parts are a group already, or are not the model's", () => {
    expect(grouped(told, NOT_ARRANGED, ["pcb", "chip"], "g1")).toBeNull()
    expect(grouped(told, made, ["m3", "chip"], "g2")).toBeNull()
    expect(grouped(told, NOT_ARRANGED, ["nothing"], "g1")).toBeNull()
    expect(grouped(told, NOT_ARRANGED, [], "g1")).toBeNull()
  })

  it("makes a group of some of a group, and of parts that were in none", () => {
    expect(grouped(told, NOT_ARRANGED, ["pcb"], "g1")).not.toBeNull()
    const loose = ungrouped(told, NOT_ARRANGED, ["pcb", "chip"])!
    expect(shown(grouped(told, loose, ["pcb", "chip"], "g1")!)).toEqual({
      [UNNAMED]: ["pcb", "chip"],
      Case: ["lid", "base"],
      Screws: ["m3"],
    })
  })
})

describe("ungrouped", () => {
  it("takes parts out of their groups, to be in none, listed last", () => {
    const loose = ungrouped(told, NOT_ARRANGED, ["chip", "m3"])!
    expect(Object.entries(shown(loose))).toEqual([
      ["Case", ["lid", "base"]],
      ["Board", ["pcb"]],
      ["Ungrouped", ["chip", "m3"]],
    ])
    expect(arranged(told, loose, {}).of.get("chip")).toBe(LOOSE)
  })

  it("takes them out of a group made by hand", () => {
    const made = grouped(told, NOT_ARRANGED, ["chip", "m3"], "g1")!
    expect(shown(ungrouped(told, made, ["chip", "m3"])!)).toEqual({
      Case: ["lid", "base"],
      Board: ["pcb"],
      Ungrouped: ["chip", "m3"],
    })
  })

  it("is nothing where none of them is in a group", () => {
    const loose = ungrouped(told, NOT_ARRANGED, ["chip"])!
    expect(ungrouped(told, loose, ["chip"])).toBeNull()
    expect(ungrouped(told, NOT_ARRANGED, ["nothing"])).toBeNull()
  })

  it("joins the parts the model itself has in no group", () => {
    const own = {
      groups: [...model.groups, { id: LOOSE, label: "Parts", shell: false }],
      parts: [...model.parts, { id: "nut", group: LOOSE }],
    } as unknown as Told
    const loose = ungrouped(own, NOT_ARRANGED, ["m3", "nut"])!
    expect(shown(loose, {}, own).Parts).toEqual(["m3", "nut"])
    expect(loose.put.nut).toBeUndefined()
  })
})

describe("renamed", () => {
  it("calls one of the model's groups something else", () => {
    const called = renamed(told, NOT_ARRANGED, {}, "board", "Main board")!
    expect(Object.keys(shown(called))).toEqual(["Case", "Main board", "Screws"])
  })

  it("gives a group back what it went by, with nothing written", () => {
    const called = renamed(told, NOT_ARRANGED, {}, "board", "Main board")!
    expect(untouched(renamed(told, called, {}, "board", " ")!)).toBe(true)
    const made = grouped(told, NOT_ARRANGED, ["chip", "m3"], "g1")!
    const odd = renamed(told, made, { g1: "Fixings" }, "g1", "Odd bits")!
    const back = renamed(told, odd, { g1: "Fixings" }, "g1", "")!
    expect(Object.keys(shown(back, { g1: "Fixings" }))[0]).toBe("Fixings")
  })

  it("is nothing where that is what it goes by, or there is no such group", () => {
    expect(renamed(told, NOT_ARRANGED, {}, "board", "Board")).toBeNull()
    expect(renamed(told, NOT_ARRANGED, {}, "board", "")).toBeNull()
    expect(renamed(told, NOT_ARRANGED, {}, "nothing", "Thing")).toBeNull()
  })
})

describe("what was done by hand, when the model changes under it", () => {
  const made = grouped(told, NOT_ARRANGED, ["chip", "m3"], "g1")!

  it("gives way where the build has since put a part in another group", () => {
    const rebuilt = {
      groups: [
        ...model.groups,
        { id: "fixings", label: "Fixings", shell: false },
      ],
      parts: model.parts.map((part) =>
        part.id === "m3" ? { ...part, group: "fixings" } : part
      ),
    } as unknown as Told
    expect(shown(made, {}, rebuilt)).toEqual({
      [UNNAMED]: ["chip"],
      Case: ["lid", "base"],
      Board: ["pcb"],
      // a group the build itself left with no parts is still the model's to list
      Screws: [],
      Fixings: ["m3"],
    })
    expect(shown(made)[UNNAMED]).toEqual(["chip", "m3"])
  })

  it("gives way where the build has since called a group something else", () => {
    const called = renamed(told, NOT_ARRANGED, {}, "board", "Main board")!
    const rebuilt = {
      ...model,
      groups: model.groups.map((group) =>
        group.id === "board" ? { ...group, label: "Electronics" } : group
      ),
    } as unknown as Told
    expect(Object.keys(shown(called, {}, rebuilt))).toContain("Electronics")
  })

  it("leaves alone parts the model no longer has", () => {
    const fewer = {
      ...model,
      parts: model.parts.filter((part) => part.id !== "m3"),
    } as unknown as Told
    expect(shown(made, {}, fewer)[UNNAMED]).toEqual(["chip"])
  })
})

describe("readArrangement", () => {
  it("reads back what was kept", () => {
    const made = grouped(told, NOT_ARRANGED, ["chip", "m3"], "g1")!
    const called = renamed(told, made, {}, "board", "Main board")!
    expect(readArrangement(JSON.parse(JSON.stringify(called)))).toEqual(called)
  })

  it("takes nothing that is not as it should be", () => {
    expect(readArrangement(null)).toBe(NOT_ARRANGED)
    expect(readArrangement({ made: "g1", put: [], called: 3 })).toBe(
      NOT_ARRANGED
    )
    expect(
      readArrangement({
        made: ["g1", 2],
        put: { chip: { group: "g1", from: "board" }, m3: { group: "g1" } },
        called: { g1: { label: "Bits" }, board: "Board" },
      })
    ).toEqual({
      made: ["g1"],
      put: { chip: { group: "g1", from: "board" } },
      called: { g1: { label: "Bits", from: null } },
    })
  })
})
