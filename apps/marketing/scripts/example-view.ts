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
  const fillLight = new THREE.DirectionalLight('#ffffff', 0.55)
  scene.add(key, fillLight)

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
  const frame = (fill = FILL) => {
    const middle = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2
    const camera = new THREE.PerspectiveCamera(FOV, 1, radius * 0.1, radius * 20)
    camera.up.set(0, 0, 1)
    const around = REST.azimuth * RADIANS
    const above = REST.elevation * RADIANS
    const eye = new THREE.Vector3(Math.cos(around) * Math.cos(above), Math.sin(around) * Math.cos(above), Math.sin(above))
    const distance = radius / fill / Math.sin((FOV / 2) * RADIANS)
    camera.position.copy(middle).addScaledVector(eye, distance)
    camera.lookAt(middle)
    // lit from over the eye's left shoulder, and a little from behind on the right (view.ts)
    const right = new THREE.Vector3().crossVectors(eye, camera.up).normalize()
    key.position.copy(eye).multiplyScalar(0.7).addScaledVector(right, 0.5).add(new THREE.Vector3(0, 0, 0.9))
    fillLight.position.copy(eye).multiplyScalar(-0.6).addScaledVector(right, -0.7).add(new THREE.Vector3(0, 0, 0.4))
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

/**
 * A hand of a clock, to be turned on the page: drawn by itself as seen straight on, its
 * arbor in the middle of its picture, which is `half` mm from its middle to its edge; at
 * `angle` degrees round from twelve, as the model has it; and how the clock's face lies
 * on the pictures of the rest (as `drawLayers` has them), in shares of their width: where
 * the arbor is, and where a mm across the face (to three o'clock) and a mm up it (to
 * twelve) go from there.
 */
export type Hand = {
  id: string
  url: string
  half: number
  angle: number
  pivot: [number, number]
  across: [number, number]
  up: [number, number]
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
  /** (of a clock: its hands, and the part whose middle their arbor goes through) */
  clock?: { hands: readonly string[]; arbor: string },
): Promise<{ layers: Layer[]; middle: [number, number]; middleApart: [number, number]; tall: number; hands: Hand[] }> {
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
  // And each hand, drawn straight on, to be turned on the page over the rest: the face is
  // the model's X (to three) and Z (to twelve), and is seen from its -Y.
  const hands: Hand[] = []
  const arbor = clock && made.find((one) => one.id === clock.arbor)
  if (clock && arbor) {
    const axle = arbor.room.getCenter(new THREE.Vector3())
    const onCut = (point: THREE.Vector3): [number, number] => {
      const [x, y] = onPicture(point)
      return [(x - cut.left) / wide, (y - cut.top) / wide]
    }
    const square = 512
    const flat = new THREE.OrthographicCamera()
    flat.up.set(0, 0, 1)
    for (const id of clock.hands) {
      const hand = made.find((one) => one.id === id)
      if (!hand) continue
      const pivot = new THREE.Vector3(axle.x, hand.room.getCenter(new THREE.Vector3()).y, axle.z)
      // how far it reaches from its arbor, and which way its tip is
      let reach = 0
      let tip = new THREE.Vector3()
      const at = new THREE.Vector3()
      hand.held.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh || (node as LineSegments2).isLineSegments2) return
        const position = mesh.geometry.attributes.position
        for (let i = 0; i < position.count; i++) {
          at.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix)
          const far = Math.hypot(at.x - pivot.x, at.z - pivot.z)
          if (far > reach) [reach, tip] = [far, at.clone()]
        }
      })
      const half = reach * 1.06
      Object.assign(flat, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 1000 })
      flat.position.copy(pivot).add(new THREE.Vector3(0, -400, 0))
      flat.lookAt(pivot)
      flat.updateProjectionMatrix()
      for (const other of made) other.held.visible = other === hand
      renderer.setSize(square, square, false)
      ink.resolution.set(square, square)
      renderer.render(scene, flat)
      const url = renderer.domElement.toDataURL('image/webp', 0.9)
      renderer.setSize(size, size, false)
      ink.resolution.set(size, size)
      const [px, py] = onCut(pivot)
      const [ax, ay] = onCut(pivot.clone().add(new THREE.Vector3(1, 0, 0)))
      const [ux, uy] = onCut(pivot.clone().add(new THREE.Vector3(0, 0, 1)))
      hands.push({
        id,
        url,
        half,
        angle: (Math.atan2(tip.x - pivot.x, tip.z - pivot.z) * 180) / Math.PI,
        pivot: [px, py],
        across: [ax - px, ay - py],
        up: [ux - px, uy - py],
      })
    }
  }
  return { layers, middle: middleOf(together), middleApart: middleOf(apart), tall: tall / wide, hands }
}

/**
 * A board as tscircuit makes it in 3D (its .glb: the board, Y up, in mm, with its parts
 * on it), turned over and back as it is drawn frame after frame: from where the app's
 * Home looks down at it, the board turned about its long way through a whole turn, so
 * that half way round its bottom is up. Drawn as PCB mode's 3D draws it: `paint` gives it
 * the app's colours (pcb/colours.ts, handed in), and its creases are inked over it, lit
 * as the view lights it. For each frame, a picture, and where on it the middle of each of
 * `marked` (parts, by their name in the .glb) is, as shares of it.
 */
export async function drawTurning(
  url: string,
  frames: number,
  size: number,
  marked: readonly string[],
  paint: (board: THREE.Object3D) => void,
): Promise<{ pictures: string[]; marks: Record<string, [number, number][]> }> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(1)
  renderer.setSize(size, size, false)
  const scene = new THREE.Scene()
  // the board view's lights (board-mode.tsx), which go round with the eye
  scene.add(new THREE.AmbientLight('#ffffff', 0.55), new THREE.HemisphereLight('#ffffff', '#7d828c', 0.7))
  const key = new THREE.DirectionalLight('#ffffff', 1.7)
  const fill = new THREE.DirectionalLight('#ffffff', 0.55)
  scene.add(key, fill)
  paint(gltf.scene)
  // its creases inked, as the app's are: wherever two of its triangles meet at an edge
  const ink = new LineMaterial({
    color: EDGE,
    linewidth: size / 700,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    resolution: new THREE.Vector2(size, size),
  })
  const meshes: THREE.Mesh[] = []
  gltf.scene.traverse((thing) => {
    if ((thing as THREE.Mesh).isMesh) meshes.push(thing as THREE.Mesh)
  })
  for (const mesh of meshes) {
    for (const material of [mesh.material].flat())
      Object.assign(material, { polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 1.5 })
    const creases = new THREE.EdgesGeometry(mesh.geometry, 20)
    const drawn = new LineSegments2(new LineSegmentsGeometry().setPositions(creases.attributes.position.array as Float32Array), ink)
    drawn.renderOrder = 1
    mesh.add(drawn)
  }

  // the board turns about its middle, in a holder of its own
  const board = gltf.scene
  const room = new THREE.Box3().setFromObject(board)
  const middle = room.getCenter(new THREE.Vector3())
  board.position.sub(middle)
  const holder = new THREE.Group()
  holder.add(board)
  scene.add(holder)
  const radius = room.getSize(new THREE.Vector3()).length() / 2

  const camera = new THREE.PerspectiveCamera(FOV, 1, radius * 0.1, radius * 20)
  // Y up: from in front and above, a little to the side
  const above = 38 * RADIANS
  const around = -24 * RADIANS
  const eye = new THREE.Vector3(Math.sin(around) * Math.cos(above), Math.sin(above), Math.cos(around) * Math.cos(above))
  camera.position.copy(eye).multiplyScalar(radius / 1.15 / Math.sin((FOV / 2) * RADIANS))
  camera.lookAt(0, 0, 0)
  key.position.set(180, 320, 220)
  fill.position.set(-240, 160, -180)

  const named = Object.fromEntries(marked.map((name) => [name, board.getObjectByName(name)]))
  const pictures: string[] = []
  const marks: Record<string, [number, number][]> = Object.fromEntries(marked.map((name) => [name, []]))
  const at = new THREE.Vector3()
  for (let frame = 0; frame < frames; frame++) {
    const turn = (frame / frames) * Math.PI * 2
    // over about its long way, and a little round as it goes, for its depth to be seen
    holder.rotation.set(turn, Math.sin(turn) * 0.35, 0)
    holder.updateMatrixWorld(true)
    renderer.render(scene, camera)
    pictures.push(canvas.toDataURL('image/webp', 0.78))
    for (const name of marked) {
      const part = named[name]
      if (!part) continue
      new THREE.Box3().setFromObject(part).getCenter(at).project(camera)
      marks[name].push([Math.round(((at.x + 1) / 2) * 1e4) / 1e4, Math.round(((1 - at.y) / 2) * 1e4) / 1e4])
    }
  }
  renderer.dispose()
  return { pictures, marks }
}

/**
 * An example beside a reference scene of the app's (kit/scenes/<name>/reference: its
 * .glb, Y up in metres, and where in it a model stands), turned round frame after frame,
 * the whole of it, about its middle: the model drawn as `drawExample` draws it, and the
 * scene as the app draws one (viewport/reference.tsx), in a tone some of the way from the
 * view's ground to its text, its outline and its creases a stronger one. From where the
 * app's Home looks, framed for all of it however it is turned.
 */
export async function drawBeside(
  base: string,
  reference: { url: string; stand: [number, number, number]; against: [number, number] },
  frames: number,
  size: number,
  line: number,
  tones: { ground: string; ink: string; fill: number; line: number },
): Promise<string[]> {
  const manifest = (await (await fetch(`${base}/enclose.model.json`)).json()) as Manifest
  const loader = new GLTFLoader()
  const { scene, ink, box, frame, renderer } = stage(size, line)
  const turning = new THREE.Group()
  scene.add(turning)
  const model = new THREE.Box3()
  await Promise.all(
    manifest.parts.map(async (part) => {
      const gltf = await loader.loadAsync(`${base}/${part.file}`)
      const group = manifest.groups.findIndex((one) => one.id === part.group)
      const metal = part.finish === 'metal'
      const colour = metal
        ? METAL
        : PALETTE[part.board ? 'green' : (part.color ?? IN_TURN[Math.max(group, 0) % IN_TURN.length])] ?? part.color!
      const material = surface(colour, metal)
      gltf.scene.updateMatrixWorld(true)
      gltf.scene.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const skin = new THREE.Mesh(mesh.geometry, material)
        skin.matrixAutoUpdate = false
        skin.matrix.copy(TO_MODEL).multiply(mesh.matrixWorld)
        turning.add(skin)
        mesh.geometry.computeBoundingBox()
        model.union(mesh.geometry.boundingBox!.clone().applyMatrix4(skin.matrix))
      })
      if (part.edges) {
        const positions = new Float32Array(await (await fetch(`${base}/${part.edges}`)).arrayBuffer())
        const drawn = new LineSegments2(new LineSegmentsGeometry().setPositions(positions), ink)
        drawn.renderOrder = 1
        turning.add(drawn)
      }
    }),
  )

  // the scene, where the app puts it (lib/reference.ts's `placed`): the place in it where a
  // model stands under the model, by the side of it the scene says
  const by = (axis: 0 | 1) => {
    const side = reference.against[axis]
    return side < 0 ? model.min.getComponent(axis) : side > 0 ? model.max.getComponent(axis) : model.getCenter(new THREE.Vector3()).getComponent(axis)
  }
  const moved = new THREE.Vector3(by(0) - reference.stand[0], by(1) - reference.stand[1], model.min.z - reference.stand[2])
  // (some of the way, as it is seen: in sRGB, as the app's `toned` goes)
  const toned = (amount: number) => {
    const [from, to] = [tones.ground, tones.ink].map((hex) => new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace))
    return new THREE.Color().setRGB(
      from.r + (to.r - from.r) * amount,
      from.g + (to.g - from.g) * amount,
      from.b + (to.b - from.b) * amount,
      THREE.SRGBColorSpace,
    )
  }
  // (in the tones as they are: not through the view's lens, which lights them up)
  const fill = new THREE.MeshBasicMaterial({ color: toned(tones.fill), toneMapped: false })
  const outline = new THREE.MeshBasicMaterial({ color: toned(tones.line), side: THREE.BackSide, toneMapped: false })
  const lines = new LineMaterial({ color: toned(tones.line), linewidth: line, resolution: new THREE.Vector2(size, size) })
  const figure = await loader.loadAsync(reference.url)
  figure.scene.updateMatrixWorld(true)
  const all = new THREE.Box3().copy(model)
  figure.scene.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const place = new THREE.Matrix4().makeTranslation(moved.x, moved.y, moved.z).multiply(TO_MODEL).multiply(mesh.matrixWorld)
    const body = new THREE.Mesh(mesh.geometry, fill)
    body.matrixAutoUpdate = false
    body.matrix.copy(place)
    turning.add(body)
    // its outline: its own back faces, pushed out a little along each face's way, seen
    // round its edge (the app finds its lines in the picture; this is near enough here)
    const swollen = mesh.geometry.clone()
    swollen.computeVertexNormals()
    const position = swollen.attributes.position
    const normal = swollen.attributes.normal
    for (let i = 0; i < position.count; i++)
      position.setXYZ(
        i,
        position.getX(i) + normal.getX(i) * 0.004,
        position.getY(i) + normal.getY(i) * 0.004,
        position.getZ(i) + normal.getZ(i) * 0.004,
      )
    const rim = new THREE.Mesh(swollen, outline)
    rim.matrixAutoUpdate = false
    rim.matrix.copy(place)
    turning.add(rim)
    const creases = new LineSegments2(
      new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(mesh.geometry, 70)),
      lines,
    )
    creases.matrixAutoUpdate = false
    creases.matrix.copy(place)
    turning.add(creases)
    mesh.geometry.computeBoundingBox()
    all.union(mesh.geometry.boundingBox!.clone().applyMatrix4(place))
  })

  // turned about the middle of all of it, and framed for however it is turned
  const middle = all.getCenter(new THREE.Vector3())
  const reach = Math.max(
    ...[0, 1, 2, 3].map((i) => Math.hypot((i & 1 ? all.max.x : all.min.x) - middle.x, (i & 2 ? all.max.y : all.min.y) - middle.y)),
  )
  box.set(
    new THREE.Vector3(middle.x - reach, middle.y - reach, all.min.z),
    new THREE.Vector3(middle.x + reach, middle.y + reach, all.max.z),
  )
  // (the turning room is round, and what is in it narrower: it is let fill more)
  const camera = frame(1.2)
  const pictures: string[] = []
  for (let index = 0; index < frames; index++) {
    turning.position.set(0, 0, 0)
    turning.rotation.set(0, 0, 0)
    turning.updateMatrix()
    const turn = (index / frames) * Math.PI * 2
    turning.matrix
      .makeTranslation(middle.x, middle.y, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(turn))
      .multiply(new THREE.Matrix4().makeTranslation(-middle.x, -middle.y, 0))
    turning.matrixAutoUpdate = false
    turning.updateMatrixWorld(true)
    renderer.render(scene, camera)
    pictures.push(renderer.domElement.toDataURL('image/webp', 0.82))
  }
  return pictures
}
