import { describe, expect, it } from "vitest"

import {
  changes,
  copperColourOf,
  PCB_AREAS,
  PCB_SLOTS,
  readLooks,
  readTheme,
  themeFile,
  themeIdOf,
  type PcbColours,
} from "./theme-format"

describe("PCB_SLOTS", () => {
  it("is what a theme colours of a board, each in one of PCB mode's ways", () => {
    expect(PCB_SLOTS.length).toBeGreaterThan(0)
    for (const slot of PCB_SLOTS) expect(PCB_AREAS).toContain(slot.area)
    expect(new Set(PCB_SLOTS.map(({ token }) => token)).size).toBe(
      PCB_SLOTS.length
    )
  })
})

describe("copperColourOf", () => {
  const colours = {
    "technical-top": "#100000",
    "technical-inner1": "#200000",
    "technical-inner2": "#300000",
    "technical-bottom": "#400000",
  } as PcbColours

  it("colours each layer of a board of four in its own", () => {
    expect(
      ["top", "inner1", "inner2", "bottom"].map((layer) =>
        copperColourOf(colours, layer)
      )
    ).toEqual(["#100000", "#200000", "#300000", "#400000"])
  })

  it("colours the layers inside a bigger board by turns, and anything else as the top", () => {
    expect(copperColourOf(colours, "inner3")).toBe("#200000")
    expect(copperColourOf(colours, "inner6")).toBe("#300000")
    expect(copperColourOf(colours, null)).toBe("#100000")
    expect(copperColourOf(colours, "overlay")).toBe("#100000")
  })
})

describe("readTheme", () => {
  it("reads a theme's name and the colours of each look", () => {
    expect(
      readTheme("ocean", {
        name: " Ocean ",
        light: { viewer: "#F2F6FA", parts: { blue: "#336699" } },
        dark: { tools: "#00aaff" },
      })
    ).toEqual({
      id: "ocean",
      name: "Ocean",
      light: { viewer: "#f2f6fa", parts: { blue: "#336699" } },
      dark: { tools: "#00aaff" },
    })
  })

  it("reads a circuit board's colours, each of the ways PCB mode looks at one", () => {
    expect(
      readTheme("copper", {
        name: "Copper",
        dark: {
          "board-mask": "#1A1A1A",
          "technical-top": "#ff8800",
          "schematic-wires": "#00ccff",
        },
      })?.dark
    ).toEqual({
      "board-mask": "#1a1a1a",
      "technical-top": "#ff8800",
      "schematic-wires": "#00ccff",
    })
  })

  it("leaves out what is not a colour of something a theme colours", () => {
    const theme = readTheme("odd", {
      name: "Odd",
      light: {
        viewer: "blue",
        sidebar: "#ffffff",
        chat: "#12345",
        parts: { teal: "#00ffff", red: 3, pink: "#ff00aa" },
      },
      dark: "#000000",
    })
    expect(theme).toEqual({
      id: "odd",
      name: "Odd",
      light: { parts: { pink: "#ff00aa" } },
      dark: {},
    })
  })

  it("is no theme without a name, or called what the app's own look is", () => {
    expect(readTheme("nameless", { light: {} })).toBeNull()
    expect(readTheme("default", { name: "Mine" })).toBeNull()
    expect(readTheme("Not An Id", { name: "Mine" })).toBeNull()
    expect(readTheme("list", [])).toBeNull()
  })

  it("reads back what it writes", () => {
    const theme = {
      name: "Dusk",
      light: { message: "#eeeeff" },
      dark: { cards: "#202030", parts: { green: "#88ffaa" } },
    }
    expect(readTheme("dusk", JSON.parse(themeFile(theme)))).toEqual({
      id: "dusk",
      ...theme,
    })
  })
})

describe("themeIdOf", () => {
  it("is the name in lower case, with dashes", () => {
    expect(themeIdOf("Deep Ocean!", [])).toBe("deep-ocean")
    expect(themeIdOf("Café Noir", [])).toBe("cafe-noir")
    expect(themeIdOf("???", [])).toBe("theme")
  })

  it("is numbered where one goes by it already, or the app's own look does", () => {
    expect(themeIdOf("Ocean", ["ocean"])).toBe("ocean-2")
    expect(themeIdOf("Ocean", ["ocean", "ocean-2"])).toBe("ocean-3")
    expect(themeIdOf("Default", [])).toBe("default-2")
  })
})

describe("changes", () => {
  it("is whether a look of a theme changes anything", () => {
    expect(changes({})).toBe(false)
    expect(changes({ parts: {} })).toBe(false)
    expect(changes({ chat: "#000000" })).toBe(true)
    expect(changes({ "board-pads": "#d4a017" })).toBe(true)
    expect(changes({ parts: { red: "#ff0000" } })).toBe(true)
  })
})

describe("readLooks", () => {
  it("reads what is changed of the app's own look, and nothing from what says nothing", () => {
    expect(
      readLooks({ name: " Paper ", light: { chat: "#FAFAFA" }, dark: [] })
    ).toEqual({ name: "Paper", light: { chat: "#fafafa" }, dark: {} })
    expect(readLooks(null)).toEqual({ name: "Default", light: {}, dark: {} })
    expect(readLooks({ name: "  " }).name).toBe("Default")
  })
})
