import { describe, expect, it } from "vitest"

import { PALETTE } from "@shared/palette"
import { drawnIn, setPalettes } from "./palette"

describe("drawnIn", () => {
  it("draws a colour named in the palette as that colour", () => {
    expect(drawnIn("blue", 0)).toBe(PALETTE.blue)
    expect(drawnIn(" Grey ", 3)).toBe(PALETTE.grey)
    expect(drawnIn("white", 0)).toBe(PALETTE.white)
    expect(drawnIn("lightgray", 0)).toBe(PALETTE.lightgrey)
  })

  it("draws any other colour as the nearest of the palette's", () => {
    expect(drawnIn("#e0892f", 0)).toBe(PALETTE.orange)
    expect(drawnIn("#4a7fb5", 0)).toBe(PALETTE.blue)
    expect(drawnIn("#ff0000", 0)).toBe(PALETTE.red)
    expect(drawnIn("#00a040", 0)).toBe(PALETTE.green)
    expect(drawnIn("#7a1fd0", 0)).toBe(PALETTE.violet)
    // near the top of the circle, the nearest may be round the other way
    expect(drawnIn("#f01060", 0)).toBe(PALETTE.pink)
    expect(drawnIn("#f02040", 0)).toBe(PALETTE.red)
  })

  it("is already at home with its own colours", () => {
    for (const colour of Object.values(PALETTE))
      expect(drawnIn(colour, 0)).toBe(colour)
  })

  it("leaves a grey, a white or a black as it is", () => {
    for (const grey of ["#d9d9d4", "#ffffff", "#000000", "#aeb2b9"])
      expect(drawnIn(grey, 0)).toBe(grey)
  })

  it("gives what has no colour the palette's colours in turn, never the grey", () => {
    const given = Array.from({ length: 10 }, (_, turn) => drawnIn(null, turn))
    expect(new Set(given).size).toBe(10)
    for (const plain of [PALETTE.grey, PALETTE.lightgrey, PALETTE.white])
      expect(given).not.toContain(plain)
    expect(drawnIn(null, 10)).toBe(given[0])
  })

  it("keeps green for the boards, in a model with one, drawing indigo in its place", () => {
    expect(drawnIn(null, 2)).toBe(PALETTE.green)
    expect(drawnIn(null, 2, true)).toBe(PALETTE.indigo)
    expect(drawnIn("green", 0, true)).toBe(PALETTE.indigo)
    expect(drawnIn("#00a040", 0, true)).toBe(PALETTE.indigo)
    for (let turn = 0; turn < 10; turn++)
      if (turn !== 2)
        expect(drawnIn(null, turn, true)).toBe(drawnIn(null, turn))
    expect(drawnIn("#d9d9d4", 0, true)).toBe("#d9d9d4")
  })

  it("draws each of the palette's colours as a theme has it, where one does", () => {
    const light = { ...PALETTE, blue: "#336699", indigo: "#5544aa" }
    setPalettes(light, PALETTE)
    try {
      expect(drawnIn("blue", 0)).toBe("#336699")
      expect(drawnIn("#4a7fb5", 0)).toBe("#336699")
      expect(drawnIn(null, 0)).toBe("#336699")
      expect(drawnIn("green", 0, true)).toBe("#5544aa")
      expect(drawnIn("#d9d9d4", 0)).toBe("#d9d9d4")
    } finally {
      setPalettes(PALETTE, PALETTE)
    }
  })

  it("leaves alone what it cannot read as a colour", () => {
    expect(drawnIn("rebeccapurple", 0)).toBe("rebeccapurple")
  })
})
