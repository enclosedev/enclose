// The sheets of the app's Blueprint view, drawn of the robot-arm example and saved as
// SVGs for the landing page to load: public/blueprint/<sheet>.svg, and sheets.json to
// say what there is.
//
// Nothing is drawn here. The model is loaded by the desktop app's own loader, its lines
// are found by the app's own hidden-line drawing, and each file is what the app's own
// `svgOf` writes, with dimensions on, in millimetres, the model put together and every
// part on show. What this adds is what stands in for the window: files read from disk in
// place of fetched ones, and the two pieces of blueprint.tsx that are not exported from
// it (`laidOut`, and the call that makes a file of a sheet), mirrored below.
//
// Run from apps/marketing:
//   npx tsx --tsconfig ../desktop/tsconfig.app.json scripts/blueprints.ts
// (the desktop sources import one another through that tsconfig's `@/…` and `@shared/…`)
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  dimensionsOf,
  type Room,
} from "../../desktop/src/components/blueprint/dimensions"
import {
  drawnNow,
  type Body,
  type Stroke,
} from "../../desktop/src/components/blueprint/lines"
import {
  reduction,
  scaleSaid,
  SHEET,
  SIDES,
  svgOf,
  type Placing,
} from "../../desktop/src/components/blueprint/sheet"
import {
  loadModel,
  type LoadedModel,
  type LoadedPart,
} from "../../desktop/src/components/viewport/load"
import { readModel } from "../../desktop/src/lib/model"

const here = path.dirname(fileURLToPath(import.meta.url))
const MODEL = path.resolve(here, "../../../examples/arm/build")
const MANIFEST = "enclose.model.json"
const OUT = path.resolve(here, "../public/blueprint")

/** What the app's preferences start at, and what the sheets here are in. */
const UNITS = "mm"
/** How far the parts are pulled apart: nothing, the model put together. */
const APART = 0
/**
 * How many decimals of a millimetre of sheet a file here keeps. The app writes three (a
 * micron); two is a hundredth of a millimetre, a fortieth of the width of a line.
 */
const DECIMALS = 2

// The app's loader fetches a model's files. Here they are on disk: a fetch of a file:
// URL reads the file.
const fetched = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url
  )
  if (url.protocol !== "file:") return fetched(input, init)
  try {
    return new Response(await readFile(fileURLToPath(url)))
  } catch {
    return new Response(null, { status: 404 })
  }
}
// And three.js's loader says how far a file has come with an event that only a browser
// has. Nobody is listening for it here.
const browser = globalThis as { ProgressEvent?: unknown }
browser.ProgressEvent ??= class ProgressEvent extends Event {}

/** A point of a part's own frame, where a place (three.js's 16 numbers) puts it. */
function placed(
  [x, y, z]: number[],
  e: ArrayLike<number>
): [number, number, number] {
  return [
    e[0] * x + e[4] * y + e[8] * z + e[12],
    e[1] * x + e[5] * y + e[9] * z + e[13],
    e[2] * x + e[6] * y + e[10] * z + e[14],
  ]
}

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * The parts as the drawing takes them, and the room they take up seen from each side:
 * `laidOut` of blueprint.tsx, which is not exported from it, with its boxes worked in
 * plain numbers.
 */
function laidOut(parts: LoadedPart[], apart: number) {
  const places = parts.map((part) => {
    const place = part.home.clone()
    place.elements[12] += part.away.x * apart
    place.elements[13] += part.away.y * apart
    place.elements[14] += part.away.z * apart
    return place.elements
  })
  const bodies = parts.map((part, index): Body => ({
    // (what is made of something clear hides nothing: it is drawn, and seen through)
    skins: part.part.clear
      ? []
      : part.skins.map(({ geometry }) => ({
          position: geometry.attributes.position.array,
          index: geometry.index!.array,
        })),
    edges: part.edges,
    contours: part.contours,
    place: places[index],
  }))
  const corners = parts.flatMap(({ box }, index) =>
    box.isEmpty()
      ? []
      : Array.from({ length: 8 }, (_, i) =>
          placed(
            [
              i & 1 ? box.max.x : box.min.x,
              i & 2 ? box.max.y : box.min.y,
              i & 4 ? box.max.z : box.min.z,
            ],
            places[index]
          )
        )
  )
  const room: Room =
    corners.length === 0
      ? { min: [0, 0, 0], max: [0, 0, 0] }
      : {
          min: [0, 1, 2].map((axis) =>
            Math.min(...corners.map((corner) => corner[axis]))
          ) as Room["min"],
          max: [0, 1, 2].map((axis) =>
            Math.max(...corners.map((corner) => corner[axis]))
          ) as Room["max"],
        }
  const rooms = SIDES.map(({ looking }) => {
    const room = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
    for (const corner of corners) {
      room.x0 = Math.min(room.x0, dot(corner, looking.right))
      room.x1 = Math.max(room.x1, dot(corner, looking.right))
      room.y0 = Math.min(room.y0, dot(corner, looking.up))
      room.y1 = Math.max(room.y1, dot(corner, looking.up))
    }
    return corners.length > 0 ? room : { x0: 0, x1: 0, y0: 0, y1: 0 }
  })
  // the sides to one scale, and the corners to one
  const scales = [true, false].map((flat) =>
    reduction(
      rooms
        .filter((_, index) => SIDES[index].flat === flat)
        .map((room) => ({
          width: room.x1 - room.x0,
          height: room.y1 - room.y0,
        }))
    )
  )
  const placings = rooms.map((room, index): Placing => ({
    middle: [(room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2],
    by: scales[SIDES[index].flat ? 0 : 1],
  }))
  return { bodies, placings, room }
}

/** A name a file can have, from whatever something is called: blueprint.tsx's. */
const fileName = (called: string) =>
  called
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "model"

/** A sheet as the file the app saves it as: `fileOf` of blueprint.tsx. */
function fileOf(
  loaded: LoadedModel,
  parts: LoadedPart[],
  index: number,
  strokes: Stroke[][],
  placing: Placing,
  room: Room,
  name: string
): string {
  const side = SIDES[index]
  const measures = dimensionsOf(room, side.looking, side.flat, placing, UNITS)
  const lines = new Map(
    parts.map((part, place) => [part.part.id, strokes[place]])
  )
  return svgOf({
    title: `${name}, ${side.name.toLowerCase()} view (${scaleSaid(placing.by)}, ${UNITS})`,
    placing,
    dimensions: measures,
    groups: loaded.model.groups.map((group) => ({
      id: group.id,
      label: group.label,
      parts: loaded.model.parts.flatMap((part) => {
        const drawn = part.group === group.id && lines.get(part.id)
        return drawn ? [{ id: part.id, label: part.label, strokes: drawn }] : []
      }),
    })),
  })
}

/**
 * The same file, smaller, and the same drawing: no line breaks between its tags, and
 * its places on the sheet to DECIMALS decimals. Only the numbers that are places are
 * touched: those of a path, and of where a figure stands and how it is turned. What a
 * figure says, and how wide a line is, are left as they are.
 */
function trimmed(svg: string): string {
  const round = (text: string) =>
    text.replace(/-?\d+\.\d+/g, (n) =>
      String(Number(Number(n).toFixed(DECIMALS)))
    )
  // A path is its lines one after another, each an M and the Ls after it. Two places
  // along a line that are the one place, once rounded, are written once: but a line is
  // left its two ends, or the dot it is drawn as would go.
  const path = (d: string) =>
    d.replace(/M[^M]*/g, (line) => {
      const closed = line.endsWith("Z")
      const places = line
        .slice(1, closed ? -1 : undefined)
        .split("L")
        .map(round)
      const kept = places.filter(
        (place, index) => index === 0 || place !== places[index - 1]
      )
      if (kept.length === 1 && places.length > 1) kept.push(places[0])
      return `M${kept.join("L")}${closed ? "Z" : ""}`
    })
  return svg
    .replace(/ d="([^"]*)"/g, (_, d: string) => ` d="${path(d)}"`)
    .replace(
      /<text x="([^"]*)" y="([^"]*)"( transform="rotate\(([^)]*)\)")?/g,
      (_, x: string, y: string, turned: string | undefined, turn: string) =>
        `<text x="${round(x)}" y="${round(y)}"` +
        (turned ? ` transform="rotate(${round(turn)})"` : "")
    )
    .replace(/>\n</g, "><")
    .trimEnd()
}

const seconds = (since: number) =>
  `${((performance.now() - since) / 1000).toFixed(1)}s`

async function main() {
  const begun = performance.now()
  const model = readModel(
    JSON.parse(await readFile(path.join(MODEL, MANIFEST), "utf8"))
  )
  const loaded = await loadModel(
    model,
    pathToFileURL(MODEL + path.sep).href,
    0,
    () => {}
  )
  // all of the model is on show: nothing picked out, nothing put out of sight
  const parts = loaded.parts
  const name = model.title ?? "model"
  const triangles = parts.reduce(
    (sum, part) =>
      sum +
      part.skins.reduce((n, skin) => n + skin.geometry.index!.count / 3, 0),
    0
  )
  const edges = parts.reduce((sum, part) => sum + part.edges.length / 6, 0)
  console.log(
    `loaded ${parts.length} parts (${triangles} triangles, ${edges} edge segments) in ${seconds(begun)}`
  )

  const { bodies, placings, room } = laidOut(parts, APART)
  console.log(
    `room ${room.min.map((n) => n.toFixed(1))} to ${room.max.map((n) => n.toFixed(1))} mm`
  )

  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  const sheets: { name: string; file: string; scale: string; bytes: number }[] =
    []
  for (const [index, side] of SIDES.entries()) {
    const since = performance.now()
    const strokes = drawnNow(bodies, side.looking)
    const svg = fileOf(
      loaded,
      parts,
      index,
      strokes,
      placings[index],
      room,
      name
    )
    const small = trimmed(svg)
    const file = `${fileName(side.name)}.svg`
    await writeFile(path.join(OUT, file), small)
    const bytes = Buffer.byteLength(small)
    sheets.push({
      name: side.name,
      file,
      scale: scaleSaid(placings[index].by),
      bytes,
    })
    console.log(
      `${side.name.padEnd(13)} ${scaleSaid(placings[index].by)}  ` +
        `${strokes.reduce((n, of) => n + of.length, 0)} strokes  ` +
        `${Buffer.byteLength(svg)} -> ${bytes} bytes  ${seconds(since)}`
    )
  }
  await writeFile(
    path.join(OUT, "sheets.json"),
    JSON.stringify(sheets, null, 2) + "\n"
  )
  console.log(
    `${sheets.length} sheets of ${SHEET.width}x${SHEET.height} mm in ${seconds(begun)}`
  )
}

await main()
