// The model in a guide's page: its parts, drawn as the app draws them, going on as the
// guide is gone through.
//
// The parts are the model's own files, the ones the app's view loads, and are drawn the
// same way: in the app's colours, with the lines of their edges over them, under the
// same lights. What a step puts on is lit, as a part picked out in the app is; what is on
// already is quieter; and before the first step, and after the last, the thing is in its
// own colours. Where each part is, and how much of it, is all worked out from how far
// through the guide the page is (see standing.ts).
//
// A step is drawn with what it is done to and no more. Mostly that is the thing itself,
// as far as it has got. But something that is made up apart before it goes on, as a
// gear is on its shaft, is drawn alone while it is: the rest is out of sight, and it
// fills the window. Then it goes on, whole, as a part does.
//
// It is looked at as a blueprint draws it: with no lens, so that nothing is smaller for
// being further off, and from one of its corners, with three of its sides turned
// equally to the eye. And it is as big as the room it has lets it be: what is on so far
// fills that room, so the first part is seen close to, and the view draws back as the
// rest go on.
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

import { UNDER_FROM, underlit } from "@/components/viewport/light"
import { EDGE, finish, skinColour } from "@/components/viewport/paint"
import { readModel, type Model, type Part } from "@/lib/model"
import type { Looks, Vec3 } from "@shared/api"
import { partsIn, scenesOf, type Guide } from "@shared/assembly-format"
import { comingFrom } from "./coming"
import { CORNER, seenFrom } from "./seen"
import { standing, stoodIn, towards, type Stand } from "./standing"

/** How much of the room it has, across and down, what is on so far is made to fill. */
const FILLS = 0.78
/**
 * The least that is framed, as a share of how far across the whole thing is: a first
 * part that is very small beside the rest is not made to fill the window.
 */
const LEAST = 0.18
/**
 * How long a step takes to go on, in seconds; the view to come round to a step's
 * corner; and to draw back, or come up, to what is on.
 */
const STEP_TAKES = 0.9
const TURN_TAKES = 0.28
const FITS_TAKES = 0.35
/** How far the view turns under a pull, in radians a pixel; and how close it is let get, and how far. */
const PULL = 0.006
const NEAR = { most: 4, least: 0.5 }
/** What a part that is on already is drawn in: its own colour, most of the way to this. */
const QUIET = { towards: new THREE.Color("#3c3e42"), by: 0.72 }
/** What a part the step is about is drawn in, and how much of its own light it gives off. */
const LIT = { colour: new THREE.Color("#ffffff"), glow: 0.3 }
/** How strong the lines of a part are: of one on already, and of one that is lit. */
const LINES = { quiet: 0.55, plain: 0.85 }
/**
 * How strongly the lines of a part that is lit show through whatever is in front of it:
 * a part that goes on inside the rest is still seen to go on, and where.
 */
const THROUGH = 0.22
/** Two triangles that meet at more than this, in degrees, have an edge between them. */
const CREASE = 20

// glTF is Y-up metres; the model is Z-up millimetres
const TO_MODEL = new THREE.Matrix4()
  .makeRotationX(Math.PI / 2)
  .multiply(new THREE.Matrix4().makeScale(1000, 1000, 1000))
/** The model's frame as the scene has it: its Z is up, and the scene's Y. */
const toWorld = ([x, y, z]: Vec3) => new THREE.Vector3(x, z, -y)

/** One of the model's files: handed to the page with it, or asked for from beside it. */
async function fileOf(name: string): Promise<ArrayBuffer> {
  const handed = window.ENCLOSE_FILES?.[name]
  if (handed !== undefined) {
    const read = atob(handed)
    const bytes = new Uint8Array(read.length)
    for (let i = 0; i < read.length; i++) bytes[i] = read.charCodeAt(i)
    return bytes.buffer
  }
  const response = await fetch(
    `model/${name.split("/").map(encodeURIComponent).join("/")}`
  )
  if (!response.ok) throw new Error(`${name}: ${response.status}`)
  return response.arrayBuffer()
}

/** The colour a face came with, unless it is the loader's stand-in for "none given". */
function fileColour(
  material: THREE.Material | THREE.Material[]
): THREE.Color | null {
  const one = Array.isArray(material) ? material[0] : material
  const colour = (one as THREE.MeshStandardMaterial).color
  if (!colour || (colour.getHex() === 0xffffff && !one.name)) return null
  return colour.clone()
}

/** Three numbers to a corner, as plain ones, however the file packs them. */
function float3(
  from: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
) {
  const out = new Float32Array(from.count * 3)
  for (let i = 0; i < from.count; i++) {
    out[i * 3] = from.getX(i)
    out[i * 3 + 1] = from.getY(i)
    out[i * 3 + 2] = from.getZ(i)
  }
  return new THREE.BufferAttribute(out, 3)
}

/** The faces of a part that share a colour, joined into one mesh, in the model's own measure. */
function skinsOf(scene: THREE.Object3D, part: Part) {
  scene.updateMatrixWorld(true)
  const sorted = new Map<
    string,
    { color: THREE.Color | null; faces: THREE.BufferGeometry[] }
  >()
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const color = part.paint === "all" ? null : fileColour(mesh.material)
    const key = color ? color.getHexString() : "none"
    let same = sorted.get(key)
    if (!same) sorted.set(key, (same = { color, faces: [] }))
    // position, normal and index only, so that faces written differently can be joined
    const { position, normal } = mesh.geometry.attributes
    const face = new THREE.BufferGeometry()
    face.setAttribute("position", float3(position))
    if (normal) face.setAttribute("normal", float3(normal))
    face.setIndex(
      mesh.geometry.index
        ? Array.from(mesh.geometry.index.array)
        : Array.from({ length: position.count }, (_, i) => i)
    )
    face.applyMatrix4(TO_MODEL.clone().multiply(mesh.matrixWorld))
    if (!normal) face.computeVertexNormals()
    same.faces.push(face)
  })
  return [...sorted.values()].flatMap(({ color, faces }) => {
    const geometry = mergeGeometries(faces, false)
    for (const face of faces) face.dispose()
    return geometry ? [{ geometry, color }] : []
  })
}

/** A part as the page draws it. */
type Shown = {
  /** how it is in each step: out of sight, on already, or what the step puts on */
  stands: Stand[]
  /** all of it, where the model has it: what is moved when it is on its way in */
  whole: THREE.Group
  home: THREE.Matrix4
  /** the corners of the room it takes up, as the scene has them: what it is fitted to the view by */
  corners: THREE.Vector3[]
  /** where the model says it goes when it is pulled apart, mm: nowhere, if it does not say */
  away: THREE.Vector3
  /**
   * Where it comes from, in each step that brings it, as how far that is from its
   * place, mm (see comingFrom). A part of something made up apart comes twice: on to
   * that, and with it on to what that is fitted to.
   */
  comes: Map<number, THREE.Vector3>
  /** the room it takes up, in the model, where the model has it */
  box: THREE.Box3
  surfaces: {
    material: THREE.MeshStandardMaterial
    /** its colour as the app draws it, and that colour as it is on a part that is quiet */
    own: THREE.Color
    quiet: THREE.Color
  }[]
  lines: THREE.LineBasicMaterial
  /** the same lines again, as they show through what is in front of the part */
  through: THREE.LineBasicMaterial
  /** made of something clear: seen through, however it stands */
  clear: boolean
}

/** How see-through a part made of something clear is. */
const CLEAR = 0.28

async function shownOf(
  part: Part,
  turn: number,
  /** the model has a circuit board in it (see paint.ts) */
  boards: boolean,
  chosen: string | null,
  stands: Stand[]
): Promise<Shown> {
  const [gltf, edges] = await Promise.all([
    fileOf(part.file).then((file) => new GLTFLoader().parseAsync(file, "")),
    part.edges
      ? fileOf(part.edges).then(
          (file) => new Float32Array(file),
          () => null
        )
      : null,
  ])
  const skins = skinsOf(gltf.scene, part)
  const whole = new THREE.Group()
  whole.matrixAutoUpdate = false
  const box = new THREE.Box3()
  const lines = new THREE.LineBasicMaterial({
    color: EDGE,
    transparent: true,
    opacity: LINES.plain,
  })
  const through = new THREE.LineBasicMaterial({
    color: LIT.colour,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  })
  /** Its lines, drawn as they are and again as they show through the rest. */
  const lined = (geometry: THREE.BufferGeometry) => {
    const seen = new THREE.LineSegments(geometry, through)
    seen.renderOrder = 1
    whole.add(new THREE.LineSegments(geometry, lines), seen)
  }
  const surfaces = skins.map(({ geometry, color }) => {
    const own = skinColour({ part, turn, boards }, { color }, true, chosen)
    const material = new THREE.MeshStandardMaterial({
      color: own,
      ...finish({ part }),
      side: THREE.DoubleSide,
      emissive: LIT.colour,
      emissiveIntensity: 0,
      // behind its own lines, which are drawn where its surfaces are
      polygonOffset: true,
      polygonOffsetFactor: 1.5,
      polygonOffsetUnits: 1.5,
    })
    whole.add(new THREE.Mesh(geometry, material))
    geometry.computeBoundingBox()
    box.union(geometry.boundingBox!)
    if (!edges) lined(new THREE.EdgesGeometry(geometry, CREASE))
    return {
      material,
      own,
      quiet: own.clone().lerp(QUIET.towards, QUIET.by),
    }
  })
  if (edges) {
    const drawn = new THREE.BufferGeometry()
    drawn.setAttribute("position", new THREE.BufferAttribute(edges, 3))
    lined(drawn)
  }
  const home = new THREE.Matrix4()
  if (part.matrix)
    home.set(...(part.matrix as Parameters<THREE.Matrix4["set"]>))
  whole.matrix.copy(home)
  box.applyMatrix4(home)
  return {
    stands,
    whole,
    home,
    corners: [0, 1, 2, 3, 4, 5, 6, 7].map((corner) =>
      toWorld([
        corner & 1 ? box.max.x : box.min.x,
        corner & 2 ? box.max.y : box.min.y,
        corner & 4 ? box.max.z : box.min.z,
      ])
    ),
    away: new THREE.Vector3(...part.explode),
    comes: new Map(),
    box,
    surfaces,
    lines,
    through,
    clear: part.clear,
  }
}

/** The room the model has to itself in the page, as how much of each edge is taken up, in px. */
export type Room = { left: number; top: number; right: number; bottom: number }

export type Stage = {
  /** Go to a place in the guide (see standing.ts): at once, or going on through it. */
  go(to: number, atOnce?: boolean): void
  /** The room the model has to itself, when that changes. */
  give(room: Room): void
  /**
   * Put the view back as the page has it: looked at from where the step shown is, as
   * near as fits it, and in the middle of its room.
   */
  again(): void
  /** Have done with it. */
  close(): void
}

/**
 * Draw a guide's model on a canvas. `progress` hears how many of its parts are loaded,
 * of how many, as they come. The parts are all there by the time this resolves.
 * `byHand` hears whether the view is as a hand has left it, turned, moved across or
 * brought nearer, and not as the page has it: each time that comes to be so, or no
 * longer.
 */
export async function stageOf(
  canvas: HTMLCanvasElement,
  told: { guide: Guide; model: unknown; looks: Looks },
  progress: (done: number, total: number) => void,
  byHand: (changed: boolean) => void
): Promise<Stage> {
  const { guide, looks } = told
  let model: Model | null = null
  try {
    model = readModel(told.model)
  } catch {
    // a model with none of the guide's parts left in it: the steps are still to be read
  }
  const steps = guide.steps.length
  const scenes = scenesOf(guide)
  const { stands, cuts } = stoodIn(guide)
  const ids = new Set(partsIn(guide))
  const wanted = (model?.parts ?? []).filter((part) => ids.has(part.id))

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight("#ffffff", 0.55))
  scene.add(new THREE.HemisphereLight("#ffffff", "#7d828c", 0.7))
  const sun = new THREE.DirectionalLight("#ffffff", 1.7)
  sun.position.set(180, 320, 220)
  const fill = new THREE.DirectionalLight("#ffffff", 0.55)
  fill.position.set(-240, 160, -180)
  // and from under it, once it is looked up at from below (see light.ts)
  const under = new THREE.DirectionalLight("#ffffff", 0)
  under.position.set(...UNDER_FROM)
  scene.add(sun, fill, under)
  // everything in here is in the model's own measure, mm with Z up
  const root = new THREE.Group()
  root.rotation.set(-Math.PI / 2, 0, 0)
  scene.add(root)

  let done = 0
  progress(0, wanted.length)
  const shown = new Map<string, Shown>()
  const boards = model!.parts.some((part) => part.board !== null)
  await Promise.all(
    wanted.map(async (part) => {
      // its group's place among the groups: what gives a part with no colour one
      const turn = Math.max(
        0,
        model!.groups.findIndex((group) => group.id === part.group)
      )
      try {
        const one = await shownOf(
          part,
          turn,
          boards,
          looks.colours[part.id] ?? null,
          stands.get(part.id) ?? []
        )
        shown.set(part.id, one)
        root.add(one.whole)
      } catch (error) {
        console.warn(`"${part.label}" could not be loaded.`, error)
      }
      progress(++done, wanted.length)
    })
  )

  const all = new THREE.Box3()
  for (const part of shown.values()) all.union(part.box)
  if (all.isEmpty()) all.set(new THREE.Vector3(), new THREE.Vector3())
  const across = all.getSize(new THREE.Vector3()).length()
  const radius = Math.max(across / 2, 1)
  const middle = toWorld(all.getCenter(new THREE.Vector3()).toArray())
  comingFrom(guide, scenes, shown, across)

  // No lens: a length is the same length wherever it is, as on a drawing.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, radius * 40)
  /** where the eye is, round what it looks at: and where it is on its way to */
  const eye = new THREE.Spherical().setFromVector3(toWorld(CORNER))
  const bound = new THREE.Spherical().copy(eye)
  let near = 1
  let room: Room = { left: 0, top: 0, right: 0, bottom: 0 }
  /** what is in the middle of the room the model has, and how many pixels there are to a mm */
  const aim = { middle: middle.clone(), scale: 1 }
  /** it is to be so at once, and not come to be: the page has only just been laid out */
  let settled = false

  /** where the guide is, and where it is going */
  let at = -1
  let to = -1
  let dirty = true
  /** where the pointer is, held down on the view: and whether it is moving it across, and not turning it */
  let pulled: { x: number; y: number; across: boolean } | null = null
  /** how far the model has been moved across the window by hand, in px */
  const moved = new THREE.Vector2()
  /** and whether it is on its way back to where the page has it */
  let returning = false
  /** it has been turned by hand since it was last looked at from where a step asks */
  let turned = false
  /** what was last said of its being as a hand left it */
  let changed = false
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  /** The room the model has, in px: how big it is, and where its middle is from the window's. */
  const free = () => ({
    wide: Math.max(1, window.innerWidth - room.left - room.right),
    high: Math.max(1, window.innerHeight - room.top - room.bottom),
    across: (room.left - room.right) / 2,
    down: (room.top - room.bottom) / 2,
  })

  const size = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    dirty = true
  }

  // which way the eye is from what it looks at, and what is to its right and up from there
  const back = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const UP = new THREE.Vector3(0, 1, 0)
  const facing = () => {
    back.setFromSphericalCoords(1, eye.phi, eye.theta)
    right.crossVectors(UP, back).normalize()
    up.crossVectors(back, right)
  }

  /**
   * What is seen at a place in the guide, fitted to the room the model has, as it is
   * looked at now: what goes in the middle of that room, and how many pixels to a mm
   * make it fill it. In a step that is what the step is done to, with what it puts on;
   * before the steps, and after them, it is all of the thing.
   */
  const fitted = (place: number) => {
    const step = place < 0 || place >= steps ? null : Math.round(place)
    const seen = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
    let deep = 0
    let counted = 0
    for (const part of shown.values()) {
      if (step !== null && part.stands[step] === "away") continue
      for (const corner of part.corners) {
        const [x, y] = [corner.dot(right), corner.dot(up)]
        seen.x0 = Math.min(seen.x0, x)
        seen.x1 = Math.max(seen.x1, x)
        seen.y0 = Math.min(seen.y0, y)
        seen.y1 = Math.max(seen.y1, y)
        deep += corner.dot(back)
        counted++
      }
    }
    if (counted === 0) return { middle, scale: aim.scale }
    const least = across * LEAST
    const { wide, high } = free()
    return {
      middle: new THREE.Vector3()
        .addScaledVector(right, (seen.x0 + seen.x1) / 2)
        .addScaledVector(up, (seen.y0 + seen.y1) / 2)
        .addScaledVector(back, deep / counted),
      scale:
        FILLS *
        Math.min(
          wide / Math.max(seen.x1 - seen.x0, least),
          high / Math.max(seen.y1 - seen.y0, least)
        ),
    }
  }

  const draw = () => {
    // the step that is under way: the one whose parts are on their way in
    const bringing = Math.floor(at) + 1
    for (const part of shown.values()) {
      const { there, out, lit, own } = standing(at, part.stands, cuts)
      part.whole.visible = there > 0.01
      if (!part.whole.visible) continue
      part.whole.matrix.copy(part.home)
      const comes = out > 0 ? part.comes.get(bringing) : undefined
      if (comes) {
        part.whole.matrix.elements[12] += comes.x * out
        part.whole.matrix.elements[13] += comes.y * out
        part.whole.matrix.elements[14] += comes.z * out
      }
      // lit is for what a step is about: the thing whole has nothing picked out of it
      const light = lit * (1 - own)
      const through = there * (part.clear ? CLEAR : 1)
      for (const surface of part.surfaces) {
        surface.material.color
          .copy(surface.quiet)
          .lerp(surface.own, own)
          .lerp(LIT.colour, light)
        surface.material.emissiveIntensity = LIT.glow * light
        surface.material.opacity = through
        // (seen through, it hides nothing that is behind it)
        surface.material.transparent = through < 1
        surface.material.depthWrite = through >= 1
      }
      part.lines.opacity =
        there * (LINES.quiet + (LINES.plain - LINES.quiet) * Math.max(own, lit))
      part.through.opacity = there * light * THROUGH
      part.through.visible = part.through.opacity > 0.005
    }
    // The window is so many mm across, at this many pixels to one. What is aimed at
    // is in the middle of the room the model has, which is not the middle of the
    // window: the eye stands that much to one side of it.
    const scale = aim.scale * near
    const { across: over, down: lower } = free()
    camera.right = window.innerWidth / (2 * scale)
    camera.left = -camera.right
    camera.top = window.innerHeight / (2 * scale)
    camera.bottom = -camera.top
    camera.updateProjectionMatrix()
    camera.position
      .copy(aim.middle)
      .addScaledVector(right, -(over + moved.x) / scale)
      .addScaledVector(up, (lower + moved.y) / scale)
      .addScaledVector(back, radius * 20)
    camera.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, back)
    )
    under.intensity = underlit(camera)
    renderer.render(scene, camera)
  }

  let last = performance.now()
  let frame = 0
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    const seconds = Math.min(0.1, (now - last) / 1000)
    last = now
    if (at !== to) {
      at = still ? to : towards(at, to, seconds, STEP_TAKES)
      dirty = true
    }
    // the eye comes round to where it is bound for, the short way, and slows into it
    if (!pulled && (eye.theta !== bound.theta || eye.phi !== bound.phi)) {
      const share = still || !settled ? 1 : 1 - Math.exp(-seconds / TURN_TAKES)
      const round = Math.atan2(
        Math.sin(bound.theta - eye.theta),
        Math.cos(bound.theta - eye.theta)
      )
      const down = bound.phi - eye.phi
      if (share === 1 || Math.abs(round) + Math.abs(down) < 1e-3) {
        eye.theta = bound.theta
        eye.phi = bound.phi
      } else {
        eye.theta += round * share
        eye.phi += down * share
      }
      dirty = true
    }
    // And it draws back from what is on, or comes up to it, the same way: to where
    // that fills the room it has, from wherever it is looked at.
    facing()
    const fit = fitted(to)
    const off =
      Math.abs(Math.log(fit.scale / aim.scale)) +
      (aim.middle.distanceTo(fit.middle) * fit.scale) / window.innerHeight
    if (off > 0) {
      const share = still || !settled ? 1 : 1 - Math.exp(-seconds / FITS_TAKES)
      if (share === 1 || off < 1e-3) {
        aim.scale = fit.scale
        aim.middle.copy(fit.middle)
      } else {
        aim.scale *= (fit.scale / aim.scale) ** share
        aim.middle.lerp(fit.middle, share)
      }
      dirty = true
    }
    // What was moved across by hand goes back to its place the same way, once
    // another step is gone to, or it is asked to.
    if (returning && !pulled) {
      const share = still ? 1 : 1 - Math.exp(-seconds / FITS_TAKES)
      if (share === 1 || moved.length() < 0.5) {
        moved.set(0, 0)
        returning = false
      } else moved.multiplyScalar(1 - share)
      dirty = true
    }
    settled = true
    const left = turned || near !== 1 || (!returning && moved.lengthSq() > 0.25)
    if (left !== changed) byHand((changed = left))
    if (!dirty) return
    dirty = false
    draw()
  }

  /** Where a place in the guide is looked at from, as the scene has it (see seen.ts). */
  const viewFor = (place: number) => toWorld(seenFrom(guide.steps, place))

  /** where the step shown is looked at from, as the page has it */
  let shownFrom = viewFor(-1)

  // The view is turned by taking hold of it: and stays as it was turned until a step
  // is gone to that is to be seen from somewhere else. With Shift held as it is taken
  // hold of, it is moved across the window instead, as the app's own view is: and
  // stays where it was moved to until another step is gone to.
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return
    pulled = { x: event.clientX, y: event.clientY, across: event.shiftKey }
    canvas.setPointerCapture(event.pointerId)
    canvas.classList.add("pulled")
  }
  const move = (event: PointerEvent) => {
    if (!pulled) return
    const [over, lower] = [event.clientX - pulled.x, event.clientY - pulled.y]
    if (pulled.across) {
      moved.x += over
      moved.y += lower
      returning = false
    } else {
      eye.theta -= over * PULL
      eye.phi = THREE.MathUtils.clamp(
        eye.phi - lower * PULL,
        0.02,
        Math.PI - 0.02
      )
      bound.copy(eye)
      turned = true
    }
    pulled.x = event.clientX
    pulled.y = event.clientY
    dirty = true
  }
  const letGo = () => {
    pulled = null
    canvas.classList.remove("pulled")
  }
  // The pointer says which a pull would do, while it is over the view.
  const held = (event: KeyboardEvent) =>
    canvas.classList.toggle("across", event.shiftKey)
  const unheld = () => canvas.classList.remove("across")
  /** The view as the page has it again: where it looks from, how near, and in the middle of its room. */
  const again = () => {
    bound.setFromVector3(shownFrom)
    bound.phi = THREE.MathUtils.clamp(bound.phi, 0.02, Math.PI - 0.02)
    turned = false
    near = 1
    returning = true
    dirty = true
  }
  // A wheel goes through the guide, which is the page's: with the key held that a
  // pinch comes with, it brings the model nearer.
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    near = THREE.MathUtils.clamp(
      near * Math.exp(-event.deltaY * 0.01),
      NEAR.least,
      NEAR.most
    )
    dirty = true
  }
  canvas.addEventListener("pointerdown", down)
  canvas.addEventListener("pointermove", move)
  canvas.addEventListener("pointerup", letGo)
  canvas.addEventListener("pointercancel", letGo)
  canvas.addEventListener("wheel", wheel, { passive: false })
  window.addEventListener("keydown", held)
  window.addEventListener("keyup", held)
  window.addEventListener("blur", unheld)
  window.addEventListener("resize", size)
  size()
  frame = requestAnimationFrame(tick)

  return {
    go(place, atOnce = false) {
      // (what was moved across by hand was moved to see this step, and not the next)
      if (place !== to) returning = true
      to = place
      if (atOnce) at = place
      const view = viewFor(place)
      // (a step that asks for the view the last one had leaves it as the hand turned it)
      if (!view.equals(shownFrom)) {
        shownFrom = view
        bound.setFromVector3(view)
        bound.phi = THREE.MathUtils.clamp(bound.phi, 0.02, Math.PI - 0.02)
        turned = false
      }
      // (where it is to be so at once, it is at the next time it is drawn)
      if (atOnce) settled = false
      dirty = true
    },
    give(given) {
      room = given
      size()
    },
    again,
    close() {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", size)
      canvas.removeEventListener("pointerdown", down)
      canvas.removeEventListener("pointermove", move)
      canvas.removeEventListener("pointerup", letGo)
      canvas.removeEventListener("pointercancel", letGo)
      canvas.removeEventListener("wheel", wheel)
      window.removeEventListener("keydown", held)
      window.removeEventListener("keyup", held)
      window.removeEventListener("blur", unheld)
      renderer.dispose()
    },
  }
}
