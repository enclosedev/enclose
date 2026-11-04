import { describe, expect, it } from "vitest"

import { MATERIALS, materialOf, solidColours, solidOf } from "./materials"

describe("the materials", () => {
  it("each have an id of their own, and a colour as #rrggbb", () => {
    expect(new Set(MATERIALS.map((one) => one.id)).size).toBe(MATERIALS.length)
    for (const one of MATERIALS) expect(one.colour).toMatch(/^#[0-9a-f]{6}$/)
  })

  it("are found by id, and nothing by an id there is none of", () => {
    expect(materialOf("oak")?.name).toBe("Oak")
    expect(materialOf("unobtainium")).toBeNull()
    expect(materialOf(null)).toBeNull()
  })
})

describe("what Solid draws a part in", () => {
  it("is the part's colour for a material that takes one, and the material's own for one that has its own", () => {
    expect(solidOf("blue", materialOf("plastic-glossy"))).toBe("blue")
    expect(solidOf("blue", materialOf("oak"))).toBe(materialOf("oak")!.colour)
    expect(solidOf(null, null)).toBeNull()
  })

  it("is the very colours given, where no part has a material with a colour of its own", () => {
    const given = { lid: "blue" }
    expect(solidColours(given, {})).toBe(given)
    expect(solidColours(given, { lid: { material: "plastic-matte" } })).toBe(
      given
    )
    expect(solidColours(given, { base: { material: "walnut" } })).toEqual({
      lid: "blue",
      base: materialOf("walnut")!.colour,
    })
  })
})
