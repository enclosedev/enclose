// The clock example's circuit board, drawn as the app's PCB mode draws it, for the
// landing page's cards: public/board/<view>.svg. As blueprints.ts does for the arm's
// sheets, nothing is drawn here: each file is what the app's own `drawingOf` makes of
// the board, in the default theme's dark look, on PCB mode's ground.
//
// Run from apps/marketing:
//   npx tsx --tsconfig ../desktop/tsconfig.app.json scripts/boards.ts
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
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

// And a board of four layers, of a project of the user's (MEEDEE, a little instrument),
// for the technical view's card: its top as that view draws it (its other layers under
// it, faint), and what U3's first pad is joined to, X-rayed as the app does it
// (board-menu.tsx's XRay): its traces, pads and vias in the colours of their layers, in
// the drawing's own px, to lie over it. Where that project is not on this machine
// (MEEDEE_CIRCUIT, its main.circuit.json), what was made of it is left as it is.
const MEEDEE = process.env.MEEDEE_CIRCUIT
if (MEEDEE) {
  const four = JSON.parse(await readFile(MEEDEE, "utf8")) as Circuit
  const out = path.join(OUT, "meedee")
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  /** (to a tenth of a px: a fifth of a tenth of a millimetre) */
  const tenths = (svg: string) => svg.replace(/-?\d+\.\d{2,}/g, (n) => String(Math.round(Number(n) * 10) / 10))
  const top = tenths(drawingOf(four, "pcb", colours, true, GROUND, "top"))
  await writeFile(path.join(out, "top.svg"), top)
  console.log("meedee/top.svg", `${Math.round(top.length / 1024)} kB`)

  const { inspected, cornersOf } = await import("../../desktop/src/components/pcb/inspect")
  const { xRayOf, connectionSaid } = await import("../../desktop/src/components/pcb/xray")
  const { copperColourOf } = await import("../../desktop/shared/theme-format")
  const board = inspected(four)
  const pad = board.pads.find((one) => one.names.includes("U3.VOUT1"))!
  const rayed = xRayOf(board, pad.joined!)

  // The drawing's px for the board's mm: from two of U3's pads, as each is drawn in it.
  const drawnAt = (name: string) => {
    const found = new RegExp(`<rect[^>]*x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"[^>]*data-pad-name="${name}"`).exec(top)!
    const [x, y, w, h] = found.slice(1).map(Number)
    return { x: x + w / 2, y: y + h / 2 }
  }
  const padOf = (name: string) => board.pads.find((one) => one.names.includes(name))!
  const [a, b] = ["U3.VOUT1", "U3.VBAT"].map((name) => ({ mm: padOf(name), px: drawnAt(name) }))
  const perMm = (b.px.x - a.px.x) / (b.mm.x - a.mm.x)
  const px = (spot: { x: number; y: number }) => [
    Math.round((a.px.x + (spot.x - a.mm.x) * perMm) * 10) / 10,
    Math.round((a.px.y - (spot.y - a.mm.y) * perMm) * 10) / 10,
  ]
  const width = Number(/width="([\d.]+)"/.exec(top)![1])
  const height = Number(/height="([\d.]+)"/.exec(top)![1])
  const colourOf = (on: string | null) => copperColourOf(colours, (on ?? "top") as never)
  const lines = rayed.traces
    .flatMap((trace) => trace.points.slice(1).map((to, index) => ({ from: trace.points[index], to })))
    .sort((one, other) => Number(one.from.side === "top") - Number(other.from.side === "top"))
    .map(({ from, to }) => {
      const [x1, y1] = px(from)
      const [x2, y2] = px(to)
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colourOf(from.side)}" stroke-width="${Math.max(from.width * perMm, 2).toFixed(1)}" stroke-linecap="round"/>`
    })
  const pads = rayed.pads.map((one) => {
    const fill = colourOf(one.sides.includes("top") ? "top" : one.sides[0])
    if (one.round) {
      const [cx, cy] = px(one)
      return `<circle cx="${cx}" cy="${cy}" r="${((one.w / 2) * perMm).toFixed(1)}" fill="${fill}"/>`
    }
    return `<polygon points="${cornersOf(one).map((corner) => px(corner).join(",")).join(" ")}" fill="${fill}"/>`
  })
  const vias = rayed.vias.map((via) => {
    const [cx, cy] = px(via)
    const r = Math.max((via.w / 2) * perMm, 3)
    return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${colours["technical-print"]}"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.45).toFixed(1)}" fill="${GROUND}"/>`
  })
  const xray = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${[...lines, ...pads, ...vias].join("")}</svg>`
  await writeFile(path.join(out, "xray.svg"), xray)
  // and where the pad is, in the drawing's px, and what the app says of it
  const at = drawnAt("U3.VOUT1")
  await writeFile(
    path.join(out, "xray.json"),
    JSON.stringify(
      {
        pad: { x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10, w: Math.round(pad.w * perMm * 10) / 10, h: Math.round(pad.h * perMm * 10) / 10 },
        names: pad.names,
        net: connectionSaid(board, pad.joined!, null),
        size: { width, height },
      },
      null,
      2
    ) + "\n"
  )
  console.log("meedee/xray.svg", rayed.traces.length, "traces", `${Math.round(xray.length / 1024)} kB`)
}
