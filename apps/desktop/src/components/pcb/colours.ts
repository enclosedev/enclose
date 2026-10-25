// The colours a circuit board is drawn in, in 3D in PCB mode: the app's own, as the theme
// the window is in has them, in place of those tscircuit gives it. Its 3D file has each
// side of the board as a picture, of its mask, copper and lettering in tscircuit's
// colours, and its edge as one colour: each of those is drawn in the app's colour for it
// instead, and drawn again in another as soon as the theme changes it. What is on the
// board is in its makers' colours, which are mostly greys: each grey is drawn in the
// theme's shade for greys as light, as much lighter or darker than that as it was. And
// its keep-outs, which tscircuit hatches as coarsely as its picture is drawn, are
// hatched again by the app, finer, and as finely on every board.
import * as THREE from "three"

import type { PcbColours } from "@shared/theme-format"
import type { Circuit } from "./boards"

/**
 * The materials tscircuit gives the board itself, as against what is on it: its top and
 * its bottom, each a picture of its copper, mask and lettering, and its edge.
 */
export const BOARD_ITSELF = /^(TopMaterial|BottomMaterial|GreenSideMaterial)/

/** What of the theme's colours a board in 3D is drawn in. */
type BoardColour = Extract<keyof PcbColours, `board-${string}`>

/**
 * Each colour tscircuit draws a board's sides in, and which of the app's is drawn in its
 * place: none, where it stays as it is.
 */
const COLOURS: readonly (readonly [
  theirs: string,
  ours: BoardColour | null,
])[] = [
  // the mask
  ["#0f4f30", "board-mask"],
  // the mask over copper: traces
  ["#17613b", "board-traces"],
  // and a pour of copper: drawn as copper half seen through, and over that the mask over
  // copper, nine tenths of it (circuit-to-svg's way, in sRGB)
  ["#22663c", "board-pour"],
  // bare copper: pads
  ["#ffe066", "board-pads"],
  // the lettering
  ["#ffffff", "board-print"],
  // keep-outs, hatched: as the lettering
  ["#ff6b6b", "board-print"],
  // holes, shaded darker over the rest
  ["#000000", null],
]
/** The board's edge, which has no picture on it: the lighter of the greens. */
const EDGE: BoardColour = "board-traces"
/** Where in COLOURS the mask is, and the keep-outs' hatching. */
const MASK = 0
const KEEP_OUT = COLOURS.findIndex(([theirs]) => theirs === "#ff6b6b")
/** And bare copper, which the app draws its vias in (see `viaCopper`). */
const PADS = COLOURS.findIndex(([theirs]) => theirs === "#ffe066")

/**
 * How a keep-out is hatched by the app, in mm: a line this far from the next, this wide,
 * leaning as tscircuit's do (down to the right, seen from over the board). Where the lines are drawn too fine to be told apart, it is
 * as much of their colour as there is of them, evenly.
 */
const HATCH = { apart: 0.45, wide: 0.1 }
/** The most keep-outs on a side of a board that are hatched by the app (the rest as drawn). */
const MOST_KEEP_OUTS = 24

/**
 * The shades of grey of what is on a board, from the lightest, each with the grey it is
 * when the theme gives none (as src/index.css has it), and how light a grey is to be
 * drawn in it: at least this much, of 255, at its lightest. Mid is chips' packages;
 * light, what is lighter (connectors, pins, shields); dark, what is darker (resistors,
 * headers' plastic).
 */
const SHADES: readonly (readonly [
  shade: Extract<keyof PcbColours, `components-${string}`>,
  own: string,
  from: number,
])[] = [
  ["components-light", "#e7e7e7", 190],
  ["components-mid", "#9c9c9c", 136],
  ["components-dark", "#737373", 0],
]
/** How far apart, of 255, a colour's channels can be for it still to be a grey. */
const GREY = 24

/**
 * What is on a board that is drawn in one of the theme's shades (see SHADES): which, and
 * how much lighter or darker its own grey is than that shade's own, channel by channel,
 * for it to be as much lighter or darker than the theme's. Null for what is not a grey:
 * an LED, gold, a capacitor's tan, which stay as they are.
 */
export type Shaded = {
  shade: (typeof SHADES)[number][0]
  share: THREE.Color
}

/** Which of the theme's shades a colour of what is on a board is drawn in, if any. */
export function shadedOf(colour: THREE.Color): Shaded | null {
  const seen = colour.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
  const [r, g, b] = [seen.r, seen.g, seen.b].map((channel) => channel * 255)
  const light = Math.max(r, g, b)
  if (light - Math.min(r, g, b) > GREY) return null
  const [shade, own] = SHADES.find(([, , from]) => light >= from)!
  const base = new THREE.Color(own)
  return {
    shade,
    share: new THREE.Color(
      colour.r / base.r,
      colour.g / base.g,
      colour.b / base.b
    ),
  }
}

/** The colour something on a board is drawn in, in the theme's shade for it. */
export const inShade = (
  { shade, share }: Shaded,
  theme: PcbColours,
  colour: THREE.Color
) =>
  colour
    .set(theme[shade])
    .multiply(share)
    .setRGB(Math.min(1, colour.r), Math.min(1, colour.g), Math.min(1, colour.b))

const glsl = (colour: string) =>
  `vec3(${new THREE.Color(colour)
    .toArray()
    .map((value) => value.toFixed(4))
    .join(", ")})`

/**
 * The shader's way from tscircuit's colours to the app's. Where two colours meet the
 * picture blends them, so each of its colours is taken as the nearest blend of two of
 * tscircuit's, and drawn as the same blend of the app's: the edges stay as smooth.
 */
const RECOLOURING = `
  {
    const vec3 theirs[${COLOURS.length}] = vec3[](${COLOURS.map(([theirs]) => glsl(theirs)).join(", ")});
    vec3 seen = diffuseColor.rgb;
    vec3 drawn = seen;
    float nearest = 1e9;
    for (int i = 0; i < ${COLOURS.length}; i++) {
      for (int j = i + 1; j < ${COLOURS.length}; j++) {
        vec3 way = theirs[j] - theirs[i];
        float t = clamp(dot(seen - theirs[i], way) / dot(way, way), 0.0, 1.0);
        float off = distance(seen, theirs[i] + way * t);
        if (off < nearest) {
          nearest = off;
          drawn = mix(boardColours[i], boardColours[j], t);
        }
      }
    }
    // the app's hatching, across the lines in mm: how much of a line is here (before
    // anything is asked of where it is, for how fast that changes to be known)
    float across = (boardAt.x + boardAt.y) * 0.70710678;
    float pixel = fwidth(across);
    float fromLine = abs(fract(across / ${HATCH.apart.toFixed(3)} + 0.5) - 0.5) * ${HATCH.apart.toFixed(3)};
    float line = 1.0 - smoothstep(${(HATCH.wide / 2).toFixed(3)} - pixel, ${(HATCH.wide / 2).toFixed(3)} + pixel, fromLine);
    line = mix(line, ${(HATCH.wide / HATCH.apart).toFixed(4)}, smoothstep(${(HATCH.apart / 4).toFixed(3)}, ${(HATCH.apart / 2).toFixed(3)}, pixel));
    // within a keep-out, what tscircuit hatched, its lines and the mask between them (or
    // a blend of the two, as near as any two colours are), is hatched again: what else
    // is there (a pad, a hole) is left as it is
    vec3 hatchWay = theirs[${KEEP_OUT}] - theirs[${MASK}];
    float hatchAlong = clamp(dot(seen - theirs[${MASK}], hatchWay) / dot(hatchWay, hatchWay), 0.0, 1.0);
    bool hatched = distance(seen, theirs[${MASK}] + hatchWay * hatchAlong) <= nearest + 0.015;
    for (int k = 0; k < ${MOST_KEEP_OUTS}; k++) {
      if (!hatched || k >= keepOutCount) break;
      vec4 zone = keepOuts[k];
      vec2 from = boardAt - zone.xy;
      if (zone.w < 0.0 ? dot(from, from) <= zone.z * zone.z : abs(from.x) <= zone.z && abs(from.y) <= zone.w) {
        drawn = mix(boardColours[${MASK}], boardColours[${KEEP_OUT}], line);
        break;
      }
    }
    diffuseColor.rgb = drawn;
  }`

/**
 * The app's colours for one board, as its shaders have them: one for each of
 * tscircuit's (see COLOURS), and its edge's. Changed in place, the board is drawn in
 * the new ones the next time it is drawn.
 */
export type BoardPaint = {
  colours: { value: THREE.Color[] }
  edge: THREE.Color
  /**
   * Its keep-outs on each side, as the app hatches them (see `keepOutsOf`): in the
   * board's own mm, a circle as its middle, its radius, and -1; a rectangle as its
   * middle, and half its width and height. And how many there are.
   */
  keepOuts: Record<
    "top" | "bottom",
    { at: { value: THREE.Vector4[] }; count: { value: number } }
  >
}

/** The app's colours for a board, as the theme has them (see `BoardPaint`). */
export function boardPaint(theme: PcbColours): BoardPaint {
  const side = () => ({
    at: {
      value: Array.from({ length: MOST_KEEP_OUTS }, () => new THREE.Vector4()),
    },
    count: { value: 0 },
  })
  const paint: BoardPaint = {
    colours: { value: COLOURS.map(() => new THREE.Color()) },
    edge: new THREE.Color(),
    keepOuts: { top: side(), bottom: side() },
  }
  repaint(paint, theme)
  return paint
}

/** Have a board drawn in other colours of the theme's. */
export function repaint(paint: BoardPaint, theme: PcbColours) {
  COLOURS.forEach(([theirs, ours], index) =>
    paint.colours.value[index].set(ours ? theme[ours] : theirs)
  )
  paint.edge.set(theme[EDGE])
}

/**
 * Have a board's keep-outs hatched by the app, on each side they are on, as the board as
 * tscircuit has it says where they are: none, where there is nothing of it yet.
 */
export function keepOutsOf(paint: BoardPaint, board: Circuit | null) {
  for (const layer of ["top", "bottom"] as const) {
    const { at, count } = paint.keepOuts[layer]
    count.value = 0
    for (const element of board ?? []) {
      if (count.value >= MOST_KEEP_OUTS) break
      const { type, layers, shape, center, radius, width, height } =
        element as {
          type: unknown
          layers?: unknown
          shape?: unknown
          center?: { x: number; y: number }
          radius?: number
          width?: number
          height?: number
        }
      if (
        type !== "pcb_keepout" ||
        !Array.isArray(layers) ||
        !layers.includes(layer) ||
        !center
      )
        continue
      if (shape === "circle" && typeof radius === "number")
        at.value[count.value++].set(center.x, center.y, radius, -1)
      else if (
        shape === "rect" &&
        typeof width === "number" &&
        typeof height === "number"
      )
        at.value[count.value++].set(center.x, center.y, width / 2, height / 2)
    }
  }
}

/**
 * The colour of a board's bare copper, as the app paints it: what its vias are drawn in,
 * the same colour (changed in place, as `repaint` changes it).
 */
export const viaCopper = (paint: BoardPaint) => paint.colours.value[PADS]

/**
 * Have one of the board's own materials drawn in the app's colours (see `BOARD_ITSELF`):
 * its picture recoloured as it is drawn, or (its "edge") given the app's colour for it,
 * which is then its own. What else is done to it as it is drawn is done as well, after
 * this. Null for any other material, which is left as it is.
 */
export function inOurColours(
  material: THREE.Material,
  paint: BoardPaint
): "picture" | "edge" | null {
  if (
    !BOARD_ITSELF.test(material.name) ||
    !(material instanceof THREE.MeshStandardMaterial)
  )
    return null
  if (!material.map) {
    material.color.copy(paint.edge)
    return "edge"
  }
  // (the picture of the bottom is of it as seen from over the board, as the top's is)
  const keepOuts =
    paint.keepOuts[/^Bottom/.test(material.name) ? "bottom" : "top"]
  const before = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.boardColours = paint.colours
    shader.uniforms.keepOuts = keepOuts.at
    shader.uniforms.keepOutCount = keepOuts.count
    // where on the board each point of it is, in its own mm: tscircuit's 3D has the
    // board's X as its -X, and its Y as its Z
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec2 boardAt;\nvoid main() {")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nboardAt = vec2(-position.x, position.z);"
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform vec3 boardColours[${COLOURS.length}];
        uniform vec4 keepOuts[${MOST_KEEP_OUTS}];
        uniform int keepOutCount;
        varying vec2 boardAt;
        void main() {`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>${RECOLOURING}`
      )
    before(shader, renderer)
  }
  const key = material.customProgramCacheKey.bind(material)
  material.customProgramCacheKey = () => `board in our colours+${key()}`
  return "picture"
}
