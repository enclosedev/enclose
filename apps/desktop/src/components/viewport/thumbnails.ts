// A small picture of each part, for the parts list. They are drawn once per model, off
// screen, by a renderer of their own that is thrown away when it is done: each part by
// itself, from the side the model opens on, filling the picture whatever its size. A
// part drawn before, just as it is now, is not drawn again.
import * as React from "react"
import * as THREE from "three"
import { create } from "zustand"

import { useThemeColors } from "@/lib/css-color"
import { UNDER_FROM, underlit } from "./light"
import type { LoadedModel, LoadedPart, Skin } from "./load"
import { drawingOf, EDGE, finish, skinColour } from "./paint"
import { HOME_DIRECTION, MODEL_TO_WORLD, toWorld } from "./rig"

/** Pixels a side: twice the size they are shown at, for sharp screens. */
const SIZE = 300
/** How much of the picture the part fills. */
const FILL = 0.86
/**
 * A part that covers less of its picture than this is several small pieces far apart,
 * a set of screws say, and is shown by the largest of them instead.
 */
const SPARSE = 0.05

/**
 * Where the largest piece of what has just been drawn is: the box round it, in pixels
 * from the bottom left, and how much of the picture everything drawn covers.
 */
function largestPiece(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  const drawn = (index: number) => pixels[index * 4 + 3] > 24
  const seen = new Uint8Array(SIZE * SIZE)
  let covered = 0
  let best = { count: 0, x0: 0, x1: SIZE - 1, y0: 0, y1: SIZE - 1 }
  for (let start = 0; start < SIZE * SIZE; start++) {
    if (seen[start] || !drawn(start)) continue
    const piece = { count: 0, x0: SIZE, x1: 0, y0: SIZE, y1: 0 }
    const todo = [start]
    seen[start] = 1
    while (todo.length > 0) {
      const at = todo.pop()!
      const x = at % SIZE
      const y = (at - x) / SIZE
      piece.count++
      piece.x0 = Math.min(piece.x0, x)
      piece.x1 = Math.max(piece.x1, x)
      piece.y0 = Math.min(piece.y0, y)
      piece.y1 = Math.max(piece.y1, y)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue
        const next = ny * SIZE + nx
        if (seen[next] || !drawn(next)) continue
        seen[next] = 1
        todo.push(next)
      }
    }
    covered += piece.count
    if (piece.count > best.count) best = piece
  }
  return { ...best, covered: covered / (SIZE * SIZE) }
}

/**
 * Somewhere to draw a model off screen: lit the way the view is, with a place in it
 * (`root`) where what is put stands the way the view stands it.
 */
export function stage() {
  const scene = new THREE.Scene()
  const sun = new THREE.DirectionalLight("#ffffff", 1.7)
  sun.position.set(180, 320, 220)
  const fill = new THREE.DirectionalLight("#ffffff", 0.55)
  fill.position.set(-240, 160, -180)
  // and from under it, as strong as where each picture is drawn from makes it
  const under = new THREE.DirectionalLight("#ffffff", 0)
  under.position.set(...UNDER_FROM)
  scene.onBeforeRender = (_renderer, _scene, camera) => {
    under.intensity = underlit(camera)
  }
  scene.add(
    new THREE.AmbientLight("#ffffff", 0.55),
    new THREE.HemisphereLight("#ffffff", "#7d828c", 0.7),
    sun,
    fill,
    under
  )
  const root = new THREE.Group()
  root.rotation.set(...MODEL_TO_WORLD)
  scene.add(root)
  return { scene, root }
}

/**
 * A part as it is drawn off screen, where it sits in the model: its surfaces in the
 * colours the view gives them, and its edges. `dispose` gives back what was made for it.
 */
export function standing(
  part: LoadedPart,
  dark: boolean,
  /** the colour the user has given it, if they have */
  chosen: string | undefined
) {
  const holder = new THREE.Group()
  holder.applyMatrix4(part.home)
  const made: { dispose(): void }[] = []
  for (const skin of part.skins) {
    const material = new THREE.MeshStandardMaterial({
      color: skinColour(part, skin, dark, chosen),
      ...finish(part),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1.5,
      polygonOffsetUnits: 1.5,
    })
    holder.add(new THREE.Mesh(skin.geometry, material))
    made.push(material)
  }
  const edges = new THREE.BufferGeometry()
  edges.setAttribute("position", new THREE.BufferAttribute(part.edges, 3))
  const line = new THREE.LineBasicMaterial({
    color: EDGE,
    transparent: true,
    opacity: 0.6,
  })
  holder.add(new THREE.LineSegments(edges, line))
  made.push(edges, line)
  return {
    holder,
    dispose: () => {
      for (const thing of made) thing.dispose()
    },
  }
}

/**
 * Point a camera at the middle of a box from the way `from` goes, and open the picture
 * just wide enough for the box to take up `fill` of it. `shape` is how wide the picture
 * is for its height. Returns half the picture's height, in the model's own measure.
 */
export function frame(
  camera: THREE.OrthographicCamera,
  box: THREE.Box3,
  from: THREE.Vector3,
  fill: number,
  shape = 1
): number {
  const middle = box.getCenter(new THREE.Vector3())
  const reach = box.getSize(new THREE.Vector3()).length() || 1
  camera.position.copy(middle).addScaledVector(from, reach * 2)
  camera.lookAt(middle)
  camera.updateMatrixWorld(true)
  const corner = new THREE.Vector3()
  let half = 0
  for (let i = 0; i < 8; i++) {
    corner
      .set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      )
      .applyMatrix4(camera.matrixWorldInverse)
    half = Math.max(half, Math.abs(corner.x) / shape, Math.abs(corner.y))
  }
  half = (half || 1) / fill
  Object.assign(camera, {
    left: -half * shape,
    right: half * shape,
    top: half,
    bottom: -half,
    near: reach * 0.01,
    far: reach * 4,
  })
  camera.updateProjectionMatrix()
  return half
}

/**
 * The pictures drawn of parts, by their meshes and then by how each was drawn (see
 * drawingOf): a part that is just as it was, in a model built again, has its picture
 * already. A few of each, for the same meshes turned other ways in a model, or a theme
 * gone back to; and gone with the meshes.
 */
const pictured = new WeakMap<Skin[], Map<string, string>>()
const PICTURES_KEPT = 6

function picturedAs(part: LoadedPart, drawing: string): string | undefined {
  return pictured.get(part.skins)?.get(drawing)
}

function keepPicture(part: LoadedPart, drawing: string, url: string) {
  let kept = pictured.get(part.skins)
  if (!kept) pictured.set(part.skins, (kept = new Map()))
  kept.delete(drawing)
  kept.set(drawing, url)
  for (const old of kept.keys()) {
    if (kept.size <= PICTURES_KEPT) break
    kept.delete(old)
  }
}

/** Draw every part of a model, handing each picture over as a data URL as it is made. */
async function draw(
  parts: LoadedPart[],
  dark: boolean,
  colours: Record<string, string>,
  each: (part: LoadedPart, url: string) => void,
  stopped: () => boolean
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE, SIZE, false)
  renderer.setClearColor(0x000000, 0)

  const { scene, root } = stage()
  const camera = new THREE.OrthographicCamera()
  const from = toWorld(HOME_DIRECTION)

  try {
    for (const part of parts) {
      if (stopped()) break
      const { holder, dispose } = standing(part, dark, colours[part.part.id])
      root.add(holder)
      root.updateMatrixWorld(true)

      const box = new THREE.Box3().setFromObject(holder)
      const half = frame(camera, box, from, FILL)

      renderer.render(scene, camera)
      const piece = largestPiece(renderer.getContext())
      if (piece.count > 0 && piece.covered < SPARSE) {
        const across = (2 * half) / SIZE
        const x = ((piece.x0 + piece.x1 + 1) / 2) * across - half
        const y = ((piece.y0 + piece.y1 + 1) / 2) * across - half
        const wide = Math.max(piece.x1 - piece.x0, piece.y1 - piece.y0) + 1
        const close = Math.max((wide * across) / 2 / FILL, half * 0.03)
        Object.assign(camera, {
          left: x - close,
          right: x + close,
          top: y + close,
          bottom: y - close,
        })
        camera.updateProjectionMatrix()
        renderer.render(scene, camera)
      }
      each(part, renderer.domElement.toDataURL("image/png"))

      root.remove(holder)
      dispose()
      // one a frame, so a model of many parts does not hold the window up
      await new Promise(requestAnimationFrame)
    }
  } finally {
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

/**
 * The pictures of the parts of the model on screen, by part id, as far as they have been
 * drawn. Kept here, out of the view: each picture that comes in is news to its own card
 * in the parts list (see usePartPicture), and to nothing else.
 */
const usePictures = create<{ urls: Record<string, string> }>(() => ({
  urls: {},
}))

/** The picture of one part of the model on screen, once it has been drawn. */
export const usePartPicture = (partId: string): string | undefined =>
  usePictures((state) => state.urls[partId])

/**
 * Draws the pictures of a model's parts, filling them in as they are drawn (see
 * usePartPicture). Nothing is drawn until they are first wanted.
 */
export function useThumbnails(
  loaded: LoadedModel | null,
  wanted: boolean,
  /** the colours the user has given parts, by part: the pictures are in them too */
  colours: Record<string, string>
) {
  const { dark, palette } = useThemeColors()
  // once started for a model they are finished, wanted or not
  const [started, setStarted] = React.useState<LoadedModel | null>(null)
  if (wanted && loaded && started !== loaded) setStarted(loaded)
  const go = loaded !== null && started === loaded
  /** The model and theme the pictures up were drawn for. */
  const drawnFor = React.useRef<{
    of: LoadedModel
    dark: boolean
    palette: Record<string, string>
  } | null>(null)
  // (nothing of this model's is left up for the next to be shown with)
  React.useEffect(() => () => usePictures.setState({ urls: {} }), [])

  // (before the list is shown again, so that it is never shown with what was put away)
  React.useLayoutEffect(() => {
    if (!go || !loaded) return
    let stopped = false
    // While they are drawn again in a colour newly given, the ones there are stay up;
    // of another model, or in another theme, they are put away. Those drawn before
    // just as they are now are put up at once, and the rest are drawn.
    const was = drawnFor.current
    const keep =
      was?.of === loaded && was.dark === dark && was.palette === palette
    drawnFor.current = { of: loaded, dark, palette }
    const known: Record<string, string> = {}
    const left: LoadedPart[] = []
    const drawings = new Map<LoadedPart, string>()
    for (const part of loaded.parts) {
      const drawing = drawingOf(part, dark, colours[part.part.id])
      drawings.set(part, drawing)
      const url = picturedAs(part, drawing)
      if (url) known[part.part.id] = url
      else left.push(part)
    }
    usePictures.setState((state) => ({
      urls: keep ? { ...state.urls, ...known } : known,
    }))
    // and what comes in is put up at most once a frame, all that came in it together
    let coming: Record<string, string> = {}
    let frame = 0
    const putUp = () => {
      frame = 0
      const urls = coming
      coming = {}
      usePictures.setState((state) => ({ urls: { ...state.urls, ...urls } }))
    }
    if (left.length > 0)
      void draw(
        left,
        dark,
        colours,
        (part, url) => {
          keepPicture(part, drawings.get(part)!, url)
          if (stopped) return
          coming[part.part.id] = url
          frame ||= requestAnimationFrame(putUp)
        },
        () => stopped
      )
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
    }
    // (palette: drawn again in a theme's colours, the palette is read as they are drawn)
  }, [go, loaded, dark, palette, colours])
}
