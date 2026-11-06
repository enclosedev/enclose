// The clock example's circuit board, drawn as the app's PCB mode draws it, for the
// landing page's cards: public/board/<view>.svg. As blueprints.ts does for the arm's
// sheets, nothing is drawn here: each file is what the app's own `drawingOf` makes of
// the board, in the default theme's dark look, on PCB mode's ground.
//
// Run from apps/marketing:
//   npx tsx --tsconfig ../desktop/tsconfig.app.json scripts/boards.ts
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { DOMParser, XMLSerializer } from "../../desktop/node_modules/@xmldom/xmldom/lib/index.js"

// What the app has of the window's, to turn a drawing's layers over: xmldom's here,
// with the little of the DOM it lacks that drawing.ts asks of it.
Object.assign(globalThis, { DOMParser, XMLSerializer })
{
  type Node = { nodeType: number; childNodes: ArrayLike<Node>; hasAttribute(name: string): boolean }
  const element = Object.getPrototypeOf(
    new DOMParser().parseFromString("<a/>", "text/xml").documentElement
  ) as Record<string, unknown>
  Object.defineProperty(element, "children", {
    get(this: Node) {
      return Array.from(this.childNodes).filter((node) => node.nodeType === 1)
    },
  })
  element.append = function (this: { appendChild(node: unknown): void }, ...nodes: unknown[]) {
    for (const node of nodes) this.appendChild(node)
  }
  element.querySelector = function (this: Node, selector: string) {
    const name = /^\[([\w-]+)\]$/.exec(selector)?.[1]
    if (!name) throw new Error(`no querySelector here for ${selector}`)
    const look = (node: Node): Node | null => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType !== 1) continue
        if (child.hasAttribute(name)) return child
        const found = look(child)
        if (found) return found
      }
      return null
    }
    return look(this)
  }
}
const { drawingOf } = await import("../../desktop/src/components/pcb/drawing")
const { convertCircuitJsonToPcbSvg } = await import("../../desktop/node_modules/circuit-to-svg/dist/index.js")
// from "../../desktop/src/components/pcb/drawing"
import type { Circuit } from "../../desktop/src/components/pcb/boards"
import type { PcbColours } from "../../desktop/shared/theme-format"

const here = path.dirname(fileURLToPath(import.meta.url))
const BOARD = path.resolve(here, "../../../examples/clock/pcb/build/main.circuit.json")
const THEME = path.resolve(here, "../../../themes/default.json")
const OUT = path.resolve(here, "../public/board")

/** What the window is drawn in, behind the board: the app's dark view. */
const GROUND = "#151515"

/** The dark look's colours for a board, as src/index.css has them, under the theme's. */
const DARK: PcbColours = {
  "board-mask": "#005413",
  "board-traces": "#006116",
  "board-pour": "#006116",
  "board-pads": "#e1cf4d",
  "board-print": "#ffffff",
  "components-light": "#e7e7e7",
  "components-mid": "#9c9c9c",
  "components-dark": "#737373",
  "technical-top": "#c83434",
  "technical-inner1": "#7fc87f",
  "technical-inner2": "#ce7d2c",
  "technical-bottom": "#4d7fc4",
  "technical-top-behind": "#c8343433",
  "technical-inner1-behind": "#7fc87f33",
  "technical-inner2-behind": "#ce7d2c33",
  "technical-bottom-behind": "#4d7fc433",
  "technical-print": "#ffffff",
  "technical-edge": "#d0d2cd",
  "schematic-lines": "#e8eeea",
  "schematic-fill": "#1e2620",
  "schematic-wires": "#56d676",
  "schematic-names": "#76cec2",
  "schematic-values": "#d6e2d9",
}

const circuit = JSON.parse(await readFile(BOARD, "utf8")) as Circuit
const theme = JSON.parse(await readFile(THEME, "utf8")) as { dark: Record<string, unknown> }
const colours = Object.fromEntries(
  Object.entries(DARK).map(([id, own]) => {
    const theirs = theme.dark[id]
    return [id, typeof theirs === "string" ? theirs : own]
  })
) as PcbColours

await mkdir(OUT, { recursive: true })
const files = {
  "top.svg": drawingOf(circuit, "pcb", colours, true, GROUND, "top"),
  "bottom.svg": drawingOf(circuit, "pcb", colours, true, GROUND, "bottom"),
  "schematic.svg": drawingOf(circuit, "schematic", colours, true, GROUND),
  // the board as it is before it is routed: its parts placed, and what is to be joined
  // drawn straight across (which the app draws for a board with no traces yet)
  "placed.svg": drawingOf(
    circuit.filter((element) => !["pcb_trace", "pcb_via"].includes(element.type as string)),
    "pcb",
    colours,
    true,
    GROUND,
    "top"
  ),
  // And the board as it comes from the maker, in the colours the app's 3D draws it in:
  // its mask, the mask over copper, bare copper and its lettering. (The card leans it
  // back, to be seen as the 3D view sees it.)
  // (without the box tscircuit draws round the board, which is no part of it)
  "made.svg": convertCircuitJsonToPcbSvg(circuit as never, {
    width: 1600,
    height: 1600,
    backgroundColor: "transparent",
    showSolderMask: true,
    colorOverrides: {
      copper: { top: colours["board-pads"], bottom: colours["board-pads"] },
      soldermask: { top: colours["board-mask"], bottom: colours["board-mask"] },
      soldermaskWithCopperUnderneath: { top: colours["board-traces"], bottom: colours["board-traces"] },
      soldermaskOverCopper: { top: colours["board-traces"], bottom: colours["board-traces"] },
      substrate: colours["board-mask"],
      silkscreen: { top: colours["board-print"], bottom: colours["board-print"] },
      boardOutline: colours["board-traces"],
      drill: "#0b0b0b",
    },
  }).replace(/<rect class="pcb-boundary"[^>]*\/>/, ""),
}
for (const [name, svg] of Object.entries(files)) {
  await writeFile(path.join(OUT, name), svg)
  console.log(name, `${Math.round(svg.length / 1024)} kB`)
}
