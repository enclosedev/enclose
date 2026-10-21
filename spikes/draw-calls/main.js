// What does one frame of a model cost?
//
// Draws the model the way its viewer draws it today (one mesh per CAD face, as the
// exporter wrote them), then again with each part's faces merged into one mesh per
// material, and times both. Scene setup mirrors the viewer's scene.tsx so the two are
// like for like; the only thing that changes between rows is what the row says.
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import { LineMaterial } from "three/addons/lines/LineMaterial.js"
import { LineSegments2 } from "three/addons/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js"

const MODEL_URL = __MODEL_URL__
const query = new URLSearchParams(location.search)
const SHELL = query.get("shell") ?? "glass"
const REPORT = query.has("report") // run.js is driving: post progress and the result back
const FRAMES = Number(query.get("frames") ?? 40)
const WARMUP = 5 // shader compiles and buffer uploads land here, not in the timing
// the viewport: 1560 x 1552 CSS px on a 2x display
const SIZE = {
  w: Number(query.get("w") ?? 1560),
  h: Number(query.get("h") ?? 1552),
  dpr: Number(query.get("dpr") ?? 2),
}

const VARIANTS = [
  { id: "today", label: "As the viewer draws it today", merge: false, edges: "fat" },
  { id: "today-bare", label: "Same, edges off", merge: false, edges: "none" },
  { id: "merged-bare", label: "Merged per material, edges off", merge: true, edges: "none" },
  { id: "merged", label: "Merged per material, same edges", merge: true, edges: "fat" },
  { id: "merged-thin", label: "Merged per material, 1 px GL lines", merge: true, edges: "thin" },
]

// --- the viewer's constants (scene.tsx) ---------------------------------------------
const CAD_TO_WORLD = [-Math.PI / 2, 0, 0]
const GLB_TO_CAD = [Math.PI / 2, 0, 0]
const GLASS = new Set(["top", "bottom", "cap_l", "cap_r"])
const UNCOLOURED = "#aeb2b9"
const EDGE = "#0e1012"
const BEHIND_EDGES = { polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 1.5 }
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6) // section off

const canvas = document.getElementById("view")
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(SIZE.dpr)
renderer.setSize(SIZE.w, SIZE.h)
renderer.localClippingEnabled = true
const gl = renderer.getContext()

const camera = new THREE.PerspectiveCamera(30, SIZE.w / SIZE.h, 1, 4000)
const TARGET = new THREE.Vector3(0, 13, 0)
const HOME = new THREE.Vector3(0.5, 0.6, 0.62).normalize().multiplyScalar(330)
const UP = new THREE.Vector3(0, 1, 0)

/** A slow orbit, one step per frame, as when dragging the model round. */
function orbit(step) {
  camera.position.copy(HOME).applyAxisAngle(UP, step * 0.02).add(TARGET)
  camera.lookAt(TARGET)
}

// --- building one variant ------------------------------------------------------------

function restyle(src, part) {
  const mat = src.clone()
  if (src.color.getHex() === 0xffffff && !src.name) mat.color.set(part.color ?? UNCOLOURED)
  mat.metalness = 0.1
  mat.roughness = 0.62
  mat.side = THREE.DoubleSide
  mat.clippingPlanes = [plane]
  Object.assign(mat, BEHIND_EDGES)
  return mat
}

function float3(attr) {
  const out = new Float32Array(attr.count * 3)
  const direct =
    !attr.isInterleavedBufferAttribute && attr.array instanceof Float32Array && attr.itemSize === 3
  if (direct) out.set(attr.array.subarray(0, out.length))
  else
    for (let i = 0; i < attr.count; i++) {
      out[i * 3] = attr.getX(i)
      out[i * 3 + 1] = attr.getY(i)
      out[i * 3 + 2] = attr.getZ(i)
    }
  return new THREE.BufferAttribute(out, 3)
}

/** Position, normal and index only, moved into the part's own frame, so faces can be joined. */
function plain(src, matrix) {
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", float3(src.attributes.position))
  if (src.attributes.normal) g.setAttribute("normal", float3(src.attributes.normal))
  const count = src.attributes.position.count
  g.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: count }, (_, i) => i))
  g.applyMatrix4(matrix)
  if (!g.attributes.normal) g.computeVertexNormals()
  return g
}

/** Every face that wears the same material becomes one mesh. */
function merged(root, part, skin, made) {
  root.updateMatrixWorld(true)
  const buckets = new Map()
  root.traverse((o) => {
    if (!o.isMesh) return
    const key = skin ? skin : o.material
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(plain(o.geometry, o.matrixWorld))
  })
  const group = new THREE.Group()
  for (const [key, faces] of buckets) {
    const geometry = mergeGeometries(faces, false)
    if (!geometry) throw new Error(`could not merge ${part.id}`)
    faces.forEach((g) => g.dispose())
    made.push(geometry)
    group.add(new THREE.Mesh(geometry, skin ?? restyle(key, part)))
  }
  return group
}

function edgeLines(positions, mode, faint, made) {
  const look = {
    color: EDGE,
    transparent: true,
    opacity: faint ? 0.28 : 0.85,
    depthWrite: false,
    clippingPlanes: [plane],
  }
  if (mode === "fat") {
    const geometry = new LineSegmentsGeometry().setPositions(positions)
    made.push(geometry)
    return new LineSegments2(geometry, new LineMaterial({ ...look, linewidth: 1 }))
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  made.push(geometry)
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial(look))
}

function build(assets, variant) {
  const made = [] // geometries this variant created, to free afterwards
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  scene.add(new THREE.HemisphereLight("#ffffff", "#7d828c", 0.7))
  const key = new THREE.DirectionalLight(0xffffff, 1.7)
  key.position.set(180, 320, 220)
  const fill = new THREE.DirectionalLight(0xffffff, 0.55)
  fill.position.set(-240, 160, -180)
  scene.add(key, fill)

  const cad = new THREE.Group()
  cad.rotation.set(...CAD_TO_WORLD)
  scene.add(cad)

  for (const { part, gltf, edges } of assets) {
    const glass = GLASS.has(part.id) && SHELL === "glass"
    const skin =
      part.group === "inside"
        ? null
        : new THREE.MeshStandardMaterial({
            color: part.color ?? UNCOLOURED,
            metalness: part.group === "screws" ? 0.55 : 0.1,
            roughness: part.group === "screws" ? 0.45 : 0.62,
            side: THREE.DoubleSide,
            clippingPlanes: [plane],
            ...BEHIND_EDGES,
            transparent: glass,
            opacity: glass ? 0.2 : 1,
            depthWrite: !glass,
          })

    let object = gltf.clone(true)
    if (variant.merge) object = merged(object, part, skin, made)
    else
      object.traverse((o) => {
        if (o.isMesh) o.material = skin ?? restyle(o.material, part)
      })

    const toCad = new THREE.Group() // glTF is Y-up metres
    toCad.rotation.set(...GLB_TO_CAD)
    toCad.scale.setScalar(1000)
    toCad.add(object)

    const group = new THREE.Group()
    group.renderOrder = glass ? 2 : 0
    if (part.matrix)
      new THREE.Matrix4().set(...part.matrix).decompose(group.position, group.quaternion, new THREE.Vector3())
    group.add(toCad)
    if (variant.edges !== "none" && edges) group.add(edgeLines(edges, variant.edges, glass, made))
    cad.add(group)
  }
  return { scene, made }
}

// --- timing ---------------------------------------------------------------------------

/**
 * Milliseconds for one frame, start to pixels: render, then read one pixel back, which
 * cannot return until the GPU has finished drawing. Not tied to the display's refresh, so
 * a hidden or throttled tab measures the same as a visible one.
 */
function time(scene) {
  const pixel = new Uint8Array(4)
  const ms = []
  for (let i = 0; i < WARMUP + FRAMES; i++) {
    orbit(i)
    const t0 = performance.now()
    renderer.render(scene, camera)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    if (i >= WARMUP) ms.push(performance.now() - t0)
  }
  ms.sort((a, b) => a - b)
  const { calls, triangles } = renderer.info.render
  return {
    drawCalls: calls,
    triangles,
    medianMs: ms[ms.length >> 1],
    worstMs: ms[ms.length - 1],
  }
}

function tell(path, text) {
  return REPORT ? fetch(path, { method: "POST", body: text }) : Promise.resolve()
}

function show(results, note) {
  document.getElementById("status").textContent = note
  tell("/__bench/stage", note)
  const cells = (tag, values) => `<tr>${values.map((v) => `<${tag}>${v}</${tag}>`).join("")}</tr>`
  document.getElementById("results").innerHTML =
    cells("th", ["", "Draw calls", "Triangles", "ms / frame", "Frames / s"]) +
    results
      .map((r) =>
        cells("td", [
          r.label,
          r.drawCalls.toLocaleString(),
          r.triangles.toLocaleString(),
          r.medianMs.toFixed(1),
          (1000 / r.medianMs).toFixed(0),
        ])
      )
      .join("")
}

async function main() {
  const bench = (window.__bench = { done: false, error: null, results: [], shots: {} })
  const debug = gl.getExtension("WEBGL_debug_renderer_info")
  bench.gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown"
  bench.size = `${SIZE.w * SIZE.dpr} x ${SIZE.h * SIZE.dpr} px, shells ${SHELL}`

  const t0 = performance.now()
  const report = await (await fetch(MODEL_URL + "report.json")).json()
  const loader = new GLTFLoader()
  const assets = await Promise.all(
    report.parts.map(async (part) => ({
      part,
      gltf: (await loader.loadAsync(MODEL_URL + part.file)).scene,
      edges: part.edges
        ? new Float32Array(await (await fetch(MODEL_URL + part.edges)).arrayBuffer())
        : null,
    }))
  )
  bench.loadMs = performance.now() - t0
  tell("/__bench/stage", `loaded ${assets.length} parts in ${Math.round(bench.loadMs)} ms on ${bench.gpu}`)

  for (const variant of VARIANTS) {
    show(bench.results, `Measuring: ${variant.label}…`)
    await new Promise((r) => setTimeout(r, 30)) // let the status paint
    const t1 = performance.now()
    const { scene, made } = build(assets, variant)
    const buildMs = performance.now() - t1
    bench.results.push({ id: variant.id, label: variant.label, buildMs, ...time(scene) })
    // same view of each, to check the merged model still looks the same
    orbit(0)
    renderer.render(scene, camera)
    bench.shots[variant.id] = canvas.toDataURL("image/jpeg", 0.8)
    made.forEach((g) => g.dispose())
    renderer.renderLists.dispose()
  }

  show(bench.results, `${bench.gpu} · ${bench.size} · median of ${FRAMES} frames`)
  bench.done = true
  await tell("/__bench/result", JSON.stringify(bench))
}

main().catch((error) => {
  window.__bench = { ...window.__bench, done: true, error: String(error?.stack ?? error) }
  document.getElementById("status").textContent = String(error)
  tell("/__bench/result", JSON.stringify(window.__bench))
})
