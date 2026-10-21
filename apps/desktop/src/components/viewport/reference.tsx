// A reference scene in the view: things of a known real size, drawn round the model so
// that how big the model is can be seen (see lib/reference.ts).
//
// A scene is there to be looked past. It is all of one tone, a little off the colour
// the view is drawn over - lighter than that in the dark, darker in the light - and no
// light falls on it, the view's own or any other. What gives it its shape is a line,
// a little further off that colour again: round each thing in it, along each of its
// sharp edges, and where one part of it is seen in front of another. It is drawn the
// way the parts picked out together are hinted at (see Hint, in the scene), but as a
// thing that is there, which the model in front of it hides. Nothing in it can be
// picked.
//
// Its surfaces are drawn from the side they face, and from no other. A solid looks no
// different for that. A face on its own, the wall of a room, is seen from inside the
// room and seen through from outside it: the room is looked into from wherever the
// camera is, and no wall is ever in front of the model.
import * as React from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import type { Project } from "@shared/api"
import { useThemeColors, type ThemeColors } from "@/lib/css-color"
import { placed, readReference, type ReferenceScene } from "@/lib/reference"
import { loadSurfaces, type LoadedPart } from "./load"
import { passSize } from "./passes"
import { HOME_DIRECTION, MODEL_TO_WORLD, toWorld } from "./rig"
import { frame } from "./thumbnails"

export type LoadedReference = {
  scene: ReferenceScene
  /** all of it as one mesh, in the scene's own frame (mm, Z up) */
  geometry: THREE.BufferGeometry
  /** the box round it, in the same frame */
  box: THREE.Box3
}

/**
 * How much of the way from the colour the view is drawn over to the colour of its text
 * a scene is drawn in: all of it, and its lines.
 */
const TONE = {
  dark: { fill: 0.07, line: 0.3 },
  light: { fill: 0.08, line: 0.34 },
}
/** The same for the small picture of a scene, which has to show on a card of its own. */
const PICTURED = {
  dark: { fill: 0.2, line: 0.55 },
  light: { fill: 0.2, line: 0.55 },
}
/** How wide its lines are, in pixels: no wider than a part's. */
const LINE = 1
/**
 * How unlike two places in the picture a scene is told apart in have to be for a line to
 * begin between them, and for it to be there in full. Two things are well past that, and
 * so are two faces that meet at an edge. A face that curves is not, until it is small.
 */
const UNLIKE = { some: 0.02, all: 0.09 }
/**
 * And how much further off one place in it than those either side of it for a line to
 * begin there, and to be there in full: one part of a thing seen in front of another,
 * an arm across a body. It is counted in the width of what a pixel shows at that
 * distance, so it is the same line however near the camera is.
 */
const BEHIND_BY = { some: 5, all: 9 }
/**
 * Its surfaces are drawn a little further off than they are, and further than a part's
 * are: where the model stands on one of them, it is the model that is seen, and the
 * lines of the ground that are ruled on it.
 */
const BEHIND = {
  polygonOffset: true,
  polygonOffsetFactor: 3,
  polygonOffsetUnits: 3,
}
/** How fast it follows the model's being pulled apart: as fast as the parts go. */
const FOLLOWING = 9
const NOT_PICKED = () => {}

/** One triangle that covers the screen, whichever way the camera looks. */
const SCREEN = new THREE.BufferGeometry()
  .setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
  )
  .setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))

/**
 * A colour some of the way from the one the view is drawn over to the one its text is
 * in, mixed as the screen has them.
 */
function toned(colors: ThemeColors, amount: number): THREE.Color {
  const one = { r: 0, g: 0, b: 0 }
  const paper = colors.backdrop.getRGB({ ...one }, THREE.SRGBColorSpace)
  const ink = colors.foreground.getRGB({ ...one }, THREE.SRGBColorSpace)
  return new THREE.Color().setRGB(
    THREE.MathUtils.lerp(paper.r, ink.r, amount),
    THREE.MathUtils.lerp(paper.g, ink.g, amount),
    THREE.MathUtils.lerp(paper.b, ink.b, amount),
    THREE.SRGBColorSpace
  )
}

/** What a scene is seen in: one tone, the same whichever way a face is turned. */
const filled = (colors: ThemeColors, tones: typeof TONE) =>
  new THREE.MeshBasicMaterial({
    color: toned(colors, (colors.dark ? tones.dark : tones.light).fill),
    toneMapped: false,
    side: THREE.FrontSide,
    ...BEHIND,
  })

/**
 * What a scene is drawn in to be told apart, in the picture its lines are found in: each
 * thing in it a colour of its own, shifted by the way each of its faces is turned. So
 * one thing is unlike the next, and one face unlike another it meets at an edge. A
 * thing that is all rounded (`soft`) has no edges to tell, and is one colour all over:
 * the way its surface turns from place to place would otherwise be taken for some.
 */
const told = () =>
  new THREE.ShaderMaterial({
    vertexShader: `
      attribute float thing;
      attribute float soft;
      varying vec3 own;
      varying vec3 facing;
      varying float edged;
      void main() {
        // so much of red, of green and of blue, no two things near the same
        own = fract(thing * vec3(0.618, 0.755, 0.57) + 0.2);
        facing = normal;
        edged = 1.0 - soft;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 own;
      varying vec3 facing;
      varying float edged;
      void main() {
        gl_FragColor = vec4(
          0.5 * own + 0.25 + 0.25 * edged * normalize(facing), 1.0);
      }`,
    side: THREE.FrontSide,
  })

/**
 * The lines of a scene, to be laid over the view.
 *
 * The scene is drawn on its own into a picture that is not shown, on the occasion kept
 * for that, in what tells its things and their faces apart: and with it, how far off
 * each place in it is. Where the picture gives way from one colour to another, or to
 * none, is the edge of a thing as it is seen from here, or an edge on it, and gets a
 * line. So does a place that is much nearer or further off than those either side of
 * it would have it, which is where one part of a thing is in front of another. The line
 * is as far off as the nearest of what it lies between, so whatever of the model is in
 * front of the scene there hides it, as it hides the scene.
 */
function outlined(
  colors: ThemeColors,
  tones: typeof TONE,
  occasion: THREE.Layers
): { lines: THREE.Mesh; dispose: () => void } {
  const picture = new THREE.WebGLRenderTarget(1, 1, {
    // as smooth at its edges as the view, which is what keeps the line smooth (and drawn
    // at no more than PASS_RATIO, which keeps it cheap: see passSize)
    samples: 4,
    depthTexture: new THREE.DepthTexture(1, 1),
  })
  const material = new THREE.ShaderMaterial({
    uniforms: {
      picture: { value: picture.texture },
      far: { value: picture.depthTexture },
      reach: { value: new THREE.Vector2() },
      // how the camera turns how far off a place is into what the picture keeps of
      // it, and whether it has a lens; and what a step across the picture comes to,
      // in mm: at any distance with no lens, at a distance of 1 with one
      depths: { value: new THREE.Vector2() },
      lens: { value: 1 },
      across: { value: 1 },
      ink: {
        value: toned(colors, (colors.dark ? tones.dark : tones.light).line),
      },
    },
    vertexShader: `
      varying vec2 at;
      void main() {
        at = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D picture;
      uniform sampler2D far;
      uniform vec2 reach;
      uniform vec2 depths;
      uniform float lens;
      uniform float across;
      uniform vec3 ink;
      varying vec2 at;
      // how far from the camera a place is, in mm, from what the picture keeps of that
      float off(float kept) {
        float deep = kept * 2.0 - 1.0;
        return lens > 0.5 ? depths.y / (deep + depths.x) : (depths.y - deep) / depths.x;
      }
      void main() {
        vec4 here = texture2D(picture, at);
        float kept = texture2D(far, at).x;
        float away = off(kept);
        // A line goes where a place is unlike what is round it, any way from it; and
        // where it is not as far off as the places either side of it, taken together,
        // would have it. It is as far off as the nearest of them all.
        float unlike = 0.0;
        float out_of_line = 0.0;
        float nearest = kept;
        for (int way = 0; way < 4; way++) {
          vec2 by = (way == 0 ? vec2(1.0, 0.0) : way == 1 ? vec2(0.0, 1.0)
            : way == 2 ? vec2(0.7, 0.7) : vec2(0.7, -0.7)) * reach;
          float one = texture2D(far, at + by).x;
          float other = texture2D(far, at - by).x;
          unlike = max(unlike, max(
            distance(here, texture2D(picture, at + by)),
            distance(here, texture2D(picture, at - by))));
          out_of_line = max(out_of_line, abs(off(one) + off(other) - 2.0 * away));
          nearest = min(nearest, min(one, other));
        }
        float shown = across * (lens > 0.5 ? away : 1.0);
        float line = max(
          smoothstep(${UNLIKE.some}, ${UNLIKE.all}, unlike),
          smoothstep(${BEHIND_BY.some}.0, ${BEHIND_BY.all}.0, out_of_line / shown));
        if (line < 0.002) discard;
        gl_FragColor = vec4(ink, line);
        gl_FragDepth = nearest;
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  })
  const lines = new THREE.Mesh(SCREEN, material)
  lines.frustumCulled = false
  lines.raycast = NOT_PICKED
  // whenever the view is drawn, by whoever draws it, the picture is drawn first
  const size = new THREE.Vector2()
  const cleared = new THREE.Color()
  lines.onBeforeRender = (renderer, scene, camera) => {
    renderer.getDrawingBufferSize(size)
    const [wide, high] = passSize(size.x, size.y, renderer.getPixelRatio())
    if (picture.width !== wide || picture.height !== high)
      picture.setSize(wide, high)
    // half the line's width either side of an edge, as a share of the view's
    const half = (LINE * renderer.getPixelRatio()) / 2
    material.uniforms.reach.value.set(half / size.x, half / size.y)
    const seen = camera.projectionMatrix.elements
    material.uniforms.depths.value.set(seen[10], seen[14])
    material.uniforms.lens.value = (camera as THREE.PerspectiveCamera)
      .isPerspectiveCamera
      ? 1
      : 0
    // what that half comes to across the view, which is 2 high as the camera has it
    material.uniforms.across.value = (half * 2) / (seen[5] * size.y)
    const was = {
      target: renderer.getRenderTarget(),
      autoClear: renderer.autoClear,
      alpha: renderer.getClearAlpha(),
      background: scene.background,
      occasions: camera.layers.mask,
    }
    renderer.getClearColor(cleared)
    // it starts from nothing, which what was last drawn may have left it unable to do
    renderer.state.buffers.depth.setMask(true)
    renderer.state.buffers.color.setMask(true)
    renderer.setClearColor(0x000000, 0)
    renderer.autoClear = true
    scene.background = null
    camera.layers.mask = occasion.mask
    renderer.setRenderTarget(picture)
    renderer.render(scene, camera)
    renderer.setRenderTarget(was.target)
    camera.layers.mask = was.occasions
    scene.background = was.background
    renderer.autoClear = was.autoClear
    renderer.setClearColor(cleared, was.alpha)
  }
  return {
    lines,
    dispose: () => {
      picture.dispose()
      material.dispose()
    },
  }
}

/** The scenes that have been loaded, by what each is known by: the latest of each. */
const kept = new Map<
  string,
  { of: string; loading: Promise<LoadedReference> }
>()
/** How long a scene that has been built again is kept, ms, for whatever still draws it. */
const LINGER_MS = 2000

/** A scene's meshes, loaded: once for each time it is built. */
export function loadReference(scene: ReferenceScene): Promise<LoadedReference> {
  const of = scene.files.join("\n")
  const had = kept.get(scene.id)
  if (had?.of === of) return had.loading
  const loading = loadSurfaces(scene.files).then((geometry) => ({
    scene,
    geometry,
    box: geometry.boundingBox!.clone(),
  }))
  kept.set(scene.id, { of, loading })
  // the one it takes the place of is given back, once nothing draws it any more
  void loading
    .then(() => had?.loading)
    .then((before) => {
      if (before) setTimeout(() => before.geometry.dispose(), LINGER_MS)
    })
    .catch(() => {
      // it would not load: the next asking tries again
      if (kept.get(scene.id)?.loading === loading) kept.delete(scene.id)
    })
  return loading
}

/**
 * The scenes a project's model can be seen in: its own first, if it has one, then the
 * app's. Null until they have been asked for and had. Asked for again whenever the
 * project's own is rewritten.
 */
export function useReferenceScenes(project: Project): ReferenceScene[] | null {
  const [listed, setListed] = React.useState<{
    of: string
    scenes: ReferenceScene[]
  } | null>(null)
  const revision = project.reference
  React.useEffect(() => {
    let over = false
    void window.cad.reference.scenes(project.id).then((sources) => {
      if (over) return
      setListed({
        of: project.id,
        scenes: sources.flatMap((source) => {
          const scene = readReference(source, source.own ? (revision ?? 0) : 0)
          return scene ? [scene] : []
        }),
      })
    })
    return () => {
      over = true
    }
  }, [project.id, revision])
  return listed?.of === project.id ? listed.scenes : null
}

/**
 * A scene, loaded, for as long as one is wanted. While another is on its way, or the
 * same one built again, the one that was there stays.
 */
export function useLoadedReference(
  scene: ReferenceScene | null
): LoadedReference | null {
  const [loaded, setLoaded] = React.useState<LoadedReference | null>(null)
  // taken out of a scene, the model is in none: the next one it is set in is not to be
  // this one first, for the moment the other takes to come
  if (!scene && loaded) setLoaded(null)
  React.useEffect(() => {
    if (!scene) return
    let over = false
    loadReference(scene).then(
      (next) => {
        if (!over) setLoaded(next)
      },
      (error: unknown) => console.error("[reference]", error)
    )
    return () => {
      over = true
    }
  }, [scene])
  return scene ? loaded : null
}

/**
 * Where a scene is put for a model to stand in it: what it is moved by, in the model's
 * frame, so that the place in it where a model stands is under the middle of this one.
 */
export function placing(scene: ReferenceScene, model: THREE.Box3) {
  return new THREE.Vector3(
    ...placed(scene, { min: model.min.toArray(), max: model.max.toArray() })
  )
}

/**
 * How far down a scene goes under a model that is pulled apart: as far as the lowest of
 * the model's parts goes below where the model stood, by how far along their way out
 * the parts are (0 put together). Pulled apart, a model's lowest parts go down, and
 * would go into whatever the model stands on.
 */
export function sinking(parts: LoadedPart[], model: THREE.Box3) {
  const lows = parts.map(
    (part) => part.box.clone().applyMatrix4(part.home).min.z
  )
  const downs = parts.map((part) => part.away.z)
  /** `going` is how fast each goes down just now, where that is not yet as fast as it will */
  const sunk = (explode: number, going: ArrayLike<number> = downs) => {
    let most = 0
    lows.forEach((low, index) => {
      most = Math.max(most, model.min.z - (low + going[index] * explode))
    })
    return most
  }
  return Object.assign(sunk, { downs })
}

/**
 * How high the ground a scene stands on is, in the model's frame, with a model set in
 * it and pulled this far apart.
 */
export const groundOf = (
  loaded: LoadedReference,
  model: THREE.Box3,
  parts: LoadedPart[],
  explode: number
) =>
  placing(loaded.scene, model).z +
  loaded.scene.floor -
  sinking(parts, model)(explode)

/** All there is to see of a model set in a scene: the box round both, in the model's frame. */
export function setIn(loaded: LoadedReference, model: THREE.Box3): THREE.Box3 {
  return loaded.box.clone().translate(placing(loaded.scene, model)).union(model)
}

/**
 * A scene, drawn where the model stands in it. `children` are put on the ground the
 * scene stands on, under the model's own origin: the squares it is ruled into.
 *
 * Pulled apart, the scene goes down as far as the model's lowest parts do, in step with
 * them, and the model is seen to come apart over it (see `sinking`).
 */
export function Reference({
  loaded,
  model,
  parts,
  explode,
  colors,
  occasion,
  order,
  cover,
  children,
}: {
  loaded: LoadedReference
  /** the box round the model, put together */
  model: THREE.Box3
  parts: LoadedPart[]
  /** how far along their way out the parts are to be: 0 put together */
  explode: number
  colors: ThemeColors
  /** the occasion it is drawn on to be told apart, for its lines to be found */
  occasion: THREE.Layers
  /** where among all that is drawn its lines are laid over the view */
  order: number
  /**
   * The occasion it is drawn on to hide the glass that is behind it, while there is
   * glass about (see Glass, in the scene); null while there is none.
   */
  cover: THREE.Layers | null
  children?: React.ReactNode
}) {
  const group = React.useRef<THREE.Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const at = React.useMemo(
    () => placing(loaded.scene, model),
    [loaded.scene, model]
  )
  const material = React.useMemo(() => filled(colors, TONE), [colors])
  React.useEffect(() => () => material.dispose(), [material])
  const apart = React.useMemo(() => told(), [])
  React.useEffect(() => () => apart.dispose(), [apart])
  const outline = React.useMemo(
    () => outlined(colors, TONE, occasion),
    [colors, occasion]
  )
  React.useEffect(() => outline.dispose, [outline])

  const sunk = React.useMemo(() => sinking(parts, model), [parts, model])
  const current = React.useRef(explode)
  // How fast each part is going down. A model that comes apart another way, piece by
  // piece or part by part, has its parts go over to their other places, and what is
  // under them goes with the lowest of them the while (see PartModel).
  const going = React.useRef(sunk.downs)
  React.useEffect(() => invalidate(), [explode, at, sunk, invalidate])
  useFrame((_, delta) => {
    const next = THREE.MathUtils.damp(
      current.current,
      explode,
      FOLLOWING,
      Math.min(delta, 0.05)
    )
    let turning = false
    if (going.current !== sunk.downs) {
      const from = going.current
      // (put together, or with other parts than there were, there is nothing to go over)
      if (current.current !== 0 && from.length === sunk.downs.length) {
        const share = 1 - Math.exp(-FOLLOWING * Math.min(delta, 0.05))
        going.current = sunk.downs.map((to, index) => {
          const now = from[index] + (to - from[index]) * share
          if (Math.abs(to - now) > 0.01) turning = true
          return now
        })
      }
      if (!turning) going.current = sunk.downs
    }
    const moving = Math.abs(next - explode) > 0.0005 || turning
    current.current = Math.abs(next - explode) > 0.0005 ? next : explode
    group.current?.position.set(
      at.x,
      at.y,
      at.z - sunk(current.current, going.current)
    )
    if (moving) invalidate()
  })

  return (
    <group ref={group} position={at}>
      <mesh
        geometry={loaded.geometry}
        material={material}
        raycast={NOT_PICKED}
      />
      <mesh
        geometry={loaded.geometry}
        material={apart}
        layers={occasion}
        raycast={NOT_PICKED}
      />
      <primitive object={outline.lines} renderOrder={order} />
      {cover && (
        <mesh geometry={loaded.geometry} layers={cover} raycast={NOT_PICKED}>
          <meshBasicMaterial
            colorWrite={false}
            side={THREE.FrontSide}
            {...BEHIND}
          />
        </mesh>
      )}
      <group position={[-at.x, -at.y, loaded.scene.floor]}>{children}</group>
    </group>
  )
}

/** Pixels a side of a scene's picture: twice the size it is drawn at, for sharp screens. */
const PICTURE = 440
/** The occasion a scene is drawn on to be told apart, in a picture of it by itself. */
const APART = new THREE.Layers()
APART.set(1)
/** How much of its picture a scene fills. */
const FILL = 0.9

/**
 * The pictures that have been drawn, each as a data URL: by the scene as it was built,
 * and by whether it was drawn for the dark or for the light.
 */
const pictured = new Map<string, string>()
const pictureOf = (scene: ReferenceScene, dark: boolean) =>
  `${dark ? "dark" : "light"}\n${scene.files.join("\n")}`

/** A picture of each of some scenes, handed over as a data URL as each is drawn. */
async function draw(
  scenes: ReferenceScene[],
  colors: ThemeColors,
  each: (scene: ReferenceScene, url: string) => void,
  stopped: () => boolean
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(2)
  renderer.setSize(PICTURE / 2, PICTURE / 2, false)
  renderer.setClearColor(0x000000, 0)
  const world = new THREE.Scene()
  const root = new THREE.Group()
  root.rotation.set(...MODEL_TO_WORLD)
  world.add(root)
  const camera = new THREE.OrthographicCamera()
  const material = filled(colors, PICTURED)
  const apart = told()
  const outline = outlined(colors, PICTURED, APART)
  world.add(outline.lines)
  try {
    for (const scene of scenes) {
      const loaded = await loadReference(scene).catch(() => null)
      if (stopped()) break
      if (!loaded) continue
      const mesh = new THREE.Mesh(loaded.geometry, material)
      const marked = new THREE.Mesh(loaded.geometry, apart)
      marked.layers.mask = APART.mask
      root.add(mesh, marked)
      root.updateMatrixWorld(true)
      frame(
        camera,
        new THREE.Box3().setFromObject(mesh),
        toWorld(HOME_DIRECTION),
        FILL
      )
      renderer.render(world, camera)
      each(scene, renderer.domElement.toDataURL("image/png"))
      root.remove(mesh, marked)
    }
  } finally {
    material.dispose()
    apart.dispose()
    outline.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

/**
 * The pictures of some scenes, by what each is known by, filling in as they are drawn.
 * A scene is drawn once for each time it is built, and once more for the other theme:
 * the list of them can come and go without any being drawn again.
 */
export function useScenePictures(
  scenes: ReferenceScene[]
): Record<string, string> {
  const colors = useThemeColors()
  // (counts the pictures drawn since this was up, to show each as it is drawn)
  const [, setDrawn] = React.useState(0)
  React.useEffect(() => {
    const wanted = scenes.filter(
      (scene) => !pictured.has(pictureOf(scene, colors.dark))
    )
    if (wanted.length === 0) return
    let stopped = false
    void draw(
      wanted,
      colors,
      (scene, url) => {
        pictured.set(pictureOf(scene, colors.dark), url)
        if (!stopped) setDrawn((count) => count + 1)
      },
      () => stopped
    )
    return () => {
      stopped = true
    }
  }, [scenes, colors])
  return Object.fromEntries(
    scenes.flatMap((scene) => {
      const url = pictured.get(pictureOf(scene, colors.dark))
      return url ? [[scene.id, url]] : []
    })
  )
}
