import { describe, expect, it } from "vitest"

import { partSaid, titlesOf, underSaid } from "./hover-said"
import type { Hole, Pad, Part, Trace } from "./inspect"

const part: Part = {
  id: "pcb_component_0",
  name: "U1",
  box: { x: 0, y: 0, w: 4, h: 4 },
  anchor: null,
  offset: null,
}
const titles = titlesOf([
  { key: "a", title: "CH224K", names: ["U1"], size: null },
  { key: "b", title: "10kΩ resistor", names: ["R1", "R2"], size: null },
])

describe("titlesOf", () => {
  it("has what each part is, by each of its names", () => {
    expect(titles.get("R2")).toBe("10kΩ resistor")
    expect(titles.get("U1")).toBe("CH224K")
  })
})

describe("underSaid", () => {
  it("says a part by its name and what it is", () => {
    expect(underSaid({ kind: "part", part }, titles)).toEqual({
      title: "U1",
      detail: "CH224K",
    })
    expect(partSaid("R7", titles)).toEqual({ title: "R7", detail: null })
  })

  it("says a pad by the names of its pin, with what its part is", () => {
    const pad = { names: ["U1.VBUS", "U1.pin8"] } as Pad
    expect(underSaid({ kind: "pad", pad, part }, titles)).toEqual({
      title: "U1.VBUS, U1.pin8",
      detail: "CH224K",
    })
    // a pad of no named pin is its part's
    expect(
      underSaid(
        { kind: "pad", pad: { names: [] as string[] } as Pad, part },
        titles
      )
    ).toEqual({ title: "U1", detail: "CH224K" })
  })

  it("says a trace by what it is and how long, and a hole by how big", () => {
    const trace = { name: "GND", length: 12.345 } as Trace
    expect(underSaid({ kind: "trace", trace }, titles)).toEqual({
      title: "GND",
      detail: "12.35 mm",
    })
    expect(
      underSaid({ kind: "trace", trace: { ...trace, name: null } }, titles)
        ?.title
    ).toBe("Trace")
    const hole = {
      drill: [3.2, 3.2],
      round: true,
      part: null,
      placed: part,
    } as unknown as Hole
    expect(underSaid({ kind: "hole", hole, part }, titles)?.title).toBe(
      "Hole ⌀3.2 mm"
    )
  })
})
