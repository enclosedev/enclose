// A circuit board drawn as tscircuit draws one (circuit-to-svg): as it is made, its
// copper, pads and print on the board; or as its schematic. Each is drawn on the ground
// PCB mode has, in the dark or the light, in the theme's colours for it. This is loaded
// only when a board is first drawn: it is a good deal of the app.
import {
  convertCircuitJsonToPcbSvg,
  convertCircuitJsonToSchematicSvg,
  type PcbSvgOptions,
} from "circuit-to-svg"
import type { AnyCircuitElement } from "circuit-json"

import type { copperLayerOf } from "@shared/board-format"
import type { PcbColours } from "@shared/theme-format"
import type { Circuit } from "./boards"
import { DRAWN } from "./ground"
import { PLACE_MARK } from "./place"

/**
 * The schematic's colours. tscircuit draws one as KiCad does, for paper, its parts and
 * pins in red: here they are drawn in one ink, white on the dark ground and near black
 * on the light, with the wires green and the names in a second colour, as they were.
 * Those are the theme's (shared/theme-format.ts); the rest are the app's, in the dark,
 * and KiCad's in the light.
 */
function schematicOf(colours: PcbColours, dark: boolean) {
  const ink = colours["schematic-lines"]
  const values = colours["schematic-values"]
  return {
    component_outline: ink,
    pin: ink,
    pin_number: ink,
    label_global: ink,
    no_connect: ink,
    component_body: colours["schematic-fill"],
    wire: colours["schematic-wires"],
    junction: colours["schematic-wires"],
    pin_name: colours["schematic-names"],
    reference: colours["schematic-names"],
    value: values,
    label_local: values,
    aux_items: values,
    ...(dark && {
      label_hier: "rgb(222, 190, 110)",
      net_name: "rgb(150, 162, 153)",
      label_background: "rgba(10, 14, 11, 0.6)",
      table: "rgb(150, 162, 153)",
      note: "rgb(140, 170, 255)",
      fields: "rgb(206, 140, 220)",
    }),
  }
}
/**
 * And the colours tscircuit writes into some of it for itself, whatever it is told: a
 * chip's name, which is in the names' colour here; the reds of the numbers of some
 * pins, and of some of its symbols (a crystal's, say); and the black of the sections
 * of a sheet, their titles and the dashed lines between them, unseen on the dark
 * ground. Those are all the parts' ink.
 */
const CHIP_NAME = "#006464"
const SECTIONS = ['fill="#000000"', 'stroke="#000000"']
const REDS = [
  "rgb(169, 0, 0)",
  "rgba(132, 0, 0)",
  "rgb(132, 0, 0)",
  "#880000",
  "#8D2323",
]

/**
 * The holes through the board that are no part of a pad, its mounting holes, drawn with
 * an edge, as its own edge is: a hole is the ground showing through, and with nothing
 * drawn round it, on the ground, it would not be seen at all. (A pad's hole has the
 * pad's copper round it.) The line is as thin at any zoom.
 */
export const holesEdged = (markup: string, colours: PcbColours) =>
  markup.replaceAll(
    'data-type="pcb_hole"',
    `stroke="${colours["technical-edge"]}" stroke-width="1" vector-effect="non-scaling-stroke" data-type="pcb_hole"`
  )

/**
 * How the board is drawn as it is made: as KiCad draws one, on the ground it is seen on,
 * in the theme's colours for it (shared/theme-format.ts). Its copper is KiCad's colours
 * for each side, and its edge KiCad's grey, which on the light ground is too pale: there
 * it is near black, as what is printed on it is. That is white, as it is printed, and
 * not KiCad's colour for each side.
 */
function pcbLook(
  elements: AnyCircuitElement[],
  colours: PcbColours,
  ground: string
): PcbSvgOptions {
  return {
    ...DRAWN,
    backgroundColor: ground,
    matchBoardAspectRatio: true,
    // drawn as KiCad draws a board: its copper in the colours of its layers, and not
    // under the green of its mask, as it is made (which the 3D shows)
    showSolderMask: false,
    // a board with nothing routed yet has what is to be joined drawn straight across
    // (drawn over a routed one, the lines would be there whether routed or not)
    shouldDrawRatsNest: !elements.some(
      (element) => element.type === "pcb_trace"
    ),
    colorOverrides: {
      // a hole is a hole: the ground shows through it
      drill: ground,
      copper: {
        top: colours["technical-top"],
        bottom: colours["technical-bottom"],
      },
      boardOutline: colours["technical-edge"],
      silkscreen: {
        top: colours["technical-print"],
        bottom: colours["technical-print"],
      },
    },
  }
}

/** A board's layer of copper, as tscircuit calls it: its top, its bottom, or one inside. */
export type CopperLayer = ReturnType<typeof copperLayerOf>

/** How much of the layers of the board not looked at is seen, through the one that is. */
const AWAY = 0.12
/**
 * How much of its side's copper colour a pour of copper is drawn in: tscircuit draws
 * one in half of it, which over a whole side is near as strong as the traces in it.
 */
const POUR = 0.25

/** A drawing of a board with its pours of copper drawn lighter (see POUR). */
export const poursLightened = (markup: string) =>
  markup.replace(
    /(<svg[^>]*>)/,
    `$1<style>[data-type="pcb_copper_pour"] { fill-opacity: ${POUR}; }</style>`
  )

/**
 * A drawing of a board with every layer of copper but the one looked at drawn faint:
 * the other side's copper, pads and print, and the layers inside it, which over the
 * one looked at would be read as part of it. (A board with a pour has its layers told
 * apart by it; one without has only their colours.) What goes through the board, its
 * holes and vias, stays as it is.
 */
export function awayFaded(markup: string, layer: CopperLayer): string {
  const away = [
    ...(["top", "bottom"] as const)
      .filter((side) => side !== layer)
      .map((side) => `[data-pcb-layer="${side}"]`),
    `[data-pcb-layer^="inner"]:not([data-pcb-layer="${layer}"])`,
  ]
  return markup.replace(
    /(<svg[^>]*>)/,
    `$1<style>${away.join(", ")} { opacity: ${AWAY}; }</style>`
  )
}

/**
 * How far up each layer of a board is drawn, as circuit-to-svg puts them, the lowest
 * first: but with its two sides the other way round, its bottom over its top, for the
 * board seen from under it.
 */
export function fromUnder(layer: string | null): number {
  if (layer === null) return 500
  if (layer === "global") return -100
  if (layer === "board") return 2
  if (layer === "soldermask-top" || layer === "soldermask-bottom") return 3
  if (layer === "top") return 4
  if (layer.startsWith("inner"))
    return 5 + (Number(/\d+/.exec(layer)?.[0]) || 0)
  if (layer === "bottom") return 17
  if (layer === "through") return 18
  if (layer === "drill") return 30
  if (layer === "overlay") return 40
  return 10
}

/**
 * A drawing of the whole of a board, its top over its bottom, made into one of its
 * bottom over its top (see `fromUnder`).
 */
const bottomUp = (markup: string) => reordered(markup, fromUnder)

/**
 * A drawing of a board seen from over it, with one of the layers inside it over its top:
 * that layer's copper is looked at, through the top's, faded (see `awayFaded`).
 */
const innerUp = (markup: string, layer: string) =>
  reordered(markup, (one) =>
    one === layer ? fromUnder("bottom") + 0.5 : fromOver(one)
  )

/**
 * How far up each layer of a board is drawn, seen from over it, as circuit-to-svg puts
 * them: `fromUnder` the other way round, its top over its bottom, and the first of the
 * layers inside it over the second.
 */
function fromOver(layer: string | null): number {
  if (layer === "top") return fromUnder("bottom")
  if (layer === "bottom") return fromUnder("top")
  if (layer?.startsWith("inner"))
    return fromUnder("bottom") - (Number(/\d+/.exec(layer)?.[0]) || 0)
  return fromUnder(layer)
}

/**
 * A drawing of a board, everything in it put in order again by how far up its layer is
 * (`up`), keeping the order of what is on one layer. A group of things is on the
 * layer of what is in it. What draws nothing (its styles, and what is used by name)
 * stays first.
 */
function reordered(
  markup: string,
  up: (layer: string | null) => number
): string {
  const svg = new DOMParser().parseFromString(
    markup,
    "image/svg+xml"
  ).documentElement
  const layerOf = (element: Element) =>
    element.getAttribute("data-pcb-layer") ??
    element.querySelector("[data-pcb-layer]")?.getAttribute("data-pcb-layer") ??
    null
  const ordered = [...svg.children]
    .map((element, index) => ({
      element,
      index,
      up: ["style", "defs"].includes(element.localName)
        ? -1000
        : up(layerOf(element)),
    }))
    .sort((a, b) => a.up - b.up || a.index - b.index)
  for (const { element } of ordered) svg.append(element)
  return new XMLSerializer().serializeToString(svg)
}

/**
 * A drawing of the bottom of a board turned over, as the board is when it is turned
 * over to be looked at from under: left is right, and its print reads as it should.
 */
export function turnedOver(markup: string): string {
  const width =
    Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(markup)?.[1]) || DRAWN.width
  return markup
    .replace(
      /(<svg[^>]*>)/,
      `$1<g transform="translate(${width} 0) scale(-1 1)">`
    )
    .replace(/<\/svg>\s*$/, "</g></svg>")
}

/**
 * A line nobody sees, from the middle of the board a millimetre along each way: where it
 * comes out in the drawing says how the board's millimetres lie in the drawing's own
 * units (see `placeOf`), for what is drawn over the board to lie where it should.
 */
function placeMark(elements: AnyCircuitElement[]): AnyCircuitElement[] {
  const board = elements.find((one) => one.type === "pcb_board")
  const [x, y] =
    board && "center" in board ? [board.center.x, board.center.y] : [0, 0]
  return [
    {
      type: "pcb_note_line",
      // (with where it begins, on the board, in what it is known by)
      pcb_note_line_id: `${PLACE_MARK}:${x}:${y}`,
      x1: x,
      y1: y,
      x2: x + 1,
      y2: y + 1,
      stroke_width: 0,
      color: "transparent",
    } as unknown as AnyCircuitElement,
  ]
}

/** A board drawn the one way or the other, on the ground it is seen on. */
export function drawingOf(
  circuit: Circuit,
  as: "pcb" | "schematic",
  /** the theme's colours for it, and whether its look is the dark */
  colours: PcbColours,
  dark: boolean,
  /** the colour it is drawn on */
  ground: string,
  /** which of its layers of copper is drawn, where it is drawn as it is made */
  layer: CopperLayer = "top"
): string {
  const elements = circuit as unknown as AnyCircuitElement[]
  if (as === "pcb" && layer === "bottom")
    return turnedOver(
      awayFaded(
        holesEdged(
          bottomUp(
            poursLightened(
              convertCircuitJsonToPcbSvg(
                [...elements, ...placeMark(elements)],
                pcbLook(elements, colours, ground)
              )
            )
          ),
          colours
        ),
        layer
      )
    )
  if (as === "pcb") {
    const drawn = holesEdged(
      poursLightened(
        convertCircuitJsonToPcbSvg(
          [...elements, ...placeMark(elements)],
          pcbLook(elements, colours, ground)
        )
      ),
      colours
    )
    return awayFaded(layer === "top" ? drawn : innerUp(drawn, layer), layer)
  }
  const drawn = convertCircuitJsonToSchematicSvg(elements, {
    ...DRAWN,
    colorOverrides: {
      schematic: { background: ground, ...schematicOf(colours, dark) },
    },
  })
  const ink = colours["schematic-lines"]
  const inked = SECTIONS.reduce(
    (svg, black) => svg.replaceAll(black, black.replace("#000000", ink)),
    REDS.reduce((svg, red) => svg.replaceAll(red, ink), drawn)
  )
  return inked.replaceAll(CHIP_NAME, colours["schematic-names"])
}
