import * as THREE from "three"
import { beforeAll, describe, expect, it } from "vitest"

import { standInModel, type LoadedModel } from "./load"
import { webModel } from "./web"

// three's exporter reads what it writes with the browser's FileReader, which Node has
// not: one that does as much as it asks of it
beforeAll(() => {
  if ("FileReader" in globalThis) return
  class Reader {
    result: ArrayBuffer | null = null
    onloadend: (() => void) | null = null
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      })
    }
  }
  Object.assign(globalThis, { FileReader: Reader })
})

type Gltf = {
  scenes: { name?: string; nodes: number[] }[]
  nodes: {
    name: string
    children?: number[]
    mesh?: number
    translation?: number[]
    rotation?: number[]
    extras?: Record<string, unknown>
  }[]
  meshes: {
    primitives: { attributes: { POSITION: number }; material: number }[]
  }[]
  accessors: { min?: number[]; max?: number[] }[]
  materials: {
    pbrMetallicRoughness: {
      baseColorFactor?: number[]
      metallicFactor?: number
    }
    extensions?: Record<string, unknown>
  }[]
}

/** The JSON at the head of a GLB. */
function jsonOf(glb: ArrayBuffer): Gltf {
  const view = new DataView(glb)
  expect(view.getUint32(0, true)).toBe(0x46546c67) // "glTF"
  const length = view.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, length)))
}

/** The cube, standing 10 mm along, 20 back and 30 up from where it would. */
function moved(): LoadedModel {
  const cube = standInModel()
  const [part] = cube.parts
  return {
    ...cube,
    model: {
      ...cube.model,
      title: "Cube",
      groups: [{ id: "body", label: "Body", shell: false }],
      parts: [{ ...part.part, id: "cube", group: "body" }],
    },
    parts: [
      {
        ...part,
        part: { ...part.part, id: "cube", label: "Cube", group: "body" },
        home: new THREE.Matrix4().makeTranslation(10, 20, 30),
      },
    ],
  }
}

describe("webModel", () => {
  it("has each part a node named by its id, under one for its group, with what each goes by", async () => {
    const gltf = jsonOf(await webModel(moved()))
    const [group] = gltf.scenes[0].nodes.map((index) => gltf.nodes[index])
    expect(group.name).toBe("body")
    expect(group.extras).toEqual({ label: "Body" })
    const part = gltf.nodes[group.children![0]]
    expect(part.name).toBe("cube")
    expect(part.extras).toEqual({ label: "Cube" })
  })

  it("is in metres with Y up: the model's Z is up, and its Y goes back, away from +Z", async () => {
    const gltf = jsonOf(await webModel(moved()))
    const part = gltf.nodes.find((node) => node.name === "cube")!
    const [x, y, z] = part.translation!
    expect(x).toBeCloseTo(0.01)
    expect(y).toBeCloseTo(0.03)
    expect(z).toBeCloseTo(-0.02)
    // its corners in metres too: the cube is 40 mm across
    const mesh = gltf.nodes[part.children![0]]
    const position =
      gltf.accessors[gltf.meshes[mesh.mesh!].primitives[0].attributes.POSITION]
    const across = position.max!.map((most, i) => most - position.min![i])
    for (const size of across) expect(size).toBeCloseTo(0.04)
  })

  it("takes the colour and the material given the part", async () => {
    const gltf = jsonOf(
      await webModel(moved(), {
        colours: { cube: "#ff0000" },
        materials: { cube: { material: "steel" } },
      })
    )
    const [material] = gltf.materials
    expect(material.pbrMetallicRoughness.metallicFactor).toBe(1)
    const [r, g, b] = material.pbrMetallicRoughness.baseColorFactor!
    // steel is of its own colour: the part's red is not drawn on it
    expect(Math.abs(r - g) + Math.abs(g - b)).toBeLessThan(0.1)
    const red = jsonOf(
      await webModel(moved(), { colours: { cube: "#ff0000" } })
    ).materials[0].pbrMetallicRoughness.baseColorFactor!
    expect(red.slice(0, 3)).toEqual([1, 0, 0])
  })

  it("has only the parts asked for", async () => {
    const gltf = jsonOf(await webModel(moved(), { parts: ["something else"] }))
    expect(gltf.nodes ?? []).toEqual([])
  })
})
