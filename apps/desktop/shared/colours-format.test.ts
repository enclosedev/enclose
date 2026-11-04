import { describe, expect, it } from "vitest"

import {
  coloursFile,
  looksFile,
  readColours,
  readLooks,
} from "./colours-format"

describe("readColours", () => {
  it("reads the colours of the parts it names, the palette's or picked by hand, and nothing else", () => {
    expect(
      readColours({
        dial: "blue",
        lid: "#FF0000",
        knob: "#f00",
        "": "red",
        case: "grey",
        foot: 3,
      })
    ).toEqual({ dial: "blue", lid: "#ff0000", case: "grey" })
    expect(
      readColours(JSON.parse('{"__proto__": "red", "knob": "constructor"}'))
    ).toEqual({})
  })

  it("reads nothing from what is no list of colours", () => {
    expect(readColours(null)).toEqual({})
    expect(readColours(["blue"])).toEqual({})
    expect(readColours("blue")).toEqual({})
  })
})

describe("readLooks", () => {
  it("reads a part's colour and material from the object it has with a material", () => {
    expect(
      readLooks({
        dial: "blue",
        lid: { color: "#3a7bd5", material: "oak", scale: 1.5, rotation: 90 },
        case: { material: "steel", roughness: 9 },
        // (a material there is none of is not read, nor a colour that is none)
        foot: { color: "mauve", material: "unobtainium" },
      })
    ).toEqual({
      colours: { dial: "blue", lid: "#3a7bd5" },
      materials: {
        lid: { material: "oak", scale: 1.5, rotation: 90 },
        // (as rough as a material may be set, and no rougher)
        case: { material: "steel", roughness: 2 },
      },
    })
  })
})

describe("looksFile", () => {
  it("writes the parts in order, to be read back as they were", () => {
    const file = coloursFile({ lid: "red", dial: "blue" })
    expect(file).toBe('{\n  "dial": "blue",\n  "lid": "red"\n}\n')
    expect(readColours(JSON.parse(file))).toEqual({ dial: "blue", lid: "red" })
  })

  it("writes a part with a material as an object, its colour in it", () => {
    const looks = {
      colours: { lid: "#3a7bd5" as const, dial: "blue" as const },
      materials: {
        lid: { material: "oak", scale: 2 },
        base: { material: "walnut" },
      },
    }
    const file = looksFile(looks)
    expect(JSON.parse(file)).toEqual({
      base: { material: "walnut" },
      dial: "blue",
      lid: { color: "#3a7bd5", material: "oak", scale: 2 },
    })
    expect(readLooks(JSON.parse(file))).toEqual(looks)
  })
})
