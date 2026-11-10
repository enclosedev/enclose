import { describe, expect, it } from "vitest"

import { meshFile, objOf, stlOf, trianglesOf } from "./meshes"

/** A binary glTF file of one mesh: its corners (Y-up metres), and how they make triangles. */
function glb(
  corners: number[],
  index: number[] | null,
  node: Record<string, unknown> = {}
): Buffer {
  const position = Buffer.from(Float32Array.from(corners).buffer)
  const order = index
    ? Buffer.from(Uint16Array.from(index).buffer)
    : Buffer.alloc(0)
  let data = Buffer.concat([position, order])
  data = Buffer.concat([data, Buffer.alloc(-data.length & 3)])
  const doc = {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    // the mesh is under a node of its own, as a 3D program would put it
    nodes: [{ children: [1], ...node }, { mesh: 0 }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0 }, ...(index ? { indices: 1 } : {}) },
        ],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: position.length },
      { buffer: 0, byteOffset: position.length, byteLength: order.length },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: corners.length / 3,
        type: "VEC3",
      },
      ...(index
        ? [
            {
              bufferView: 1,
              componentType: 5123,
              count: index.length,
              type: "SCALAR",
            },
          ]
        : []),
    ],
  }
  let json = Buffer.from(JSON.stringify(doc))
  json = Buffer.concat([json, Buffer.alloc(-json.length & 3, " ")])
  const header = Buffer.alloc(12)
  header.write("glTF", 0, "latin1")
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + json.length + 8 + data.length, 8)
  const chunk = (length: number, kind: number) => {
    const out = Buffer.alloc(8)
    out.writeUInt32LE(length, 0)
    out.writeUInt32LE(kind, 4)
    return out
  }
  return Buffer.concat([
    header,
    chunk(json.length, 0x4e4f534a),
    json,
    chunk(data.length, 0x004e4942),
    data,
  ])
}

const near = (got: Float32Array, want: number[]) =>
  expect(Array.from(got).map((n) => Math.round(n * 1000) / 1000 + 0)).toEqual(
    want
  )

describe("trianglesOf", () => {
  it("gives a part's triangles in mm with Z up", () => {
    // one triangle, a metre up (glTF's +Y) and a metre to the back (glTF's -Z)
    const file = glb([0, 1, 0, 0.001, 1, 0, 0, 1, -1], [0, 1, 2])
    near(trianglesOf(file), [0, 0, 1000, 1, 0, 1000, 0, 1000, 1000])
  })

  it("puts them where the file's nodes and then the manifest put them", () => {
    const file = glb([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0], null, {
      translation: [0.01, 0, 0],
      // a half turn about glTF's up
      rotation: [0, 1, 0, 0],
    })
    // 5 mm along the model's y, by rows
    const moved = [1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1, 0, 0, 0, 0, 1]
    near(trianglesOf(file, moved), [10, 5, 0, 9, 5, 0, 10, 5, 1])
  })

  it("will not read what is no glTF file", () => {
    expect(() => trianglesOf(Buffer.from("solid nothing"))).toThrow(
      "not a binary glTF file"
    )
  })
})

/** Two triangles that make a square, sharing an edge. */
const square = Float32Array.from([
  0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 0, 10, 10, 0, 0, 10, 0,
])

describe("stlOf", () => {
  it("writes every part's triangles in one binary file, each with the way it faces", () => {
    const file = stlOf([
      { label: "a", triangles: square },
      { label: "b", triangles: square.subarray(0, 9) },
    ])
    expect(file.length).toBe(84 + 50 * 3)
    expect(file.readUInt32LE(80)).toBe(3)
    expect(file.toString("latin1", 0, 5)).not.toBe("solid")
    // facing up, the way its corners go round
    expect([0, 1, 2].map((k) => file.readFloatLE(84 + k * 4))).toEqual([
      0, 0, 1,
    ])
    expect(file.readFloatLE(84 + 12 + 4 * 3)).toBe(10)
  })
})

describe("objOf", () => {
  it("writes each part as an object, with the corners its triangles share written once", () => {
    expect(
      objOf([
        { label: "Base  plate", triangles: square },
        { label: "Lid", triangles: square.subarray(0, 9) },
      ])
    ).toBe(
      [
        "# OBJ from Enclose, in millimetres with Z up",
        "o Base plate",
        "v 0 0 0",
        "v 10 0 0",
        "v 10 10 0",
        "v 0 10 0",
        "f 1 2 3",
        "f 1 3 4",
        "o Lid",
        "v 0 0 0",
        "v 10 0 0",
        "v 10 10 0",
        "f 5 6 7",
        "",
      ].join("\n")
    )
  })

  it("writes a part of more triangles than a call can be handed", () => {
    // (a speaker's part ran to this many, and the file was never written)
    const count = 200_000
    const triangles = new Float32Array(count * 9)
    for (let i = 0; i < count; i++)
      triangles.set([i, 0, 0, i, 1, 0, i, 0, 1], i * 9)
    const file = objOf([{ label: "grille", triangles }])
    expect(
      file.split("\n").filter((line) => line.startsWith("f "))
    ).toHaveLength(count)
  })

  it("is what is written for a format, as STL is", () => {
    const parts = [{ label: "a", triangles: square }]
    expect(meshFile("obj", parts).toString("utf8")).toBe(objOf(parts))
    expect(meshFile("stl", parts)).toEqual(stlOf(parts))
  })
})
