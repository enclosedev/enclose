import * as THREE from "three"
import { describe, expect, it } from "vitest"

import {
  apartAsShown,
  eachAlone,
  regrouped,
  standInModel,
  type LoadedModel,
} from "./load"

describe("standInModel", () => {
  const cube = standInModel()

  it("is one plain cube, standing on the ground", () => {
    expect(cube.standIn).toBe(true)
    expect(cube.model.parts.map((part) => part.label)).toEqual(["Cube"])
    const [{ box, faces, solid }] = cube.parts
    expect(box.min.z).toBe(0)
    expect(box.getSize(new THREE.Vector3()).toArray()).toEqual([40, 40, 40])
    expect(faces).toBe(6)
    expect(solid).toBe(true)
  })

  it("has its faces known apart, two triangles to each", () => {
    const [{ skins }] = cube.parts
    expect([...skins[0].faceOf]).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  })

  it("is given room in the view, and not framed as closely as a model is", () => {
    const [{ box }] = cube.parts
    expect(cube.box.containsBox(box)).toBe(true)
    expect(cube.box.getSize(new THREE.Vector3()).x).toBeGreaterThan(
      box.getSize(new THREE.Vector3()).x
    )
  })

  it("has nothing to hand out, and nowhere to come apart to", () => {
    expect(cube.model.downloads).toEqual([])
    expect(cube.further).toBe(false)
    expect(cube.parts[0].away.length()).toBe(0)
  })
})

describe("eachAlone", () => {
  /** The cube as two parts of one piece: pulled apart together, and each its own way. */
  const model = () => {
    const cube = standInModel()
    const [part] = cube.parts
    const together = new THREE.Vector3(0, 0, 30)
    return {
      ...cube,
      further: true,
      parts: [
        { ...part, away: together, alone: new THREE.Vector3(0, 0, 45) },
        { ...part, away: together, alone: together },
      ],
    }
  }

  it("pulls each part its own way, where the model can be pulled further", () => {
    const apart = eachAlone(model())
    expect(apart.parts.map((part) => part.away.z)).toEqual([45, 30])
  })

  it("leaves a part that goes the same way either way as it is", () => {
    const whole = model()
    expect(eachAlone(whole).parts[1]).toBe(whole.parts[1])
  })

  it("leaves a model that comes apart no further as it is", () => {
    const whole = { ...model(), further: false }
    expect(eachAlone(whole)).toBe(whole)
  })
})

describe("regrouped", () => {
  const cube = standInModel()
  const groups = [
    { id: "case", label: "Case", shell: true },
    { id: "inside", label: "Inside", shell: false },
  ]

  it("lists the parts under the groups they are put in", () => {
    const moved = regrouped(cube, groups, new Map([["stand-in", "case"]]))
    expect(moved.model.groups).toBe(groups)
    expect(moved.model.parts[0].group).toBe("case")
    expect(moved.parts[0].part).toBe(moved.model.parts[0])
    expect(moved.parts[0].skins).toBe(cube.parts[0].skins)
  })

  it("leaves a part that is not moved as it was", () => {
    const same = regrouped(
      cube,
      [{ id: "stand-in", label: "Cube", shell: false }],
      new Map()
    )
    expect(same.model.parts[0]).toBe(cube.model.parts[0])
    expect(same.parts[0].part).toBe(cube.parts[0].part)
  })

  it("changes nothing of the model it was given", () => {
    regrouped(cube, groups, new Map([["stand-in", "inside"]]))
    expect(cube.model.parts[0].group).toBe("stand-in")
    expect(cube.model.groups[0].id).toBe("stand-in")
  })
})

describe("apartAsShown", () => {
  /**
   * Two cubes side by side, and a third far under them, the way a plug hangs off a
   * cord: a model that does not say how it comes apart, each cube a piece of its own.
   * Pulled apart about all three, the two would go up, away from a middle out in the
   * air between them and the third.
   */
  const model = (): LoadedModel => {
    const cube = standInModel()
    const [part] = cube.parts
    const at = (id: string, x: number, z: number, piece: number) => ({
      ...part,
      part: { ...part.part, id },
      // (skins of its own: where a part's surfaces are is known by them)
      skins: [...part.skins],
      home: new THREE.Matrix4().makeTranslation(x, 0, z),
      piece,
      away: new THREE.Vector3(0, 0, piece === 2 ? 0 : 400),
      alone: new THREE.Vector3(0, 0, piece === 2 ? 0 : 400),
    })
    return {
      ...cube,
      standIn: undefined,
      worked: true,
      parts: [
        at("left", 0, 0, 0),
        at("right", 50, 0, 1),
        at("plug", 0, -1000, 2),
      ],
    }
  }
  const shown =
    (...ids: string[]) =>
    (part: LoadedModel["parts"][number]) =>
      ids.includes(part.part.id)

  it("pulls what is on show apart about its own middle, and not about all of it", () => {
    const [left, right] = apartAsShown(model(), shown("left", "right")).parts
    expect(left.away.x).toBeLessThan(0)
    expect(right.away.x).toBeGreaterThan(0)
    expect(left.away.z).toBeCloseTo(0)
    expect(right.away.z).toBeCloseTo(0)
  })

  it("leaves what is out of sight where it is", () => {
    const whole = model()
    const plug = apartAsShown(whole, shown("left", "right")).parts[2]
    expect(plug.away.length()).toBe(0)
    // (and, going nowhere before either, it is the very same part)
    expect(plug).toBe(whole.parts[2])
  })

  it("says the model comes apart no further where no piece on show is of more than one part", () => {
    expect(apartAsShown(model(), shown("left", "right")).further).toBe(false)
  })

  it("leaves a model that is all on show, or none of it, as it is", () => {
    const whole = model()
    expect(apartAsShown(whole, () => true)).toBe(whole)
    expect(apartAsShown(whole, () => false)).toBe(whole)
  })

  it("leaves a model that says where its parts go as it is, whatever is on show", () => {
    const said = { ...model(), worked: false }
    expect(apartAsShown(said, shown("left"))).toBe(said)
  })
})
