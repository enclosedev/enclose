// A part in each of the palette's colours, each a simple shape of its own, in rows: what
// the theme creator's window shows in its view, and what a theme's card in the settings
// shows in small. The card's is a picture, drawn here in the colours it is asked for by
// one renderer kept to itself, and kept by those colours for the next time.
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

import { PALETTE_NAMES, type PaletteName } from "@shared/palette"
import { EDGE } from "@/components/viewport/paint"

/** A thing to show a colour on, made of nothing but a simple shape. */
export function shapeOf(name: PaletteName): THREE.BufferGeometry {
  switch (name) {
    case "red":
      return new THREE.BoxGeometry(1.3, 1.3, 1.3)
    case "orange":
      return new THREE.CylinderGeometry(0.7, 0.7, 1.3, 48)
    case "yellow":
      return new THREE.SphereGeometry(0.75, 48, 32)
    case "lime":
      return new THREE.ConeGeometry(0.75, 1.4, 48)
    case "green":
      return new THREE.BoxGeometry(1.7, 0.12, 1.2)
    case "cyan":
      return new THREE.TorusGeometry(0.55, 0.22, 24, 64)
    case "blue":
      return new THREE.CapsuleGeometry(0.45, 0.6, 12, 32)
    case "indigo":
      return new THREE.OctahedronGeometry(0.8)
    case "violet":
      return new THREE.DodecahedronGeometry(0.75)
    case "pink":
      return new THREE.CylinderGeometry(0.75, 0.75, 1, 6)
    case "white":
      return new THREE.BoxGeometry(1.5, 0.7, 1)
    case "lightgrey":
      return new THREE.CylinderGeometry(0.8, 0.8, 0.35, 48)
    case "grey":
      return new RoundedBoxGeometry(1.1, 1.1, 1.1, 4, 0.18)
  }
}

/** Edges are drawn where a shape's faces meet at more than this, degrees. */
export const CORNER = 20

/** How far apart the parts stand, and how many to a row. */
const APART = 2.3
const ACROSS = 5

/** Where each of the parts stands: in rows, each a little across from the one before. */
export const PLACES: Record<PaletteName, [number, number, number]> = (() => {
  const rows = Math.ceil(PALETTE_NAMES.length / ACROSS)
  const places = {} as Record<PaletteName, [number, number, number]>
  PALETTE_NAMES.forEach((name, index) => {
    const row = Math.floor(index / ACROSS)
    const inRow = Math.min(ACROSS, PALETTE_NAMES.length - row * ACROSS)
    const x = (index % ACROSS) - (inRow - 1) / 2
    const z = row - (rows - 1) / 2
    places[name] = [x * APART - z * 0.6, 0, z * APART + x * 0.6]
  })
  return places
})()

/** Where they are looked at from, towards the middle of them. */
export const LOOKING_FROM: [number, number, number] = [10, 8.5, 10]

/** The lights on them, as the view lights a model. */
type Light = { position: [number, number, number]; intensity: number }
export const LIGHTS: {
  ambient: number
  sky: [string, string, number]
  key: Light
  fill: Light
} = {
  ambient: 0.55,
  sky: ["#ffffff", "#7d828c", 0.7],
  key: { position: [180, 320, 220], intensity: 1.7 },
  fill: { position: [-240, 160, -180], intensity: 0.55 },
}

/** How big a picture of them is drawn, px: twice the room a card's view gives it. */
export const PICTURE = { width: 400, height: 352 }

/** What a picture is drawn with: made when one is first asked for. */
type Stage = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  materials: Record<PaletteName, THREE.MeshStandardMaterial>
}

let stage: Stage | null = null
/** How long the renderer is kept once nothing more is asked of it, ms. */
const KEPT = 4000
let idle: ReturnType<typeof setTimeout> | undefined

function stageUp(): Stage {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(PICTURE.width, PICTURE.height, false)
  // as the creator's window has them drawn (react-three-fiber's way)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, LIGHTS.ambient))
  scene.add(new THREE.HemisphereLight(...LIGHTS.sky))
  for (const { position, intensity } of [LIGHTS.key, LIGHTS.fill]) {
    const light = new THREE.DirectionalLight(0xffffff, intensity)
    light.position.set(...position)
    scene.add(light)
  }
  const edge = new THREE.LineBasicMaterial({ color: EDGE })
  const materials = {} as Record<PaletteName, THREE.MeshStandardMaterial>
  for (const name of PALETTE_NAMES) {
    const geometry = shapeOf(name)
    materials[name] = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.62,
    })
    const part = new THREE.Group()
    part.position.set(...PLACES[name])
    part.add(new THREE.Mesh(geometry, materials[name]))
    part.add(
      new THREE.LineSegments(new THREE.EdgesGeometry(geometry, CORNER), edge)
    )
    scene.add(part)
  }

  // looked at as the creator's window has them, the whole of them as big as the
  // picture holds
  const camera = new THREE.OrthographicCamera()
  camera.position.set(...LOOKING_FROM)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  scene.updateMatrixWorld()
  const seen = new THREE.Box3()
  const corner = new THREE.Vector3()
  scene.traverse((thing) => {
    if (!(thing instanceof THREE.Mesh)) return
    const box = new THREE.Box3().setFromObject(thing)
    for (let i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      )
      seen.expandByPoint(corner.applyMatrix4(camera.matrixWorldInverse))
    }
  })
  const middle = seen.getCenter(new THREE.Vector3())
  const size = seen.getSize(new THREE.Vector3())
  const aspect = PICTURE.width / PICTURE.height
  const tall = Math.max(size.y, size.x / aspect) / 2
  camera.left = middle.x - tall * aspect
  camera.right = middle.x + tall * aspect
  camera.top = middle.y + tall
  camera.bottom = middle.y - tall
  camera.near = 0.1
  camera.far = 100
  camera.updateProjectionMatrix()

  return { renderer, scene, camera, materials }
}

/** Let the renderer go, with all it was drawing. */
function letGo() {
  if (!stage) return
  stage.scene.traverse((thing) => {
    if (thing instanceof THREE.Mesh || thing instanceof THREE.LineSegments) {
      thing.geometry.dispose()
      ;(thing.material as THREE.Material).dispose()
    }
  })
  stage.renderer.dispose()
  stage.renderer.forceContextLoss()
  stage = null
}

/** The pictures drawn so far, by the colours they are in; no more than so many. */
const drawn = new Map<string, string>()
const KEEP = 48

/**
 * A picture of the parts, each in its colour in `palette`, on nothing: as a data URL.
 * Nothing, where there is nothing to draw with.
 */
export function partsPicture(
  palette: Record<PaletteName, string>
): string | null {
  const key = PALETTE_NAMES.map((name) => palette[name]).join(" ")
  const had = drawn.get(key)
  if (had) return had
  try {
    stage ??= stageUp()
  } catch {
    return null
  }
  for (const name of PALETTE_NAMES)
    stage.materials[name].color.set(palette[name])
  stage.renderer.render(stage.scene, stage.camera)
  const picture = stage.renderer.domElement.toDataURL("image/png")
  drawn.set(key, picture)
  if (drawn.size > KEEP) drawn.delete(drawn.keys().next().value!)
  clearTimeout(idle)
  idle = setTimeout(letGo, KEPT)
  return picture
}
