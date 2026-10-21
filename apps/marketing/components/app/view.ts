import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PICKED, WINDOW } from './data'
import { makeGround } from './ground'
import { BUILT, type Look } from './look'

// The 3D view in the app's window on the page: the robot arm of the app's examples
// (public/model, packed by scripts/pack-model.mjs), drawn the way the app draws a
// model. Nothing here listens to the pointer. The page's scroll says how the model
// is to be looked at (a Look), and it is drawn once each time that changes.

// The colours parts are drawn in: the app's own (its shared/palette.ts), as its default
// theme (themes/default.json) has them in the dark look the window is drawn in; and the
// order groups that give none are handed them in.
const PALETTE: Record<string, string> = {
  red: '#ff726f',
  orange: '#feaf57',
  yellow: '#fff24f',
  lime: '#9efb41',
  green: '#54ff7d',
  cyan: '#7bfafd',
  blue: '#7fa2fe',
  indigo: '#897aff',
  violet: '#cf7dff',
  pink: '#fd81c3',
  white: '#fafafa',
  lightgrey: '#d4d4d4',
  grey: '#464646',
}
const IN_TURN = ['blue', 'orange', 'green', 'pink', 'cyan', 'yellow', 'violet', 'lime', 'red', 'indigo']
const METAL = '#c4c7cc'
const EDGE = '#0e1012'

// Where each joint is as built, and the line it turns about, in mm: the arm's own
// tool has these (examples/arm/tools/arm.js). A joint turns its link and every link
// further out.
const JOINTS = [
  { id: 'turn', link: 'shoulder', about: [-0.099, -7.543, 62.43], axis: [0, -0.0087, 1], way: 1 },
  { id: 'shoulder', link: 'upper-arm', about: [-13.654, -38.86, 119.757], axis: [-1, -0.0087, -0.0001], way: -1 },
  { id: 'elbow', link: 'lower-arm', about: [-12.143, 73.581, 148.473], axis: [-0.9999, -0.0086, -0.0088], way: 1 },
  { id: 'wrist', link: 'wrist', about: [-10.061, -60.577, 152.295], axis: [-0.9998, 0.0002, -0.0175], way: 1 },
  { id: 'roll', link: 'gripper', about: [7.062, -118.775, 152.082], axis: [0, -1, -0.0088], way: 1 },
  { id: 'grip', link: 'jaw', about: [22.765, -145.704, 172.057], axis: [1, -0.0001, 0.0087], way: 1 },
] as const

type Packed = {
  edgeBox: { min: number[]; max: number[] }
  /** the room the model takes, as it is built */
  box: { min: number[]; max: number[] }
  groups: { id: string; label: string }[]
  parts: {
    id: string
    group: string
    color: string | null
    metal: boolean
    explode: number[]
    edges: [number, number]
  }[]
}

// glTF is Y-up metres; the model is Z-up millimetres
const TO_MODEL = new THREE.Matrix4()
  .makeRotationX(Math.PI / 2)
  .multiply(new THREE.Matrix4().makeScale(1000, 1000, 1000))

const RADIANS = Math.PI / 180
const FOV = 30

// A part's picture in the list of parts, as the app draws them: the part by itself,
// from the side the model opens on, filling its picture whatever its size.
/** Pixels a side: twice the size they are shown at, for sharp screens. */
const PICTURE = 300
/** How much of the picture the part fills. */
const FILL = 0.86
const HOME = new THREE.Vector3(0.5, -0.62, 0.6).normalize()

export type View = {
  draw: (look: Look) => void
  /** how many of the screen's pixels there are to one of the window's */
  sharpen: (ratio: number) => void
  /** Draw each of these parts by itself, handing each picture over as it is made. */
  pictures: (ids: readonly string[], each: (id: string, url: string) => void) => Promise<void>
  dispose: () => void
}

export async function openView(canvas: HTMLCanvasElement, ratio: number): Promise<View> {
  const at = (file: string) => `/model/${file}`
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const [packed, lines, gltf] = await Promise.all([
    fetch(at('arm.json')).then((response) => response.json() as Promise<Packed>),
    fetch(at('arm.edges.bin')).then(async (response) => new Uint16Array(await response.arrayBuffer())),
    loader.loadAsync(at('arm.glb')),
  ])

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.setPixelRatio(ratio)
  renderer.setSize(WINDOW.width, WINDOW.height, false)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, WINDOW.width / WINDOW.height, 1, 10000)
  camera.up.set(0, 0, 1)

  scene.add(new THREE.AmbientLight('#ffffff', 0.55))
  scene.add(new THREE.HemisphereLight('#ffffff', '#7d828c', 0.7))
  // the lights go round with the eye, as they do in the app: see `draw`
  const key = new THREE.DirectionalLight('#ffffff', 1.7)
  const fill = new THREE.DirectionalLight('#ffffff', 0.55)
  scene.add(key, fill)

  // ── the parts ───────────────────────────────────────────────────────────
  // (A surface is one of a kind: of a colour, and of the cables, or of the group that
  // the list of parts shows on its own, or of neither. The kinds come and go apart.)
  type Kind = { cable: boolean; picked: boolean }
  const colours = new Map<string, { material: THREE.MeshStandardMaterial } & Kind>()
  const surface = (colour: string, metal: boolean, { cable, picked }: Kind) => {
    const name = `${colour}${metal ? ':metal' : ''}${cable ? ':cable' : ''}${picked ? ':picked' : ''}`
    let material = colours.get(name)?.material
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: colour,
        metalness: metal ? 0.55 : 0.1,
        roughness: metal ? 0.45 : 0.62,
        side: THREE.DoubleSide,
        // behind its own edges, which are drawn on it
        polygonOffset: true,
        polygonOffsetFactor: 1.5,
        polygonOffsetUnits: 1.5,
        transparent: cable,
      })
      colours.set(name, { material, cable, picked })
    }
    return material
  }
  const ink = () =>
    new LineMaterial({
      color: EDGE,
      // in the window's px: the page scales the window, and its lines with it
      linewidth: 1,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      resolution: new THREE.Vector2(WINDOW.width, WINDOW.height),
    })
  const INK = 0.85
  const edgeInk = ink()
  const cableInk = ink()
  const pickedInk = ink()

  const found = new Map<string, THREE.Mesh>()
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    // a part's node is named for it: the mesh is that node, or just under it
    const name = packed.parts.some((part) => part.id === mesh.name)
      ? mesh.name
      : (mesh.parent?.name ?? mesh.name)
    found.set(name, mesh)
  })

  const { min, max } = packed.edgeBox
  const span = min.map((low, axis) => (max[axis] - low) / 65535)
  const model = new THREE.Group()
  const box = new THREE.Box3(
    new THREE.Vector3(...packed.box.min),
    new THREE.Vector3(...packed.box.max),
  )
  const parts = packed.parts.flatMap((part) => {
    const mesh = found.get(part.id)
    if (!mesh) return []
    const kind = { cable: part.group === 'cables', picked: part.group === PICKED }
    const { cable } = kind
    const group = packed.groups.findIndex((one) => one.id === part.group)
    const colour = part.metal
      ? METAL
      : PALETTE[part.color ?? IN_TURN[Math.max(group, 0) % IN_TURN.length]] ?? part.color!

    const object = new THREE.Group()
    object.matrixAutoUpdate = false
    mesh.geometry.computeBoundingBox()
    const room = mesh.geometry.boundingBox!.clone().applyMatrix4(TO_MODEL)
    // (its corners are packed as whole numbers, which moving them here would spoil:
    // the mesh is turned to the model's frame instead)
    const skin = new THREE.Mesh(mesh.geometry, surface(colour, part.metal, kind))
    skin.matrixAutoUpdate = false
    skin.matrix.copy(TO_MODEL)
    object.add(skin)

    const [first, count] = part.edges
    if (count > 0) {
      const positions = new Float32Array(count * 6)
      for (let i = 0; i < positions.length; i++)
        positions[i] = min[i % 3] + lines[first * 6 + i] * span[i % 3]
      const drawn = new LineSegments2(
        new LineSegmentsGeometry().setPositions(positions),
        cable ? cableInk : kind.picked ? pickedInk : edgeInk,
      )
      drawn.renderOrder = 1
      object.add(drawn)
    }
    model.add(object)
    return [
      { id: part.id, object, room, cable, link: part.group, explode: new THREE.Vector3(...part.explode) },
    ]
  })
  scene.add(model)

  const middle = box.getCenter(new THREE.Vector3())
  const radius = box.getSize(new THREE.Vector3()).length() / 2
  const picked = parts
    .filter((part) => part.link === PICKED)
    .reduce((all, part) => all.union(part.room), new THREE.Box3())
  const pickedMiddle = picked.getCenter(new THREE.Vector3())
  const pickedRadius = picked.getSize(new THREE.Vector3()).length() / 2

  // ── the ground ──────────────────────────────────────────────────────────
  // (and the world's axes: the model is built on the ground, about where they meet)
  const ground = makeGround(ratio, { x: '#ff0033', y: '#74d908', z: '#0f73ff' })
  scene.add(...ground.objects)

  // ── a frame ─────────────────────────────────────────────────────────────
  const turned = new Map<string, THREE.Matrix4>()
  const chain = JOINTS.map((joint) => ({
    ...joint,
    about: new THREE.Vector3(...joint.about),
    axis: new THREE.Vector3(...joint.axis).normalize(),
  }))
  const still = new THREE.Matrix4()
  const moved = new THREE.Matrix4()
  const there = new THREE.Matrix4()
  const back = new THREE.Matrix4()
  const turn = new THREE.Matrix4()
  const eye = new THREE.Vector3()
  const right = new THREE.Vector3()
  const aim = new THREE.Vector3()
  /** Lit from over the eye's left shoulder, and a little from behind on the right. */
  const light = (from: THREE.Vector3) => {
    right.crossVectors(from, camera.up).normalize()
    key.position.copy(from).multiplyScalar(0.7).addScaledVector(right, 0.5).add(new THREE.Vector3(0, 0, 0.9))
    fill.position.copy(from).multiplyScalar(-0.6).addScaledVector(right, -0.7).add(new THREE.Vector3(0, 0, 0.4))
  }

  const draw = (look: Look) => {
    // Each joint turns its link and all that the link carries: so a link is turned
    // by every joint from the base out to its own, the innermost last.
    moved.identity()
    for (const joint of chain) {
      const by = joint.id === 'grip' ? BUILT - look.grip : look[joint.id]
      there.makeTranslation(joint.about.x, joint.about.y, joint.about.z)
      back.makeTranslation(-joint.about.x, -joint.about.y, -joint.about.z)
      turn.makeRotationAxis(joint.axis, joint.way * by * RADIANS)
      moved.multiply(there).multiply(turn).multiply(back)
      turned.set(joint.link, moved.clone())
    }
    for (const part of parts) {
      part.object.matrix
        .copy(turned.get(part.link) ?? still)
        .multiply(there.makeTranslation(
          part.explode.x * look.apart,
          part.explode.y * look.apart,
          part.explode.z * look.apart,
        ))
      part.object.visible =
        (!part.cable || look.cables > 0.01) && (look.others > 0.01 || part.link === PICKED)
    }
    for (const { material, cable, picked } of colours.values()) {
      const there = (cable ? look.cables : 1) * (picked ? 1 : look.others)
      // (the cables are always drawn as what can be seen through: the rest only while
      // it is, which is seldom, and is drawn the quicker for it)
      const sheer = cable || there < 1
      if (material.transparent !== sheer) {
        material.transparent = sheer
        material.needsUpdate = true
      }
      material.opacity = there
    }
    edgeInk.opacity = INK * look.others
    cableInk.opacity = INK * look.cables * look.others
    ground.show(look.grid)

    const around = look.azimuth * RADIANS
    const above = look.elevation * RADIANS
    eye.set(
      Math.cos(around) * Math.cos(above),
      Math.sin(around) * Math.cos(above),
      Math.sin(above),
    )
    aim.lerpVectors(middle, pickedMiddle, look.alone)
    const size = radius + (pickedRadius - radius) * look.alone
    camera.position.copy(aim).addScaledVector(eye, size * look.distance)
    camera.near = size * 0.2
    camera.far = size * look.distance + radius * 8
    camera.lookAt(aim)
    // the model's middle is not the window's: the conversation is over one side of it
    camera.setViewOffset(
      WINDOW.width,
      WINDOW.height,
      WINDOW.width / 2 - look.x,
      WINDOW.height / 2 - look.y,
      WINDOW.width,
      WINDOW.height,
    )
    light(eye)
    renderer.render(scene, camera)
  }

  // ── the parts' pictures ─────────────────────────────────────────────────
  // By a renderer of their own, which is thrown away when it is done, of the scene
  // the view is drawn from: for the length of one picture nothing is in it but the
  // one part, where it sits in the model as built, and then all is as it was.
  let gone = false
  const pictures: View['pictures'] = async (ids, each) => {
    const easel = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    easel.toneMapping = renderer.toneMapping
    easel.setPixelRatio(1)
    easel.setSize(PICTURE, PICTURE, false)
    const flat = new THREE.OrthographicCamera()
    flat.up.copy(camera.up)
    const corner = new THREE.Vector3()
    const inks = [edgeInk, cableInk, pickedInk]
    // all that a part is drawn in, which the scroll has more or less there
    const drawnIn = [...[...colours.values()].map(({ material }) => material), ...inks]
    try {
      for (const id of ids) {
        const one = parts.find((part) => part.id === id)
        if (gone) break
        if (!one) continue

        const centre = one.room.getCenter(new THREE.Vector3())
        const reach = one.room.getSize(new THREE.Vector3()).length() || 1
        flat.position.copy(centre).addScaledVector(HOME, reach * 2)
        flat.lookAt(centre)
        flat.updateMatrixWorld(true)
        let half = 0
        for (let i = 0; i < 8; i++) {
          corner
            .set(
              i & 1 ? one.room.max.x : one.room.min.x,
              i & 2 ? one.room.max.y : one.room.min.y,
              i & 4 ? one.room.max.z : one.room.min.z,
            )
            .applyMatrix4(flat.matrixWorldInverse)
          half = Math.max(half, Math.abs(corner.x), Math.abs(corner.y))
        }
        half = (half || 1) / FILL
        Object.assign(flat, { left: -half, right: half, top: half, bottom: -half, near: reach * 0.01, far: reach * 4 })
        flat.updateProjectionMatrix()

        const shown = parts.map((part) => part.object.visible)
        const laid = ground.objects.map((object) => object.visible)
        const stood = one.object.matrix.clone()
        const faint = drawnIn.map((material) => material.opacity)
        const lit = [key.position.clone(), fill.position.clone()]
        for (const part of parts) part.object.visible = part === one
        for (const object of ground.objects) object.visible = false
        one.object.matrix.identity()
        for (const material of drawnIn) material.opacity = material instanceof LineMaterial ? INK : 1
        for (const ink of inks) ink.resolution.set(PICTURE, PICTURE)
        light(HOME)

        easel.render(scene, flat)
        each(id, easel.domElement.toDataURL('image/png'))

        parts.forEach((part, index) => (part.object.visible = shown[index]))
        ground.objects.forEach((object, index) => (object.visible = laid[index]))
        one.object.matrix.copy(stood)
        drawnIn.forEach((material, index) => (material.opacity = faint[index]))
        for (const ink of inks) ink.resolution.set(WINDOW.width, WINDOW.height)
        key.position.copy(lit[0])
        fill.position.copy(lit[1])
        // one a frame, so that they do not hold the page up
        await new Promise(requestAnimationFrame)
      }
    } finally {
      easel.dispose()
      easel.forceContextLoss()
    }
  }

  return {
    draw,
    pictures,
    sharpen(next) {
      ground.sharpen(next)
      renderer.setPixelRatio(next)
      renderer.setSize(WINDOW.width, WINDOW.height, false)
    },
    dispose() {
      gone = true
      for (const part of parts)
        part.object.traverse((node) => (node as THREE.Mesh).geometry?.dispose())
      for (const { material } of colours.values()) material.dispose()
      edgeInk.dispose()
      cableInk.dispose()
      pickedInk.dispose()
      ground.dispose()
      renderer.dispose()
    },
  }
}
