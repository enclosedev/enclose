// Reading a model's files into something that draws fast.
//
// CAD exporters write one mesh per face: tens of thousands of them for a circuit board,
// each one a separate draw. Here every face that wears the same colour is joined into one
// mesh per part, and the face each triangle came from is kept, so a click can still be
// traced to a face.
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import {
  mergeGeometries,
  toCreasedNormals,
} from "three/addons/utils/BufferGeometryUtils.js"
import { MeshBVH } from "three-mesh-bvh"

import type { Group, Model, Part } from "@/lib/model"
import { piecesOf, waysOut } from "./apart"
import { contoursOf, type Contours } from "./contours"
import { ruledOf } from "./ruled"
import { sharing } from "./shared"
import { shellOf } from "./shell"
import { sharpOf, thingsOf } from "./things"

/** The faces of one part that share a colour, as a single mesh. */
export type Skin = {
  /** in the part's own frame, model mm */
  geometry: THREE.BufferGeometry
  /** the colour the file gave these faces; null if it gave none */
  color: THREE.Color | null
  /** for each triangle, the face of the part it belongs to */
  faceOf: Uint32Array
}

export type LoadedPart = {
  part: Part
  skins: Skin[]
  /** x1 y1 z1 x2 y2 z2 per segment, model mm */
  edges: Float32Array
  /** where its curved faces may show their outline, which no edge marks */
  contours: Contours
  /** its surfaces close a volume, so a cut through it leaves a face to fill in */
  solid: boolean
  /** its group's place among the model's groups: what gives a part with no colour one */
  turn: number
  /** the model has a circuit board in it, whose colour no other part is drawn in then */
  boards: boolean
  /** in the part's own frame */
  box: THREE.Box3
  /** where the part sits in the model */
  home: THREE.Matrix4
  /**
   * Which piece of the model it is of, a number the parts of one piece share: the parts
   * of a group that are one object, which come apart as one and are picked out as one
   * (see apart.ts).
   */
  piece: number
  /** where it moves to when the model is exploded, mm: with the rest of its piece */
  away: THREE.Vector3
  /**
   * And where it moves to when every part of the model goes by itself. It is the same,
   * for a model that says where its parts go or one with no piece of more than a part.
   */
  alone: THREE.Vector3
  faces: number
}

export type LoadedModel = {
  model: Model
  parts: LoadedPart[]
  /** the assembled model, model mm */
  box: THREE.Box3
  /**
   * the model does not say how it comes apart: where its parts go when it is pulled
   * apart is the app's working out, from the pieces it is in
   */
  worked: boolean
  /**
   * pulled apart, it comes apart again: some piece of it is of more than one part,
   * which go their own ways when every part goes by itself
   */
  further: boolean
  /** not a model of the project's: the cube shown until it has one */
  standIn?: true
}

// glTF is Y-up metres; the model is Z-up millimetres
const TO_MODEL = new THREE.Matrix4()
  .makeRotationX(Math.PI / 2)
  .multiply(new THREE.Matrix4().makeScale(1000, 1000, 1000))

function float3(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
) {
  const out = new Float32Array(attribute.count * 3)
  const direct =
    !("isInterleavedBufferAttribute" in attribute) &&
    attribute.array instanceof Float32Array &&
    attribute.itemSize === 3
  if (direct) out.set(attribute.array.subarray(0, out.length))
  else {
    for (let i = 0; i < attribute.count; i++) {
      out[i * 3] = attribute.getX(i)
      out[i * 3 + 1] = attribute.getY(i)
      out[i * 3 + 2] = attribute.getZ(i)
    }
  }
  return new THREE.BufferAttribute(out, 3)
}

/** Position, normal and index only, moved into the part's frame, so faces can be joined. */
function plain(source: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", float3(source.attributes.position))
  if (source.attributes.normal)
    geometry.setAttribute("normal", float3(source.attributes.normal))
  const count = source.attributes.position.count
  geometry.setIndex(
    source.index
      ? Array.from(source.index.array)
      : Array.from({ length: count }, (_, i) => i)
  )
  geometry.applyMatrix4(matrix)
  if (!geometry.attributes.normal) geometry.computeVertexNormals()
  return geometry
}

/**
 * A mesh's triangles, shaded smooth where they meet at no more than a slight angle, as
 * the flats a curve was cut into do, and sharp where they meet at more, as at a corner.
 * Each triangle has corners of its own then, and is counted in order, as before.
 */
function creased(geometry: THREE.BufferGeometry) {
  const out = toCreasedNormals(geometry, (CREASE * Math.PI) / 180)
  geometry.dispose()
  const count = out.attributes.position.count
  out.setIndex(Array.from({ length: count }, (_, i) => i))
  return out
}

/** The colour a face came with, unless it is the loader's stand-in for "none given". */
function fileColor(
  material: THREE.Material | THREE.Material[]
): THREE.Color | null {
  const one = Array.isArray(material) ? material[0] : material
  const color = (one as THREE.MeshStandardMaterial).color
  if (!color || (color.getHex() === 0xffffff && !one.name)) return null
  return color.clone()
}

function join(
  scene: THREE.Object3D,
  part: Part
): { skins: Skin[]; faces: number } {
  scene.updateMatrixWorld(true)
  type Bucket = {
    color: THREE.Color | null
    faces: THREE.BufferGeometry[]
    faceOf: number[]
  }
  const buckets = new Map<string, Bucket>()
  let faces = 0

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const color = part.paint === "all" ? null : fileColor(mesh.material)
    const key = color ? color.getHexString() : "none"
    let bucket = buckets.get(key)
    if (!bucket) buckets.set(key, (bucket = { color, faces: [], faceOf: [] }))
    const flat = plain(
      mesh.geometry,
      TO_MODEL.clone().multiply(mesh.matrixWorld)
    )
    const geometry = part.mesh ? creased(flat) : flat
    const triangles = (geometry.index?.count ?? 0) / 3
    for (let i = 0; i < triangles; i++) bucket.faceOf.push(faces)
    bucket.faces.push(geometry)
    faces++
  })

  const skins: Skin[] = []
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.faces, false)
    for (const face of bucket.faces) face.dispose()
    if (!geometry)
      throw new Error(`The faces of "${part.label}" could not be joined.`)
    // indirect: leave the triangle order alone, since faceOf is indexed by it
    geometry.boundsTree = new MeshBVH(geometry, { indirect: true })
    geometry.computeBoundingBox()
    skins.push({
      geometry,
      color: bucket.color,
      faceOf: Uint32Array.from(bucket.faceOf),
    })
  }
  return { skins, faces }
}

/**
 * What is made of a part's files, whatever model it is in and wherever it is in it: its
 * meshes, and all that is worked out from them once. It is the same for the same files.
 */
type Made = Pick<
  LoadedPart,
  "skins" | "edges" | "contours" | "solid" | "box" | "faces"
>

/**
 * What has been made of parts' files, by what was in them, for as long as a model on
 * screen (or on its way) has the part: a rebuild mostly changes a part or two, and the
 * rest are not read and worked out all over again. Once no model has a part, its meshes
 * are done with.
 */
const made = sharing<Made>(({ skins }) => free(skins))
/** What each part's meshes are known by among those made, by its skins. */
const madeAs = new WeakMap<Skin[], string>()

/** What is in a file, as bytes: what a part's files are told apart by. */
async function bytesOf(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(
      `fetch for "${url}" responded with ${response.status}: ${response.statusText}`
    )
  return response.arrayBuffer()
}

/** A word for what is in some bytes, the same only for the same bytes. */
async function digestOf(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

async function loadPart(
  part: Part,
  url: (file: string) => string
): Promise<LoadedPart> {
  const [file, edges] = await Promise.all([
    bytesOf(url(part.file)),
    part.edges
      ? fetch(url(part.edges)).then(async (response) =>
          response.ok ? response.arrayBuffer() : null
        )
      : null,
  ])
  // the same files, read the same way, are the same meshes: a part that is as it was is
  // not read again, nor worked out
  const key = [
    await digestOf(file),
    edges ? await digestOf(edges) : "none",
    part.paint,
    part.mesh,
  ].join(" ")
  const {
    skins,
    faces,
    edges: lines,
    contours,
    solid,
    box,
  } = await made.take(key, () => makePart(part, file, edges, url(part.file)))
  madeAs.set(skins, key)
  const home = new THREE.Matrix4()
  if (part.matrix)
    home.set(...(part.matrix as Parameters<THREE.Matrix4["set"]>))
  const away = new THREE.Vector3(...part.explode)
  return {
    part,
    skins,
    edges: lines,
    contours,
    solid,
    turn: 0,
    boards: false,
    box: box.clone(),
    home,
    piece: 0,
    away,
    alone: away,
    faces,
  }
}

/** A part's meshes, read from what is in its file, and what is worked out from them. */
async function makePart(
  part: Part,
  file: ArrayBuffer,
  edges: ArrayBuffer | null,
  url: string
): Promise<Made> {
  const gltf = await new GLTFLoader().parseAsync(
    file,
    THREE.LoaderUtils.extractUrlBase(url)
  )
  const { skins, faces } = join(gltf.scene, part)
  const box = new THREE.Box3()
  for (const skin of skins)
    if (skin.geometry.boundingBox) box.union(skin.geometry.boundingBox)
  const exact = edges ? new Float32Array(edges) : null
  return {
    skins,
    faces,
    edges: exact ?? creases(skins),
    contours: contours(skins, exact !== null),
    solid: enclose(skins),
    box,
  }
}

/**
 * Whether a part's skins close a volume between them. Each is also told which way its
 * points go when the part is drawn in a little, which is how one part is found to be
 * inside another by more than the roughness of their surfaces.
 */
function enclose(skins: Skin[]): boolean {
  const { closed, inward } = shellOf(
    skins.map((skin) => ({
      position: skin.geometry.attributes.position.array,
      index: skin.geometry.index!.array,
    }))
  )
  skins.forEach((skin, index) =>
    skin.geometry.setAttribute(
      "inward",
      new THREE.BufferAttribute(inward[index], 3)
    )
  )
  return closed
}

/**
 * Has a part's faces ruled into squares (see ruled.ts): each corner is told where on its
 * face it is, and how many squares across that face is. It is done the first time the
 * part is drawn that way, and not before: most models never are.
 */
export function rule({ skins }: LoadedPart) {
  for (const { geometry, faceOf } of skins) {
    if (geometry.attributes.ruledAt) continue
    const { at, across } = ruledOf(
      geometry.attributes.position.array,
      geometry.index!.array,
      faceOf
    )
    geometry.setAttribute("ruledAt", new THREE.BufferAttribute(at, 3))
    geometry.setAttribute("ruledAcross", new THREE.BufferAttribute(across, 3))
  }
}

/** Two triangles that meet at more than this, in degrees, have an edge between them. */
const CREASE = 20

/**
 * Where a part's curved faces may show their outline. With the CAD's own edges to go
 * by, a surface is one of the part's faces: its edges are drawn already, and only the
 * lines within it are in question. Without them, it is as far as the triangles go on
 * meeting at no more than a slight angle, since the sharper meetings are drawn as edges.
 */
function contours(skins: Skin[], exact: boolean): Contours {
  const slight = Math.cos((CREASE * Math.PI) / 180)
  const runs = skins.map((skin) =>
    contoursOf(
      skin.geometry.attributes.position.array,
      skin.geometry.index!.array,
      exact
        ? (triangle, other) => skin.faceOf[triangle] === skin.faceOf[other]
        : (_, __, cos) => cos > slight
    )
  )
  return {
    ends: Float32Array.from(runs.flatMap((run) => run.ends)),
    ways: Float32Array.from(runs.flatMap((run) => run.ways)),
  }
}

/**
 * Edges for a part whose build did not supply any: wherever two triangles meet at more
 * than a slight angle. Not as exact as the CAD's own edges (a smooth blend between two
 * faces leaves no line), but enough to draw the part in outline.
 */
function creases(skins: Skin[]): Float32Array {
  const runs = skins.map((skin) => {
    const edges = new THREE.EdgesGeometry(skin.geometry, CREASE)
    const positions = edges.attributes.position.array as Float32Array
    edges.dispose()
    return positions
  })
  const all = new Float32Array(runs.reduce((sum, run) => sum + run.length, 0))
  let offset = 0
  for (const run of runs) {
    all.set(run, offset)
    offset += run.length
  }
  return all
}

/**
 * Where the surfaces of a part are, in the model, taken all together: the middle of
 * them, each triangle counting for its size, and how much of them there is.
 */
function surfaceOf(part: LoadedPart): { centre: THREE.Vector3; area: number } {
  // gone through once for a part's meshes, however often its model is put into pieces,
  // and wherever the part is: the same meshes may be another part's, somewhere else
  let known = surfaces.get(part.skins)
  if (!known) surfaces.set(part.skins, (known = measured(part)))
  return {
    centre: known.centre.clone().applyMatrix4(part.home),
    area: known.area,
  }
}
const surfaces = new WeakMap<Skin[], { centre: THREE.Vector3; area: number }>()

/** Where a part's surfaces are, in its own frame, and how much of them there is. */
function measured(part: LoadedPart): { centre: THREE.Vector3; area: number } {
  const centre = new THREE.Vector3()
  let area = 0
  const [a, b, c] = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]
  const [ab, ac] = [new THREE.Vector3(), new THREE.Vector3()]
  for (const { geometry } of part.skins) {
    const at = geometry.attributes.position
    const index = geometry.index
    const corners = index ? index.count : at.count
    for (let i = 0; i + 2 < corners; i += 3) {
      a.fromBufferAttribute(at, index ? index.getX(i) : i)
      b.fromBufferAttribute(at, index ? index.getX(i + 1) : i + 1)
      c.fromBufferAttribute(at, index ? index.getX(i + 2) : i + 2)
      const size = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2
      centre.addScaledVector(a.add(b).add(c), size / 3)
      area += size
    }
  }
  if (area > 0) centre.divideScalar(area)
  else part.box.getCenter(centre)
  return { centre, area }
}

/**
 * Load every part. `revision` is stamped on each request, so a rebuilt model is never
 * served from a stale copy.
 */
export async function loadModel(
  model: Model,
  baseUrl: string,
  revision: number,
  onProgress: (done: number, total: number) => void
): Promise<LoadedModel> {
  const url = (file: string) => `${baseUrl}${file}?r=${revision}`
  let done = 0
  onProgress(0, model.parts.length)
  const settled = await Promise.allSettled(
    model.parts.map(async (part) => {
      const loaded = await loadPart(part, url).catch((error: unknown) => {
        throw new Error(
          `Could not load "${part.label}" (${part.file}): ${error instanceof Error ? error.message : String(error)}`
        )
      })
      onProgress(++done, model.parts.length)
      return loaded
    })
  )
  // a model that could not all be loaded is not had at all, nor what was of it
  const failed = settled.find((one) => one.status === "rejected")
  if (failed) {
    for (const one of settled) if (one.status === "fulfilled") letGo(one.value)
    throw failed.reason
  }
  const parts = settled.map(
    (one) => (one as PromiseFulfilledResult<LoadedPart>).value
  )
  const boards = model.parts.some((part) => part.board !== null)
  for (const part of parts) {
    part.turn = Math.max(
      0,
      model.groups.findIndex((group) => group.id === part.part.group)
    )
    part.boards = boards
  }
  const box = new THREE.Box3()
  for (const part of parts) box.union(part.box.clone().applyMatrix4(part.home))
  const worked = parts.every((part) => part.away.lengthSq() === 0)
  const { pieces, ways, alone } = pieced(parts, model.groups, box, worked)
  parts.forEach((part, index) => {
    part.piece = pieces[index]
    if (ways) part.away.copy(ways[index])
    part.alone = alone ? alone[index] : part.away
  })
  return { model, parts, box, worked, further: alone !== null }
}

/**
 * How far a model that does not say how it comes apart is pulled apart to begin with, as
 * a share of how far it takes for every piece to be clear of every other: half of that.
 * Half way out the pieces are already seen to be what they are, and the model is not
 * yet all over the view: the slider takes it the rest of the way, and as far again.
 * (A model that says where its parts go is pulled apart to where it says.)
 */
const BEGUN = 0.5
const begun = (ways: THREE.Vector3[]) =>
  ways.map((way) => way.multiplyScalar(BEGUN))

/**
 * Which piece of the model each part is of, going by the groups the parts are in: and,
 * for a model that does not say how it comes apart (`worked`), where each part goes
 * when it is pulled apart. And where each goes when every part goes by itself (`alone`),
 * if that is anywhere else: it is, when some piece is of more than one part.
 */
function pieced(
  parts: LoadedPart[],
  groups: Group[],
  box: THREE.Box3,
  worked: boolean
): {
  pieces: number[]
  ways: THREE.Vector3[] | null
  alone: THREE.Vector3[] | null
} {
  // The parts of a group that are one object are a piece of the model (see apart.ts).
  const across = box.getSize(new THREE.Vector3()).length()
  const boxes = parts.map((part) => part.box.clone().applyMatrix4(part.home))
  const pieces = piecesOf(
    parts.map((part, index) => ({ group: part.part.group, box: boxes[index] })),
    groups,
    across
  )
  return worked
    ? { pieces, ...waysOf(parts, boxes, pieces, box) }
    : { pieces, ways: null, alone: null }
}

/**
 * Where each of these parts goes when they are pulled apart, as a model that does not say
 * how it comes apart is: out from the middle of the box round them (`box`), not part by
 * part, but piece by piece, each piece clear of the rest. A part goes as its piece. And
 * where each goes when every part goes by itself (`alone`), if that is anywhere else.
 * `boxes` is where each part is in the model.
 */
function waysOf(
  parts: LoadedPart[],
  boxes: THREE.Box3[],
  pieces: number[],
  box: THREE.Box3
): { ways: THREE.Vector3[]; alone: THREE.Vector3[] | null } {
  const across = box.getSize(new THREE.Vector3()).length()
  const middle = box.getCenter(new THREE.Vector3())
  // a piece is all of its parts: the box round them, and where their surfaces are,
  // each counting for as much as there is of it
  const wholes = new Map<
    number,
    { box: THREE.Box3; centre: THREE.Vector3; area: number }
  >()
  pieces.forEach((piece, index) => {
    const { centre, area } = surfaceOf(parts[index])
    const whole = wholes.get(piece)
    if (whole) {
      whole.box.union(boxes[index])
      whole.centre.addScaledVector(centre, area)
      whole.area += area
    } else
      wholes.set(piece, {
        box: boxes[index].clone(),
        centre: centre.multiplyScalar(area),
        area,
      })
  })
  for (const whole of wholes.values())
    if (whole.area > 0) whole.centre.divideScalar(whole.area)
    else whole.box.getCenter(whole.centre)
  const ways = begun(waysOut([...wholes.values()], middle, across))
  const way = new Map([...wholes.keys()].map((piece, n) => [piece, ways[n]]))
  const alone =
    wholes.size < parts.length
      ? begun(
          waysOut(
            parts.map((part, index) => ({
              box: boxes[index],
              centre: surfaceOf(part).centre,
            })),
            middle,
            across
          )
        )
      : null
  return {
    ways: pieces.map((piece) => way.get(piece)!.clone()),
    alone,
  }
}

/**
 * A model with its parts in other groups than it was loaded with: the groups, and the
 * group each part is in, by part. It is the same model, as it was loaded, but for what
 * follows from the groups: which parts are one piece, and where they go when the model
 * is pulled apart. A part is the very same one where none of that is any different for
 * it, so that nothing drawn of it is drawn again.
 */
export function regrouped(
  loaded: LoadedModel,
  groups: Group[],
  of: Map<string, string>
): LoadedModel {
  const placed = new Map(
    loaded.model.parts.map((part) => {
      const group = of.get(part.id) ?? part.group
      return [part.id, group === part.group ? part : { ...part, group }]
    })
  )
  const model = {
    ...loaded.model,
    groups,
    parts: loaded.model.parts.map((part) => placed.get(part.id)!),
  }
  const moved = loaded.parts.map((part) => {
    const now = placed.get(part.part.id) ?? part.part
    return now === part.part ? part : { ...part, part: now }
  })
  const { pieces, ways, alone } = pieced(
    moved,
    groups,
    loaded.box,
    loaded.worked
  )
  const parts = moved.map((part, index) => {
    const away =
      ways && !ways[index].equals(part.away) ? ways[index] : part.away
    const own = !alone
      ? away
      : alone[index].equals(part.alone)
        ? part.alone
        : alone[index]
    return part.piece === pieces[index] &&
      away === part.away &&
      own === part.alone
      ? part
      : { ...part, piece: pieces[index], away, alone: own }
  })
  return { ...loaded, model, parts, further: alone !== null }
}

/**
 * A model as it comes apart with every part going by itself, and not with the rest of
 * its piece: the same model, but for where its parts go when it is pulled apart. A part
 * that goes the same way either way is the very same one.
 */
export function eachAlone(loaded: LoadedModel): LoadedModel {
  if (!loaded.further) return loaded
  return {
    ...loaded,
    parts: loaded.parts.map((part) =>
      part.alone.equals(part.away) ? part : { ...part, away: part.alone }
    ),
  }
}

/**
 * A model as it comes apart with only some of it on show: what is on show is pulled apart
 * by itself, out from its own middle, each piece clear of the rest of what is on show and
 * not of what is out of sight. Pulled apart about all of it, a model with something put
 * out of sight that reaches far from the rest, a cord with its plug, would come apart
 * about a middle out in the air, and what is left would all go off to one side. What is
 * out of sight goes nowhere. A model that says where its parts go goes there, whatever of
 * it is on show, and one that is all on show, or none of it, is the very same model. A
 * part that goes where it went is the very same one.
 */
export function apartAsShown(
  loaded: LoadedModel,
  shown: (part: LoadedPart) => boolean
): LoadedModel {
  if (!loaded.worked) return loaded
  const on = loaded.parts.filter(shown)
  if (on.length === 0 || on.length === loaded.parts.length) return loaded
  const boxes = on.map((part) => part.box.clone().applyMatrix4(part.home))
  const box = boxes.reduce((all, one) => all.union(one), new THREE.Box3())
  const pieces = on.map((part) => part.piece)
  const { ways, alone } = waysOf(on, boxes, pieces, box)
  const at = new Map(on.map((part, index) => [part, index]))
  const parts = loaded.parts.map((part) => {
    const index = at.get(part)
    const away = index === undefined ? new THREE.Vector3() : ways[index]
    const own = index === undefined || !alone ? away : alone[index]
    return away.equals(part.away) && own.equals(part.alone)
      ? part
      : { ...part, away, alone: own }
  })
  return { ...loaded, parts, further: alone !== null }
}

/**
 * The surfaces in some glTF files, joined into one mesh in model mm with Z up: what a
 * thing is drawn from that is only looked at, with no parts to it and no faces to be
 * told apart. A reference scene is one.
 *
 * Every corner says which thing in the files it is of (`thing`), by number: a leg of a
 * table, its top (see things.ts). Nothing in one file is of a thing in another. And it
 * says whether that thing is all rounded, with no sharp edge anywhere on it (`soft`, 1
 * where it is): the figure of a person.
 */
export async function loadSurfaces(
  urls: string[]
): Promise<THREE.BufferGeometry> {
  const scenes = await Promise.all(
    urls.map((url) => new GLTFLoader().loadAsync(url))
  )
  const faces: THREE.BufferGeometry[] = []
  let things = 0
  for (const { scene } of scenes) {
    const own: THREE.BufferGeometry[] = []
    scene.updateMatrixWorld(true)
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.isMesh)
        own.push(
          plain(mesh.geometry, TO_MODEL.clone().multiply(mesh.matrixWorld))
        )
    })
    const of = thingsOf(own.map((face) => face.attributes.position.array))
    const sharp = sharpOf(
      own.map((face) => ({
        corners: face.attributes.position.array,
        facing: face.attributes.normal.array,
      })),
      of
    )
    const each = (face: THREE.BufferGeometry, value: number) =>
      new THREE.Float32BufferAttribute(
        new Float32Array(face.attributes.position.count).fill(value),
        1
      )
    own.forEach((face, index) => {
      face.setAttribute("thing", each(face, things + of[index]))
      face.setAttribute("soft", each(face, sharp.has(of[index]) ? 0 : 1))
    })
    things += new Set(of).size
    faces.push(...own)
  }
  const geometry = mergeGeometries(faces, false)
  for (const face of faces) face.dispose()
  if (!geometry) throw new Error("There is nothing in the files to draw.")
  geometry.computeBoundingBox()
  return geometry
}

/** How big the cube shown for a project with no model is, in mm a side. */
const STAND_IN = 40

/**
 * What a project with no model yet is shown as: a plain cube standing on the ground, the
 * way a 3D program opens. It is in no file. The first model built in the folder takes
 * its place.
 */
export function standInModel(): LoadedModel {
  const geometry = new THREE.BoxGeometry(STAND_IN, STAND_IN, STAND_IN)
  geometry.translate(0, 0, STAND_IN / 2)
  geometry.computeBoundingBox()
  geometry.boundsTree = new MeshBVH(geometry, { indirect: true })
  // a box is drawn as two triangles a side
  const skin: Skin = {
    geometry,
    color: null,
    faceOf: Uint32Array.from({ length: 12 }, (_, triangle) => triangle >> 1),
  }
  const part: Part = {
    id: "stand-in",
    label: "Cube",
    group: "stand-in",
    file: "",
    edges: null,
    // a plain grey: it is nothing yet, and is not to look like something
    color: "#aeb2b9",
    paint: "all",
    matrix: null,
    explode: [0, 0, 0],
    metal: false,
    clear: false,
    mesh: false,
    board: null,
  }
  const box = geometry.boundingBox!.clone()
  const nowhere = new THREE.Vector3()
  // The view frames a model's box closely. Left to that the cube would fill the window,
  // so it is given room: something to look at in the middle, not a wall.
  const stage = box.clone().expandByScalar(STAND_IN * 0.75)
  return {
    standIn: true,
    worked: false,
    model: {
      title: null,
      reference: null,
      parts: [part],
      groups: [{ id: "stand-in", label: "Nothing made yet", shell: false }],
      keepouts: [],
      keepoutsLabel: "",
      downloads: [],
    },
    parts: [
      {
        part,
        skins: [skin],
        edges: creases([skin]),
        contours: contours([skin], false),
        solid: enclose([skin]),
        turn: 0,
        boards: false,
        box,
        home: new THREE.Matrix4(),
        piece: 0,
        away: nowhere,
        alone: nowhere,
        faces: 6,
      },
    ],
    box: stage,
    further: false,
  }
}

/** The models done with already: one is let go of once, however often it is told to be. */
const disposed = new WeakSet<LoadedModel>()

/**
 * Be done with a model: each of its parts' meshes is freed once no other model on
 * screen, or on its way, has them too (see made).
 */
export function disposeModel(loaded: LoadedModel) {
  if (disposed.has(loaded)) return
  disposed.add(loaded)
  for (const part of loaded.parts) letGo(part)
}

/** Let go of a part's meshes: freed now, if they were made for it alone, as the cube's are. */
function letGo(part: LoadedPart) {
  const key = madeAs.get(part.skins)
  if (key !== undefined) made.give(key)
  else free(part.skins)
}

function free(skins: Skin[]) {
  for (const skin of skins) {
    skin.geometry.boundsTree = undefined
    skin.geometry.dispose()
  }
}
