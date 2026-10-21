// The parts of a model as meshes, for a slicer or a 3D program: STL and OBJ files, made
// of the meshes the app draws, which keep within a fiftieth of a millimetre of the
// model's curves. In millimetres with Z up, as a slicer takes them and as the model is.

/** What a model can be saved as besides STEP. */
export type MeshFormat = "stl" | "obj"
export const MESH_FORMATS: MeshFormat[] = ["stl", "obj"]

/** A part's triangles: nine numbers to each, its three corners, in mm with Z up. */
export type Triangles = Float32Array

/** A part to be written: what it is called, and its triangles. */
export type Meshed = { label: string; triangles: Triangles }

type Matrix = number[]

/** 4 × 4, by columns, as glTF has it. */
const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function times(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16).fill(0)
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++)
        out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k]
  return out
}

/** A node's place, from a matrix or from how it is moved, turned and sized. */
function placeOf(node: GltfNode): Matrix {
  if (node.matrix?.length === 16) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ]
}

/** glTF is Y-up metres; the model is Z-up millimetres. */
const TO_MODEL: Matrix = [
  1000, 0, 0, 0, 0, 0, 1000, 0, 0, -1000, 0, 0, 0, 0, 0, 1,
]

type GltfNode = {
  children?: number[]
  mesh?: number
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}
type Accessor = {
  bufferView?: number
  byteOffset?: number
  componentType: number
  count: number
  type: string
}
type Gltf = {
  scene?: number
  scenes?: { nodes?: number[] }[]
  nodes?: GltfNode[]
  meshes?: {
    primitives: {
      attributes: { POSITION?: number }
      indices?: number
      mode?: number
    }[]
  }[]
  accessors?: Accessor[]
  bufferViews?: {
    byteOffset?: number
    byteLength: number
    byteStride?: number
  }[]
}

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

/**
 * The triangles of a part's binary glTF file, where the file and then `matrix` (the
 * part's place as the manifest gives it: 16 numbers, by rows) put them. Throws, saying
 * so, on a file that is not one.
 */
export function trianglesOf(
  glb: Buffer,
  matrix: number[] | null = null
): Triangles {
  if (glb.length < 20 || glb.toString("latin1", 0, 4) !== "glTF")
    throw new Error("not a binary glTF file")
  const length = glb.readUInt32LE(12)
  if (glb.readUInt32LE(16) !== JSON_CHUNK)
    throw new Error("not a binary glTF file")
  const doc = JSON.parse(glb.toString("utf8", 20, 20 + length)) as Gltf
  const at = 20 + length
  const bin =
    glb.length >= at + 8 && glb.readUInt32LE(at + 4) === BIN_CHUNK
      ? glb.subarray(at + 8, at + 8 + glb.readUInt32LE(at))
      : Buffer.alloc(0)
  // (a manifest's matrix is by rows: turned, it is by columns as the rest are)
  const home =
    matrix?.length === 16
      ? [0, 1, 2, 3].flatMap((column) =>
          [0, 1, 2, 3].map((row) => matrix[row * 4 + column])
        )
      : IDENTITY
  const into = times(home, TO_MODEL)

  const read = (index: number, each: number) => {
    const accessor = doc.accessors?.[index]
    if (!accessor || accessor.bufferView === undefined) return []
    const view = doc.bufferViews![accessor.bufferView]
    const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType]
    if (!size) throw new Error("a glTF file in a form that is not read here")
    const stride = view.byteStride || size * each
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const out = new Array<number>(accessor.count * each)
    for (let i = 0; i < accessor.count; i++)
      for (let k = 0; k < each; k++) {
        const offset = start + i * stride + k * size
        out[i * each + k] =
          size === 1
            ? bin.readUInt8(offset)
            : size === 2
              ? bin.readUInt16LE(offset)
              : accessor.componentType === 5126
                ? bin.readFloatLE(offset)
                : bin.readUInt32LE(offset)
      }
    return out
  }

  const found: number[] = []
  const visit = (index: number, above: Matrix) => {
    const node = doc.nodes?.[index]
    if (!node) return
    const place = times(above, placeOf(node))
    for (const primitive of doc.meshes?.[node.mesh ?? -1]?.primitives ?? []) {
      // triangles only: a mesh may have points or lines as well, which are no surface
      if (
        (primitive.mode ?? 4) !== 4 ||
        primitive.attributes.POSITION === undefined
      )
        continue
      const corners = read(primitive.attributes.POSITION, 3)
      const order =
        primitive.indices === undefined
          ? Array.from({ length: corners.length / 3 }, (_, i) => i)
          : read(primitive.indices, 1)
      for (const i of order) {
        const [x, y, z] = [
          corners[i * 3],
          corners[i * 3 + 1],
          corners[i * 3 + 2],
        ]
        for (let row = 0; row < 3; row++)
          found.push(
            place[row] * x +
              place[4 + row] * y +
              place[8 + row] * z +
              place[12 + row]
          )
      }
    }
    for (const child of node.children ?? []) visit(child, place)
  }
  const scene = doc.scenes?.[doc.scene ?? 0]
  for (const index of scene?.nodes ?? []) visit(index, into)
  return Float32Array.from(found)
}

/**
 * One binary STL file of every part given, all of them together: STL has no way to keep
 * them apart, and what it is had for (a slicer) parts them by what touches what.
 */
export function stlOf(parts: Meshed[]): Buffer {
  const count = parts.reduce((all, part) => all + part.triangles.length / 9, 0)
  const out = Buffer.alloc(84 + 50 * count)
  // (in the header, which nothing reads: but not "solid", which says ASCII to some)
  out.write("Binary STL from Enclose, in millimetres", 0, "latin1")
  out.writeUInt32LE(count, 80)
  let at = 84
  for (const { triangles } of parts)
    for (let i = 0; i < triangles.length; i += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.subarray(i, i + 9)
      const [ux, uy, uz, vx, vy, vz] = [
        bx - ax,
        by - ay,
        bz - az,
        cx - ax,
        cy - ay,
        cz - az,
      ]
      let [nx, ny, nz] = [
        uy * vz - uz * vy,
        uz * vx - ux * vz,
        ux * vy - uy * vx,
      ]
      const size = Math.hypot(nx, ny, nz) || 1
      ;[nx, ny, nz] = [nx / size, ny / size, nz / size]
      for (const value of [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz]) {
        out.writeFloatLE(value, at)
        at += 4
      }
      at += 2
    }
  return out
}

/** A number as an OBJ file has it: short, with no more to it than a float holds. */
const said = (n: number) => String(Math.fround(n) === 0 ? 0 : +n.toPrecision(7))

/**
 * One OBJ file of every part given, each an object of its own under its name. The
 * corners a part's triangles share are written once, so that what reads it finds the
 * part joined up, and not in loose triangles.
 */
export function objOf(parts: Meshed[]): string {
  const lines = ["# OBJ from Enclose, in millimetres with Z up"]
  let written = 0
  for (const { label, triangles } of parts) {
    lines.push(`o ${label.replace(/\s+/g, " ").trim() || "part"}`)
    const known = new Map<string, number>()
    const faces: string[] = []
    const corner = (i: number) => {
      const key = `${said(triangles[i])} ${said(triangles[i + 1])} ${said(triangles[i + 2])}`
      let at = known.get(key)
      if (at === undefined) {
        known.set(key, (at = written + known.size + 1))
        lines.push(`v ${key}`)
      }
      return at
    }
    for (let i = 0; i < triangles.length; i += 9)
      faces.push(`f ${corner(i)} ${corner(i + 3)} ${corner(i + 6)}`)
    written += known.size
    lines.push(...faces)
  }
  return `${lines.join("\n")}\n`
}

/** A file of the parts given, in the format asked for. */
export function meshFile(format: MeshFormat, parts: Meshed[]): Buffer {
  return format === "stl" ? stlOf(parts) : Buffer.from(objOf(parts), "utf8")
}
