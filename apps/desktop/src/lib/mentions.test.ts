import { describe, expect, it } from "vitest"

import {
  callingOn,
  matching,
  nearness,
  notCalledOn,
  partsOf,
  putIn,
  stretches,
  tokenAt,
} from "./mentions"

describe("tokenAt", () => {
  it("finds a part being named", () => {
    expect(tokenAt("make @li", 8)).toEqual({
      kind: "part",
      from: 5,
      to: 8,
      query: "li",
    })
  })

  it("finds one as soon as its mark is written", () => {
    expect(tokenAt("@", 1)).toMatchObject({ kind: "part", query: "" })
    expect(tokenAt("use $", 5)).toMatchObject({ kind: "skill", query: "" })
  })

  it("takes a command only at the start of the message", () => {
    expect(tokenAt("/comp", 5)).toMatchObject({
      kind: "command",
      query: "comp",
    })
    expect(tokenAt("see /comp", 9)).toBeNull()
    expect(tokenAt("a path/to", 9)).toBeNull()
  })

  it("is over once a space follows the name", () => {
    expect(tokenAt("/compact ", 9)).toBeNull()
    expect(tokenAt("@lid and", 8)).toBeNull()
  })

  it("wants the mark at the start of a word", () => {
    expect(tokenAt("me@home", 7)).toBeNull()
    expect(tokenAt("costs $5.00!", 12)).toBeNull()
  })

  it("takes the rest of the word with it when the caret is inside one", () => {
    expect(tokenAt("@tube_3 here", 3)).toEqual({
      kind: "part",
      from: 0,
      to: 7,
      query: "tu",
    })
  })

  it("takes names with a plugin in front", () => {
    expect(tokenAt("$vercel:ai-", 11)).toMatchObject({ query: "vercel:ai-" })
  })
})

describe("putIn", () => {
  it("writes the name out, with a space after it", () => {
    const token = tokenAt("make @li", 8)!
    expect(putIn("make @li", token, "lid")).toEqual({
      text: "make @lid ",
      caret: 10,
    })
  })

  it("does not double a space that is there", () => {
    const token = tokenAt("make @li taller", 8)!
    expect(putIn("make @li taller", token, "lid")).toEqual({
      text: "make @lid taller",
      caret: 10,
    })
  })

  it("replaces all of the word the caret was in", () => {
    const token = tokenAt("@tube_3 here", 3)!
    expect(putIn("@tube_3 here", token, "tube_9").text).toBe("@tube_9 here")
  })
})

describe("matching", () => {
  const list = [
    { name: "cube", also: "Cube" },
    { name: "tube_1", also: "Tube 1" },
    { name: "lid", also: "Lid" },
    { name: "vercel:ai-sdk" },
    { name: "kicad-pcb" },
  ]
  const names = (query: string) => matching(list, query).map((x) => x.name)

  it("gives all of them when nothing is written", () => {
    expect(names("")).toHaveLength(5)
  })

  it("puts what begins with it first, then words within, then the rest", () => {
    expect(names("c")).toEqual(["cube", "vercel:ai-sdk", "kicad-pcb"])
    expect(names("a")).toEqual(["vercel:ai-sdk", "kicad-pcb"])
    expect(names("pcb")).toEqual(["kicad-pcb"])
    expect(names("ub")).toEqual(["cube", "tube_1"])
  })

  it("finds by the other name too, whatever the case", () => {
    expect(names("TUBE 1")).toEqual(["tube_1"])
  })

  it("finds each by the names it is given to be found by", () => {
    const picture = { name: "inspiration:image-4f1a", also: "image.png" }
    const parts = [
      { name: "r1", also: "R1" },
      { name: "lid", also: "Lid" },
    ]
    const names = (query: string) =>
      matching([picture, ...parts], query, (item) =>
        item === picture ? [item.also] : [item.name, item.also]
      ).map((x) => x.name)
    expect(names("r")).toEqual(["r1"])
    expect(names("i")).toEqual(["inspiration:image-4f1a", "lid"])
  })
})

describe("nearness", () => {
  it("says how nearly names are what was written", () => {
    expect(nearness(["R1"], "r")).toBe(0)
    expect(nearness(["Tube 1"], "1")).toBe(1)
    expect(nearness(["image.png"], "m")).toBe(2)
    expect(nearness(["image.png"], "r")).toBe(3)
  })
})

describe("stretches", () => {
  it("picks the names out of a message", () => {
    expect(stretches("make @lid taller with $kicad-pcb.")).toEqual([
      { text: "make ", kind: null },
      { text: "@lid", kind: "part" },
      { text: " taller with ", kind: null },
      { text: "$kicad-pcb", kind: "skill" },
      { text: ".", kind: null },
    ])
  })

  it("takes a command only at the start", () => {
    expect(stretches("/compact keep the sizes")[0]).toEqual({
      text: "/compact",
      kind: "command",
    })
    expect(stretches("a/b or /c").every((s) => s.kind === null)).toBe(true)
  })

  it("leaves prices and addresses alone", () => {
    expect(stretches("$5 to me@home.org")).toEqual([
      { text: "$5 to me@home.org", kind: null },
    ])
  })
})

describe("notCalledOn", () => {
  it("gives the parts a message does not name", () => {
    expect(notCalledOn("make @lid thicker", ["lid", "cube"])).toEqual(["cube"])
    expect(notCalledOn("", ["lid", "cube"])).toEqual(["lid", "cube"])
  })

  it("knows a name with the sentence's full stop after it", () => {
    expect(notCalledOn("thicken @lid, and @cube.", ["lid", "cube"])).toEqual([])
  })

  it("does not take a longer name for a shorter one", () => {
    expect(notCalledOn("move @tube_10", ["tube_1"])).toEqual(["tube_1"])
  })
})

describe("callingOn", () => {
  it("names the parts ahead of what the message says", () => {
    expect(callingOn("make these thicker", ["lid", "cube"])).toBe(
      "@lid @cube make these thicker"
    )
  })

  it("is the names alone, of a message that says nothing", () => {
    expect(callingOn("", ["lid", "cube"])).toBe("@lid @cube")
  })

  it("names only those not named already", () => {
    expect(callingOn("round @lid", ["lid", "cube"])).toBe("@cube round @lid")
    expect(callingOn("round @lid", ["lid"])).toBe("round @lid")
    expect(callingOn("as it is", [])).toBe("as it is")
  })
})

describe("partsOf", () => {
  const part = (id: string) => ({
    id,
    label: id,
    point: null,
    normal: null,
    face: null,
  })
  const message = (text: string, said: string[] = []) => ({
    kind: "user" as const,
    id: "user-1",
    at: 0,
    text,
    part: null,
    notes: said.map((id) => ({ part: part(id), text: "thicker" })),
  })

  it("is the parts something was said of, and the ones called on by name", () => {
    expect(
      partsOf(message("@tube_1 @tube_2 make these longer", ["lid"]))
    ).toEqual(["lid", "tube_1", "tube_2"])
  })

  it("has a part once, however often the message comes to it", () => {
    expect(partsOf(message("@lid, and @lid again.", ["lid", "lid"]))).toEqual([
      "lid",
    ])
  })

  it("is none for a message about no part", () => {
    expect(partsOf(message("make it all $kicad-pcb friendly"))).toEqual([])
    expect(
      partsOf({ kind: "user", id: "u", at: 0, text: "taller", part: null })
    ).toEqual([])
  })

  it("takes in all of a piece that something was said of", () => {
    const board = {
      ...part("chip"),
      piece: { label: "Main board", parts: ["pcb", "chip", "socket"] },
    }
    expect(
      partsOf({
        ...message("@lid too"),
        notes: [{ part: board, text: "lower" }],
      })
    ).toEqual(["chip", "pcb", "socket", "lid"])
  })

  it("takes in every part of a whole object the message calls on", () => {
    expect(
      partsOf({
        ...message("@lid make these taller"),
        objects: [
          { label: "Power button", parts: ["power_cap", "power_switch"] },
          { label: "Record button", parts: ["record_cap"] },
        ],
      })
    ).toEqual(["power_cap", "power_switch", "record_cap", "lid"])
  })

  it("takes in the part a message was about, when it could be about only one", () => {
    expect(partsOf({ ...message("taller"), part: part("base") })).toEqual([
      "base",
    ])
  })
})
