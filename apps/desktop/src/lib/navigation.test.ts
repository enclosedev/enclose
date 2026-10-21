import { describe, expect, it } from "vitest"

import {
  dragOf,
  presetOf,
  PRESETS,
  waysOf,
  type Buttons,
  type Preset,
} from "./navigation"

const NONE = { shift: false, ctrl: false }
const SHIFT = { shift: true, ctrl: false }
const CTRL = { shift: false, ctrl: true }

describe("presetOf", () => {
  it("knows each program's buttons for that program's", () => {
    for (const name of Object.keys(PRESETS) as Preset[])
      expect(presetOf({ ...PRESETS[name] })).toBe(name)
  })

  it("takes buttons set by hand for nobody's", () => {
    const own: Buttons = { ...PRESETS.blender, right: "pan" }
    expect(presetOf(own)).toBeNull()
  })
})

describe("dragOf", () => {
  it("does what the button is set to do, with no key held", () => {
    expect(dragOf(PRESETS.enclose, "right", NONE)).toBe("turn")
    expect(dragOf(PRESETS.enclose, "middle", NONE)).toBe("zoom")
    expect(dragOf(PRESETS.fusion, "middle", NONE)).toBe("pan")
  })

  it("does what a key says with either button", () => {
    expect(dragOf(PRESETS.blender, "middle", SHIFT)).toBe("pan")
    expect(dragOf(PRESETS.blender, "right", SHIFT)).toBe("pan")
    expect(dragOf(PRESETS.blender, "middle", CTRL)).toBe("zoom")
    expect(dragOf(PRESETS.solidworks, "middle", SHIFT)).toBe("zoom")
    expect(dragOf(PRESETS.solidworks, "middle", CTRL)).toBe("pan")
    expect(dragOf(PRESETS.fusion, "middle", SHIFT)).toBe("turn")
  })

  it("zooms with both keys held, whatever each says alone", () => {
    for (const name of Object.keys(PRESETS) as Preset[])
      expect(dragOf(PRESETS[name], "middle", { shift: true, ctrl: true })).toBe(
        "zoom"
      )
  })
})

describe("waysOf", () => {
  it("lists what each button does, the right one first", () => {
    expect(waysOf(PRESETS.blender).turn).toEqual([
      { button: "right", held: null },
      { button: "middle", held: null },
    ])
  })

  it("says a key with the right button, where that makes a difference", () => {
    const ways = waysOf(PRESETS.enclose)
    expect(ways.turn).toEqual([{ button: "right", held: null }])
    expect(ways.pan).toEqual([{ button: "right", held: "shift" }])
    expect(ways.zoom).toEqual([
      { button: "middle", held: null },
      { button: "right", held: "ctrl" },
    ])
  })

  it("says it with the middle button where the right one does the same anyway", () => {
    // Fusion: the right button turns, and Shift turns: it is the middle one it changes
    expect(waysOf(PRESETS.fusion).turn).toEqual([
      { button: "right", held: null },
      { button: "middle", held: "shift" },
    ])
  })

  it("leaves out a key that changes nothing", () => {
    const all: Buttons = {
      middle: "pan",
      right: "pan",
      shift: "pan",
      ctrl: "zoom",
    }
    expect(waysOf(all).pan).toEqual([
      { button: "right", held: null },
      { button: "middle", held: null },
    ])
    expect(waysOf(all).turn).toEqual([])
  })
})
