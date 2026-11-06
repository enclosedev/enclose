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
  const shoot = () => {
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
    renderer.render(scene, camera)
    return canvas
  }
  return { scene, ink, box, shoot }
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
