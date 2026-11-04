// What a part made of something is drawn with in Render (see shared/materials.ts): a
// physical material, lit by a studio, with its grain or weave laid on it where it has
// one. The studio is a bright room with soft lights all round it (three's own
// RoomEnvironment), made rather than photographed: a metal shows what is round it, and
// in a photographed studio a face turned up to its dark ceiling goes black.
//
// A part from CAD has no say in how a picture is laid on it: its surfaces come with no
// coordinates for that. So a picture is laid on from three sides, along the part's own
// axes, each side counting for as much as a surface faces it: the way a box would be
// wrapped. Each side of the part has the grain run along its longer edge to begin with,
// as a board's does, and it is turned from there.
import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"

import {
  materialOf,
  type Material,
  type MaterialTexture,
  type PartMaterial,
} from "@shared/materials"

/** The pictures of each grain and weave, by their file's name. */
const PICTURES = import.meta.glob<string>("@/assets/materials/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
})
const pictureUrl = (name: string) =>
  Object.entries(PICTURES).find(([path]) => path.endsWith(`/${name}.jpg`))?.[1]

/** A grain's three pictures: its colour, how its surface lies, and how rough it is. */
export type Grain = {
  map: THREE.Texture | null
  normal: THREE.Texture
  rough: THREE.Texture | null
}

const grains = new Map<string, Promise<Grain>>()

const tiled = (texture: THREE.Texture) => {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function loaded(name: string, colour: boolean): Promise<THREE.Texture> {
  const url = pictureUrl(name)
  if (!url) return Promise.reject(new Error(`No picture called ${name}`))
  return new THREE.TextureLoader().loadAsync(url).then((texture) => {
    if (colour) texture.colorSpace = THREE.SRGBColorSpace
    return tiled(texture)
  })
}

/** A picture's grain, loaded once for every part that has it. */
function pictured(texture: MaterialTexture): Promise<Grain> {
  let found = grains.get(texture)
  if (!found) {
    found = Promise.all([
      loaded(`${texture}-color`, true),
      loaded(`${texture}-normal`, false),
      loaded(`${texture}-rough`, false),
    ]).then(([map, normal, rough]) => ({ map, normal, rough }))
    grains.set(texture, found)
  }
  return found
}

/** A random number from a seed, the same each time. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/**
 * How a surface lies, from how high it is at each point of a square that tiles: a
 * picture of which way it faces there, as a normal map has it.
 */
function normalsOf(heights: Float32Array, size: number, depth: number) {
  const data = new Uint8Array(size * size * 4)
  const at = (x: number, y: number) =>
    heights[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * depth
      const dy = (at(x, y + 1) - at(x, y - 1)) * depth
      const length = Math.hypot(dx, dy, 1)
      const index = (y * size + x) * 4
      data[index] = Math.round((-dx / length / 2 + 0.5) * 255)
      data[index + 1] = Math.round((-dy / length / 2 + 0.5) * 255)
      data[index + 2] = Math.round((1 / length / 2 + 0.5) * 255)
      data[index + 3] = 255
    }
  const texture = new THREE.DataTexture(data, size, size)
  texture.needsUpdate = true
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return tiled(texture)
}

/**
 * Brushed metal: fine lines along one way, each a little higher or lower than the next,
 * and each a little uneven along its length.
 */
function brushed(): Grain {
  const size = 512
  const random = seeded(7)
  const heights = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const height = random()
    const uneven = random() * 0.25
    const phase = random() * Math.PI * 2
    const times = 1 + Math.floor(random() * 3)
    for (let x = 0; x < size; x++)
      heights[y * size + x] =
        height + uneven * Math.sin((x / size) * Math.PI * 2 * times + phase)
  }
  return { map: null, normal: normalsOf(heights, size, 0.5), rough: null }
}

/**
 * Hammered metal: shallow dents all over it, of about a size, that run into one another
 * and tile.
 */
function hammered(): Grain {
  const size = 512
  const random = seeded(11)
  const heights = new Float32Array(size * size)
  const dents = Array.from({ length: 70 }, () => ({
    x: random() * size,
    y: random() * size,
    r: size * (0.06 + random() * 0.05),
  }))
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // the deepest of the dents here: a dent is a bowl, and the bowls cut into one another
      let h = 0
      for (const dent of dents) {
        let dx = Math.abs(x - dent.x)
        let dy = Math.abs(y - dent.y)
        dx = Math.min(dx, size - dx)
        dy = Math.min(dy, size - dy)
        const d = Math.hypot(dx, dy) / dent.r
        if (d < 1) h = Math.min(h, -(1 - d * d))
      }
      heights[y * size + x] = h * 6
    }
  return { map: null, normal: normalsOf(heights, size, 1), rough: null }
}

const patterns = new Map<string, Grain>()

/** The grain of a material, if it has one: its pictures, or a pattern the app makes. */
export function grainOf(material: Material): Promise<Grain> | Grain | null {
  if (material.texture) return pictured(material.texture)
  if (!material.pattern) return null
  let made = patterns.get(material.pattern)
  if (!made) {
    made = material.pattern === "brushed" ? brushed() : hammered()
    patterns.set(material.pattern, made)
  }
  return made
}

/**
 * The material a part is drawn with in Render, where it has been given none: what its
 * model says of it. Glass is clear glass, metal its own metal, and the rest plastic of
 * its own colour, as Solid has it.
 */
export function ownMaterial(part: {
  clear: boolean
  metal: boolean
}): Material {
  if (part.clear) return materialOf("glass-clear")!
  if (part.metal)
    return {
      id: "own-metal",
      kind: "metal",
      name: "Metal",
      finish: "Own",
      tinted: true,
      colour: "#aeb2b9",
      metalness: 1,
      roughness: 0.3,
    }
  return DEFAULT_MATERIAL
}

/** What a part with no material is in Render: a plastic of its colour, not shiny. */
export const DEFAULT_MATERIAL: Material = {
  id: "default",
  kind: "utility",
  name: "Default",
  finish: "Solid",
  tinted: true,
  colour: "#d4d4d4",
  metalness: 0.05,
  roughness: 0.5,
}

/** How far across one picture of a grain is on a part, mm, as it is set. */
const tileOf = (material: Material, chosen: PartMaterial | null) =>
  (material.tile ?? 50) * (chosen?.scale ?? 1)

/**
 * A part's material in Render: the one given, set as it is. `size` is how big the part
 * is along each of its own axes, mm: which way each side's grain runs. `grain` is the
 * material's, once it is loaded (see grainOf): until then it is drawn without.
 */
export function physicalOf(
  material: Material,
  chosen: PartMaterial | null,
  size: THREE.Vector3,
  grain: Grain | null
): THREE.MeshPhysicalMaterial {
  const roughness = THREE.MathUtils.clamp(
    material.roughness * (chosen?.roughness ?? 1),
    0.02,
    1
  )
  const made = new THREE.MeshPhysicalMaterial({
    metalness: material.metalness,
    roughness,
    clearcoat: material.clearcoat ?? 0,
    clearcoatRoughness: material.clearcoatRoughness ?? 0,
    transmission: material.transmission ?? 0,
    thickness: material.thickness ?? 0,
    ior: material.ior ?? 1.5,
    sheen: material.sheen ?? 0,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0xffffff),
    transparent: material.opacity !== undefined,
    opacity: material.opacity ?? 1,
    depthWrite: material.opacity === undefined,
  })
  if (material.glow) made.emissiveIntensity = material.glow
  if (!grain) return made
  const uniforms = {
    triMap: { value: grain.map },
    triNormal: { value: grain.normal },
    triRough: { value: grain.rough },
    triScale: { value: 1 / tileOf(material, chosen) },
    triTurn: { value: ((chosen?.rotation ?? 0) * Math.PI) / 180 },
    // each side's grain along its longer edge: the side across x has y and z, and so on
    triAlong: {
      value: new THREE.Vector3(
        size.z > size.y ? 1 : 0,
        size.z > size.x ? 1 : 0,
        size.y > size.x ? 1 : 0
      ),
    },
    triRelief: { value: material.relief ?? 0.5 },
  }
  const flags = [
    grain.map ? "TRI_MAP" : "",
    grain.rough ? "TRI_ROUGH" : "",
  ].filter(Boolean)
  made.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.defines = {
      ...shader.defines,
      ...Object.fromEntries(flags.map((flag) => [flag, ""])),
    }
    laidOn(shader)
  }
  made.customProgramCacheKey = () => `tri ${flags.join(" ")}`
  return made
}

/** The shader of a physical material with a grain laid on it from three sides. */
function laidOn(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = shader.vertexShader
    .replace(
      "void main() {",
      `varying vec3 vTriAt;
      varying vec3 vTriFacing;
      varying vec3 vTriX;
      varying vec3 vTriY;
      varying vec3 vTriZ;
      void main() {`
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vTriAt = position;
      vTriFacing = normal;
      vTriX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
      vTriY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
      vTriZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`
    )
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "void main() {",
      `uniform sampler2D triMap;
      uniform sampler2D triNormal;
      uniform sampler2D triRough;
      uniform float triScale;
      uniform float triTurn;
      uniform vec3 triAlong;
      uniform float triRelief;
      varying vec3 vTriAt;
      varying vec3 vTriFacing;
      varying vec3 vTriX;
      varying vec3 vTriY;
      varying vec3 vTriZ;

      // how much each side counts for here: as much as the surface faces it, sharply
      vec3 triWeights() {
        vec3 w = pow(abs(normalize(vTriFacing)), vec3(4.0));
        return w / (w.x + w.y + w.z);
      }
      float triAngle(float along) { return triTurn + along * 1.5707963; }
      vec2 triTurned(vec2 at, float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return vec2(c * at.x + s * at.y, -s * at.x + c * at.y);
      }
      // where on the picture each side has this point
      vec2 triOnX() { return triTurned(vTriAt.yz * triScale, triAngle(triAlong.x)); }
      vec2 triOnY() { return triTurned(vTriAt.xz * triScale, triAngle(triAlong.y)); }
      vec2 triOnZ() { return triTurned(vTriAt.xy * triScale, triAngle(triAlong.z)); }
      vec4 triSampled(sampler2D picture) {
        vec3 w = triWeights();
        return texture2D(picture, triOnX()) * w.x
          + texture2D(picture, triOnY()) * w.y
          + texture2D(picture, triOnZ()) * w.z;
      }
      // a side's normal map, as a tilt of the surface along the part's own axes
      vec2 triTilt(vec2 at, float angle) {
        vec2 t = texture2D(triNormal, at).xy * 2.0 - 1.0;
        return triTurned(t, -angle) * triRelief;
      }
      void main() {`
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      #ifdef TRI_MAP
        diffuseColor *= triSampled(triMap);
      #endif`
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      #ifdef TRI_ROUGH
        roughnessFactor = clamp(roughnessFactor * (0.4 + 1.2 * triSampled(triRough).g), 0.02, 1.0);
      #endif`
    )
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      {
        vec3 w = triWeights();
        vec3 facing = normalize(vTriFacing);
        vec2 x = triTilt(triOnX(), triAngle(triAlong.x));
        vec2 y = triTilt(triOnY(), triAngle(triAlong.y));
        vec2 z = triTilt(triOnZ(), triAngle(triAlong.z));
        vec3 own = normalize(
          facing
          + vec3(0.0, x.x, x.y) * w.x
          + vec3(y.x, 0.0, y.y) * w.y
          + vec3(z.x, z.y, 0.0) * w.z
        );
        normal = normalize(own.x * vTriX + own.y * vTriY + own.z * vTriZ) * faceDirection;
      }`
    )
}

/** The studio a material is lit by, made ready for a renderer: once for each. */
const studios = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()
export function studioFor(renderer: THREE.WebGLRenderer): THREE.Texture {
  let found = studios.get(renderer)
  if (!found) {
    const making = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    found = making.fromScene(room, 0.04).texture
    room.dispose()
    making.dispose()
    studios.set(renderer, found)
  }
  return found
}

/**
 * The ball a material is pictured on: with a groove round it, turned across the
 * picture, that shows how the material takes an edge. As big as a few of its grain.
 */
function ball(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = []
  const steps = 96
  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / steps
    let r = Math.cos(t)
    const y = Math.sin(t)
    // the groove, round the middle
    const into = Math.max(0, 1 - Math.abs(y) / 0.05)
    r -= into * 0.06
    points.push(new THREE.Vector2(Math.max(r, 0.0001), y))
  }
  const geometry = new THREE.LatheGeometry(points, 96)
  geometry.rotateZ(-Math.PI / 4)
  geometry.rotateX(0.35)
  return geometry
}
/** The ball, a unit across, from which each is made as big as it is drawn. */
let unit: THREE.BufferGeometry | null = null

let picturing: {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>
} | null = null
const pictures = new Map<string, Promise<string>>()
/** One ball at a time is drawn: they share the one renderer. */
let queue: Promise<unknown> = Promise.resolve()

/** How many pixels across a picture of a material is drawn, at the most. */
const PICTURE_SIZE = 256

/**
 * A picture of a material on its ball, as it is set and in the colour given (for one
 * that takes the part's colour): a data URL, the same for the same, made once.
 */
export function pictureOf(
  material: Material,
  chosen: PartMaterial | null,
  colour: string
): Promise<string> {
  const key = [
    material.id,
    material.tinted ? colour : "",
    chosen?.roughness ?? 1,
    chosen?.scale ?? 1,
    chosen?.rotation ?? 0,
  ].join(" ")
  let found = pictures.get(key)
  if (!found) {
    found = (queue = queue.then(() =>
      drawn(material, chosen, colour)
    )) as Promise<string>
    pictures.set(key, found)
    // one that could not be drawn is tried again the next time it is asked for
    found.catch(() => pictures.delete(key))
  }
  return found
}

async function drawn(
  material: Material,
  chosen: PartMaterial | null,
  colour: string
): Promise<string> {
  if (!picturing) {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(PICTURE_SIZE, PICTURE_SIZE, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(2, 3, 4)
    scene.add(key)
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial()
    )
    scene.add(mesh)
    picturing = { renderer, scene, camera, mesh }
  }
  const { renderer, scene, camera, mesh } = picturing
  scene.environment = studioFor(renderer)
  const grain = grainOf(material)
  const had = grain instanceof Promise ? await grain : grain
  // a ball as big as a few of its grain across, so that the grain is seen: made so
  // big, since the grain is laid on by where on it each point is (see laidOn)
  const radius = had ? tileOf(material, chosen) * 0.35 : 40
  unit ??= ball()
  mesh.geometry.dispose()
  mesh.geometry = unit.clone().scale(radius, radius, radius)
  camera.position.set(0, 0, radius * 5)
  camera.near = radius
  camera.far = radius * 10
  camera.updateProjectionMatrix()
  const made = physicalOf(
    material,
    chosen,
    new THREE.Vector3(2, 2, 2).multiplyScalar(radius),
    had
  )
  made.color.set(
    material.tinted ? colour : had?.map ? "#ffffff" : material.colour
  )
  if (material.glow) made.emissive.set(colour)
  mesh.material.dispose()
  mesh.material = made
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL("image/png")
}

/**
 * The colour a part is drawn in, in Render, before any picture of its grain is laid
 * over that: the part's own, for a material that takes it; white under a picture,
 * which has the colour; and otherwise the material's own.
 */
export function baseOf(
  material: Material,
  partColour: THREE.Color
): THREE.Color {
  if (material.tinted) return partColour.clone()
  if (material.texture) return new THREE.Color(0xffffff)
  return new THREE.Color(material.colour)
}
