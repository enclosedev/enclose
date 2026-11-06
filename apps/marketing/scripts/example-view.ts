import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EDGE, IN_TURN, METAL, PALETTE } from '../components/app/view'
import { REST } from '../components/app/look'

// One of the app's example models (the repo's examples/<name>/build), drawn as the
// page's view draws the arm (components/app/view.ts): its parts in the palette's colours,
// as the app gives them, their edges inked over them, lit the same way, from where the
// app's Home looks. For scripts/renders.ts, which runs it in Chrome; it is not on the site.

type Manifest = {
  groups: { id: string }[]
  parts: {
    id: string
    group: string
    color?: string
    finish?: 'metal' | 'glass'
    board?: string
    file: string
    edges?: string
  }[]
}

// glTF is Y-up metres; the model is Z-up millimetres (as the app reads it)
const TO_MODEL = new THREE.Matrix4()
  .makeRotationX(Math.PI / 2)
  .multiply(new THREE.Matrix4().makeScale(1000, 1000, 1000))
const RADIANS = Math.PI / 180
const FOV = 30
/** How much of the picture the model's sphere takes up, across. */
const FILL = 0.78

/** A square canvas `size` px a side, lit as the view is, and inked: what is put in it is drawn. */
function stage(size: number, line: number) {
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setPixelRatio(1)
  renderer.setSize(size, size, false)

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight('#ffffff', 0.55))
  scene.add(new THREE.HemisphereLight('#ffffff', '#7d828c', 0.7))
  const key = new THREE.DirectionalLight('#ffffff', 1.7)
  const fill = new THREE.DirectionalLight('#ffffff', 0.55)
  scene.add(key, fill)

  const ink = new LineMaterial({
    color: EDGE,
    linewidth: line,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    resolution: new THREE.Vector2(size, size),
  })
  const box = new THREE.Box3()

  /** From where the app's Home looks, the whole of what is in it filling the picture. */
  const frame = () => {
    const middle = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2
    const camera = new THREE.PerspectiveCamera(FOV, 1, radius * 0.1, radius * 20)
    camera.up.set(0, 0, 1)
    const around = REST.azimuth * RADIANS
    const above = REST.elevation * RADIANS
    const eye = new THREE.Vector3(Math.cos(around) * Math.cos(above), Math.sin(around) * Math.cos(above), Math.sin(above))
    const distance = radius / FILL / Math.sin((FOV / 2) * RADIANS)
    camera.position.copy(middle).addScaledVector(eye, distance)
    camera.lookAt(middle)
    // lit from over the eye's left shoulder, and a little from behind on the right (view.ts)
    const right = new THREE.Vector3().crossVectors(eye, camera.up).normalize()
    key.position.copy(eye).multiplyScalar(0.7).addScaledVector(right, 0.5).add(new THREE.Vector3(0, 0, 0.9))
    fill.position.copy(eye).multiplyScalar(-0.6).addScaledVector(right, -0.7).add(new THREE.Vector3(0, 0, 0.4))
    camera.updateMatrixWorld()
    return camera
  }
  const shoot = () => {
    renderer.render(scene, frame())
    return canvas
  }
  return { scene, ink, box, shoot, frame, renderer }
}

/** A surface of the palette's, as the view gives one (view.ts). */
const surface = (colour: string, metal = false) =>
  new THREE.MeshStandardMaterial({
    color: colour,
    metalness: metal ? 0.55 : 0.1,
    roughness: metal ? 0.45 : 0.62,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 1.5,
  })

/** Draw the model at `base` (its build folder's URL) on a square canvas `size` px a side. */
export async function drawExample(base: string, size: number, line: number): Promise<HTMLCanvasElement> {
  const manifest = (await (await fetch(`${base}/enclose.model.json`)).json()) as Manifest
  const loader = new GLTFLoader()
  const { scene, ink, box, shoot } = stage(size, line)
  await Promise.all(
    manifest.parts.map(async (part) => {
      const gltf = await loader.loadAsync(`${base}/${part.file}`)
      const group = manifest.groups.findIndex((one) => one.id === part.group)
      const metal = part.finish === 'metal'
      const glass = part.finish === 'glass'
      const colour = metal
        ? METAL
        : PALETTE[part.board ? 'green' : (part.color ?? IN_TURN[Math.max(group, 0) % IN_TURN.length])] ??
          part.color!
      const material = new THREE.MeshStandardMaterial({
        color: colour,
        metalness: metal ? 0.55 : 0.1,
        roughness: metal ? 0.45 : 0.62,
        side: THREE.DoubleSide,
        transparent: glass,
        opacity: glass ? 0.18 : 1,
        depthWrite: !glass,
        polygonOffset: true,
        polygonOffsetFactor: 1.5,
        polygonOffsetUnits: 1.5,
      })
      gltf.scene.updateMatrixWorld(true)
      gltf.scene.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const skin = new THREE.Mesh(mesh.geometry, material)
        skin.matrixAutoUpdate = false
        skin.matrix.copy(TO_MODEL).multiply(mesh.matrixWorld)
        scene.add(skin)
        mesh.geometry.computeBoundingBox()
        box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(skin.matrix))
      })
      if (part.edges && !glass) {
        const positions = new Float32Array(await (await fetch(`${base}/${part.edges}`)).arrayBuffer())
        const drawn = new LineSegments2(new LineSegmentsGeometry().setPositions(positions), ink)
        drawn.renderOrder = 1
        scene.add(drawn)
      }
    }),
  )

  return shoot()
}

/**
 * The table clock's box, which is not one of the examples: made here, as a project of
 * its own would have it. A carton open at the top, its four flaps folded back, and in
 * it an insert with a round cradle for the clock. In mm, Z up.
 */
export function drawBox(size: number, line: number): HTMLCanvasElement {
  const { scene, ink, box, shoot } = stage(size, line)
  const card = surface(PALETTE.orange)
  const insert = surface(PALETTE.white)
  const up = new THREE.Vector3(0, 0, 1)

  /** A solid, its creases inked over it, put where `place` says. */
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, place: THREE.Matrix4) => {
    const solid = new THREE.Mesh(geometry, material)
    solid.matrixAutoUpdate = false
    solid.matrix.copy(place)
    const creases = new LineSegments2(
      new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geometry, 20)),
      ink,
    )
    creases.renderOrder = 1
    solid.add(creases)
    scene.add(solid)
    solid.updateMatrixWorld(true)
    geometry.computeBoundingBox()
    box.union(geometry.boundingBox!.clone().applyMatrix4(place))
  }
  const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)

  // the carton: its floor and four walls, of card this thick
  const wide = 150
  const deep = 150
  const tall = 120
  const thick = 2.5
  add(new THREE.BoxGeometry(wide, deep, thick), card, at(0, 0, thick / 2))
  add(new THREE.BoxGeometry(wide, thick, tall), card, at(0, -deep / 2 + thick / 2, tall / 2))
  add(new THREE.BoxGeometry(wide, thick, tall), card, at(0, deep / 2 - thick / 2, tall / 2))
  add(new THREE.BoxGeometry(thick, deep - thick * 2, tall), card, at(-wide / 2 + thick / 2, 0, tall / 2))
  add(new THREE.BoxGeometry(thick, deep - thick * 2, tall), card, at(wide / 2 - thick / 2, 0, tall / 2))

  // its flaps, each turned out from the top of its wall, about the wall's top edge:
  // `inward` is the way it lay over the opening, shut
  const flap = (hinge: THREE.Vector3, inward: THREE.Vector3, across: number, long: number, open: number) => {
    const axis = new THREE.Vector3().crossVectors(up, inward).normalize()
    const turn = new THREE.Matrix4().makeRotationAxis(axis, -open * RADIANS)
    // lying shut: from the hinge, inward
    const shut = new THREE.Matrix4().makeTranslation(inward.x * (long / 2), inward.y * (long / 2), thick / 2)
    const lie = Math.abs(inward.x) > 0 ? [long, across] : [across, long]
    add(
      new THREE.BoxGeometry(lie[0], lie[1], thick),
      card,
      new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z).multiply(turn).multiply(shut),
    )
  }
  flap(new THREE.Vector3(0, -deep / 2, tall), new THREE.Vector3(0, 1, 0), wide, deep / 2, 128)
  flap(new THREE.Vector3(0, deep / 2, tall), new THREE.Vector3(0, -1, 0), wide, deep / 2, 140)
  flap(new THREE.Vector3(-wide / 2, 0, tall), new THREE.Vector3(1, 0, 0), deep - 6, wide / 2, 118)
  flap(new THREE.Vector3(wide / 2, 0, tall), new THREE.Vector3(-1, 0, 0), deep - 6, wide / 2, 132)

  // the insert, down in it: a slab with a round cradle cut through it
  const inside = wide - thick * 2 - 1
  const outline = new THREE.Shape()
  outline.moveTo(-inside / 2, -inside / 2)
  outline.lineTo(inside / 2, -inside / 2)
  outline.lineTo(inside / 2, inside / 2)
  outline.lineTo(-inside / 2, inside / 2)
  outline.lineTo(-inside / 2, -inside / 2)
  const cradle = new THREE.Path()
  cradle.absarc(0, 0, 52, 0, Math.PI * 2, true)
  outline.holes.push(cradle)
  const slab = 22
  add(
    new THREE.ExtrudeGeometry(outline, { depth: slab, bevelEnabled: false, curveSegments: 64 }),
    insert,
    at(0, 0, tall - 18 - slab),
  )
  // and the bottom of the cradle, further down
  add(new THREE.CylinderGeometry(52, 52, 3, 64).rotateX(Math.PI / 2), insert, at(0, 0, tall - 18 - slab - 30))
  return shoot()
}

/** The simple solids the colours card shows, four to a card. */
export type Shape = 'cube' | 'sphere' | 'cylinder' | 'torus'

/**
 * One simple solid by itself, about 100 mm across, standing on the ground as a model
 * would: in a colour of the palette's (by name), or bare metal. As `drawBox` draws.
 */
export function drawShape(
  shape: Shape,
  colour: string,
  metal: boolean,
  size: number,
  line: number,
  /**
   * (or made of a material of the app's, as Render draws it: given the solid's size, mm,
   * and the renderer and the scene, to light it by the studio)
   */
  madeOf?: (size: THREE.Vector3, renderer: THREE.WebGLRenderer, scene: THREE.Scene) => THREE.Material,
): HTMLCanvasElement {
  const { scene, ink, box, shoot, renderer } = stage(size, line)
  const geometry =
    shape === 'cube'
      ? new THREE.BoxGeometry(100, 100, 100)
      : shape === 'sphere'
        ? new THREE.SphereGeometry(58, 96, 64)
        : shape === 'cylinder'
          ? new THREE.CylinderGeometry(46, 46, 110, 96).rotateX(Math.PI / 2)
          : new THREE.TorusGeometry(44, 20, 48, 128)
  geometry.computeBoundingBox()
  // standing on the ground
  geometry.translate(0, 0, -geometry.boundingBox!.min.z)
  const across = geometry.boundingBox!.getSize(new THREE.Vector3())
  const solid = new THREE.Mesh(
    geometry,
    madeOf ? madeOf(across, renderer, scene) : surface(metal ? METAL : PALETTE[colour], metal),
  )
  const creases = new LineSegments2(
    new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geometry, 20)),
    ink,
  )
  creases.renderOrder = 1
  solid.add(creases)
  scene.add(solid)
  geometry.computeBoundingBox()
  box.union(geometry.boundingBox!)
  return shoot()
}

/** One part of an example drawn by itself, and where it goes as the model comes apart. */
export type Layer = {
  id: string
  /** the part by itself, where it is in the model, on a picture of the whole */
  url: string
  /** how far it moves across and down the picture, as shares of its width, for each one of `apart` */
  dx: number
  dy: number
  /** which is in front of which: the higher, the nearer */
  z: number
}

/**
 * Some of an example's parts (`ids`), each drawn by itself on a picture of them all, in
 * the same place in each, from where the app's Home looks: so that laid one over another
 * they are the model, and moved apart along their own ways (what the model says each
 * part's is) they are the model pulled apart, as far as `most` times those. The
 * pictures are framed for all of that. And where the middle of the whole is, as shares
 * of the picture, put together and pulled apart as far as it goes. A grey part is drawn
 * white, which reads on the dark.
 */
export async function drawLayers(
  base: string,
  ids: readonly string[],
  size: number,
  line: number,
  most: number,
): Promise<{ layers: Layer[]; middle: [number, number]; middleApart: [number, number]; tall: number }> {
  const manifest = (await (await fetch(`${base}/enclose.model.json`)).json()) as Manifest & {
    parts: { explode?: [number, number, number] }[]
  }
  const loader = new GLTFLoader()
  const { scene, ink, box, frame, renderer } = stage(size, line)
  const chosen = manifest.parts.filter((part) => ids.includes(part.id))
  const made = await Promise.all(
    chosen.map(async (part) => {
      const gltf = await loader.loadAsync(`${base}/${part.file}`)
      const group = manifest.groups.findIndex((one) => one.id === part.group)
      const metal = part.finish === 'metal'
      const given = part.color === 'grey' ? 'white' : part.color
      const colour = metal ? METAL : PALETTE[given ?? IN_TURN[Math.max(group, 0) % IN_TURN.length]] ?? part.color!
      const material = surface(colour, metal)
      const held = new THREE.Group()
      const room = new THREE.Box3()
      gltf.scene.updateMatrixWorld(true)
      gltf.scene.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const skin = new THREE.Mesh(mesh.geometry, material)
        skin.matrixAutoUpdate = false
        skin.matrix.copy(TO_MODEL).multiply(mesh.matrixWorld)
        held.add(skin)
        mesh.geometry.computeBoundingBox()
        room.union(mesh.geometry.boundingBox!.clone().applyMatrix4(skin.matrix))
      })
      if (part.edges) {
        const positions = new Float32Array(await (await fetch(`${base}/${part.edges}`)).arrayBuffer())
        const drawn = new LineSegments2(new LineSegmentsGeometry().setPositions(positions), ink)
        drawn.renderOrder = 1
        held.add(drawn)
      }
      scene.add(held)
      const way = new THREE.Vector3(...(part.explode ?? [0, 0, 0]))
      return { id: part.id, held, room, way }
    }),
  )
  // framed for all of it, together and as far apart as it goes
  for (const one of made) {
    box.union(one.room)
    box.union(one.room.clone().translate(one.way.clone().multiplyScalar(most)))
  }
  const camera = frame()
  const onPicture = (point: THREE.Vector3) => {
    const seen = point.clone().project(camera)
    return [(seen.x + 1) / 2, (1 - seen.y) / 2] as const
  }
  const roomAt = (apart: number) => {
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const one of made)
      for (let i = 0; i < 8; i++) {
        const corner = new THREE.Vector3(
          i & 1 ? one.room.max.x : one.room.min.x,
          i & 2 ? one.room.max.y : one.room.min.y,
          i & 4 ? one.room.max.z : one.room.min.z,
        ).addScaledVector(one.way, apart)
        const [x, y] = onPicture(corner)
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    return { left, top, right, bottom }
  }
  // Each picture is cut to what the whole takes up, together and as far apart as it goes,
  // and a little room round it: and what is said of where things are, is of that.
  const together = roomAt(0)
  const apart = roomAt(most)
  const pad = 0.02
  const cut = {
    left: Math.max(0, Math.min(together.left, apart.left) - pad),
    top: Math.max(0, Math.min(together.top, apart.top) - pad),
    right: Math.min(1, Math.max(together.right, apart.right) + pad),
    bottom: Math.min(1, Math.max(together.bottom, apart.bottom) + pad),
  }
  const wide = cut.right - cut.left
  const tall = cut.bottom - cut.top
  const middleOf = (room: typeof together): [number, number] => [
    ((room.left + room.right) / 2 - cut.left) / wide,
    ((room.top + room.bottom) / 2 - cut.top) / (tall),
  ]
  const piece = document.createElement('canvas')
  piece.width = Math.round(wide * size)
  piece.height = Math.round(tall * size)

  const eye = camera.position
  const layers: Layer[] = []
  for (const one of made) {
    for (const other of made) other.held.visible = other === one
    renderer.render(scene, camera)
    const pen = piece.getContext('2d')!
    pen.clearRect(0, 0, piece.width, piece.height)
    pen.drawImage(renderer.domElement, cut.left * size, cut.top * size, piece.width, piece.height, 0, 0, piece.width, piece.height)
    const centre = one.room.getCenter(new THREE.Vector3())
    const [x0, y0] = onPicture(centre)
    const [x1, y1] = onPicture(centre.clone().add(one.way))
    layers.push({
      id: one.id,
      url: piece.toDataURL('image/webp', 0.88),
      // (as shares of the cut picture's width, both ways)
      dx: (x1 - x0) / wide,
      dy: (y1 - y0) / wide,
      // the nearer the eye, pulled apart, the higher
      z: -centre.clone().addScaledVector(one.way, most).distanceTo(eye),
    })
  }
  return { layers, middle: middleOf(together), middleApart: middleOf(apart), tall: tall / wide }
}
