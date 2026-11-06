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

/** Draw the model at `base` (its build folder's URL) on a square canvas `size` px a side. */
export async function drawExample(base: string, size: number, line: number): Promise<HTMLCanvasElement> {
  const manifest = (await (await fetch(`${base}/enclose.model.json`)).json()) as Manifest
  const loader = new GLTFLoader()
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
