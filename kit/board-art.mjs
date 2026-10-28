// A picture made into artwork for a circuit board's print, for Enclose
// (https://enclose.dev): a logo, a drawing, a pattern, from an SVG, a PNG or a JPEG.
// Run it from the top of the project:
//
//     node /path/to/kit/board-art.mjs pcb/art/logo.svg --width 20
//
// It writes pcb/art/logo.ts beside the picture, which the board imports and prints with
// tscircuit's <silkscreengraphic>:
//
//     import logo from "./art/logo"
//     <silkscreengraphic {...logo} pcbX={10} pcbY={-5} />
//
// tscircuit takes an SVG's <path>s and nothing else of it (no shapes, strokes, text or
// transforms), cuts its curves into few straight lines, and cannot read a file the board
// imports. So the picture is drawn here first, as it looks, at 20 dots to the millimetre,
// and traced: what is printed is its outline, in straight lines too short to be seen,
// in a picture the board carries in itself.
//
//   --width <mm> or --height <mm>   its size on the board (one of them; the other keeps
//                                   the picture's proportions)
//   --light                         print what is light in the picture, not what is dark
//                                   (a logo drawn white, for a dark ground)
//   --bottom                        for the underside: mirrored, to read from there
//
// It says where the picture is too fine to print: lines thinner, or gaps narrower, than
// a board house prints (0.15 mm). It needs the tscircuit the boards are built with
// (board.mjs), which it fetches the first time, as a build does.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"

/** Dots to the millimetre it is drawn at, and the most dots along a side. */
const DOTS = 20
const MOST_DOTS = 4000
/** How far the outline may stray from the picture's, mm: well under what is printed. */
const STRAY = 0.02
/** The thinnest line, and the narrowest gap, a board house prints, mm. */
const FINEST = 0.15
/** A bit of a picture smaller than this is left out, mm². */
const SPECK = 0.005

// ---------------------------------------------------------------------------------------
// The picture, drawn.

/** Its size in its own units, and the SVG to draw it from. */
function readPicture(file) {
  const data = fs.readFileSync(file)
  const ending = path.extname(file).toLowerCase()
  if (ending === ".svg") {
    const svg = data.toString("utf8")
    return { svg, ...svgSize(svg) }
  }
  const size = ending === ".png" ? pngSize(data) : [".jpg", ".jpeg"].includes(ending) ? jpegSize(data) : null
  if (!size) throw new Error(`${file} is not an SVG, a PNG or a JPEG that can be read.`)
  const type = ending === ".png" ? "image/png" : "image/jpeg"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><image width="${size.width}" height="${size.height}" xlink:href="data:${type};base64,${data.toString("base64")}"/></svg>`
  return { svg, ...size }
}

function svgSize(svg) {
  const box = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number)
  if (box?.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0)
    return { width: box[2], height: box[3] }
  const length = (name) => Number.parseFloat(new RegExp(`<svg\\b[^>]*\\b${name}\\s*=\\s*["']([\\d.]+)`, "i").exec(svg)?.[1] ?? "")
  const width = length("width")
  const height = length("height")
  if (width > 0 && height > 0) return { width, height }
  throw new Error("The SVG says neither its viewBox nor its width and height: give it a viewBox.")
}

function pngSize(data) {
  if (data.length < 24 || data.toString("ascii", 12, 16) !== "IHDR") return null
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

function jpegSize(data) {
  let at = 2
  while (at + 9 < data.length) {
    if (data[at] !== 0xff) return null
    const marker = data[at + 1]
    const length = data.readUInt16BE(at + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { width: data.readUInt16BE(at + 7), height: data.readUInt16BE(at + 5) }
    at += 2 + length
  }
  return null
}

/**
 * The tscircuit that boards are built with, as a way to require its packages: the
 * version board.mjs keeps, fetched by npx where it has not been.
 */
function tscircuitPackages() {
  const build = fs.readFileSync(path.join(import.meta.dirname, "board.mjs"), "utf8")
  const version = /const TSCIRCUIT = "([^"]+)"/.exec(build)?.[1]
  if (!version) throw new Error("board.mjs does not say which tscircuit it builds with.")
  const find = `const p = require("path"), f = require("fs")
for (const bin of (process.env.PATH ?? "").split(p.delimiter)) {
  const at = p.join(bin, "..", "tscircuit", "package.json")
  if (f.existsSync(at)) { process.stdout.write(at); break }
}`
  const found = execFileSync("npx", ["--yes", "-p", version, "node", "-e", find], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, npm_config_allow_git: "all" },
    shell: process.platform === "win32",
  }).trim()
  if (!found) throw new Error(`${version} could not be found, or fetched.`)
  return createRequire(found)
}

/**
 * How much ink is at each dot, 0 to 1, drawn `dots` to the millimetre: where the picture
 * is dark, or light (`light`). A row of blank dots all round, so that every outline closes.
 */
function inkOf(picture, across, dots, light) {
  const { Resvg } = tscircuitPackages()("@resvg/resvg-js")
  const drawn = new Resvg(picture.svg, { fitTo: { mode: "width", value: Math.round(across * dots) } }).render()
  const { width, height } = drawn
  const pixels = drawn.pixels
  const W = width + 2
  const H = height + 2
  const ink = new Float32Array(W * H)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = pixels[i + 3] / 255
      const lum = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255
      // dark ink is what is dark on white; light ink what is light on black
      ink[(y + 1) * W + x + 1] = light ? lum * a : 1 - (lum * a + (1 - a))
    }
  return { ink, W, H, width, height }
}

// ---------------------------------------------------------------------------------------
// Traced.

/**
 * The outlines of the ink, where it is half there, between the dots (marching squares):
 * closed rings of points, in dots from the picture's top left. Which are holes is left to
 * tscircuit, which tells by which lies in which.
 */
export function outlinesOf(ink, W, H) {
  const at = (x, y) => ink[y * W + x]
  const half = 0.5
  const across = (a, b) => (a === b ? 0.5 : (half - a) / (b - a))
  // a point on an edge between two dots, by the edge's number: the edges along each row,
  // then those down each column
  const points = new Map()
  const along = (x, y) => {
    const id = y * W + x
    if (!points.has(id)) points.set(id, { x: x + across(at(x, y), at(x + 1, y)), y })
    return id
  }
  const down = (x, y) => {
    const id = W * H + y * W + x
    if (!points.has(id)) points.set(id, { x, y: y + across(at(x, y), at(x, y + 1)) })
    return id
  }
  const segments = []
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const tl = at(x, y)
      const tr = at(x + 1, y)
      const br = at(x + 1, y + 1)
      const bl = at(x, y + 1)
      const kind = (tl >= half) * 8 + (tr >= half) * 4 + (br >= half) * 2 + (bl >= half)
      if (kind === 0 || kind === 15) continue
      const T = () => along(x, y)
      const B = () => along(x, y + 1)
      const L = () => down(x, y)
      const R = () => down(x + 1, y)
      const middle = (tl + tr + br + bl) / 4 >= half
      const cut = {
        1: [[L, B]],
        2: [[B, R]],
        3: [[L, R]],
        4: [[T, R]],
        5: middle ? [[L, T], [B, R]] : [[T, R], [L, B]],
        6: [[T, B]],
        7: [[L, T]],
        8: [[L, T]],
        9: [[T, B]],
        10: middle ? [[T, R], [L, B]] : [[L, T], [B, R]],
        11: [[T, R]],
        12: [[L, R]],
        13: [[B, R]],
        14: [[L, B]],
      }[kind]
      for (const [a, b] of cut) segments.push([a(), b()])
    }
  // each point is where two segments meet: walk from one to the next round each ring
  const meeting = new Map()
  segments.forEach(([a, b], i) => {
    for (const end of [a, b]) {
      const list = meeting.get(end)
      if (list) list.push(i)
      else meeting.set(end, [i])
    }
  })
  const walked = new Uint8Array(segments.length)
  const rings = []
  for (let first = 0; first < segments.length; first++) {
    if (walked[first]) continue
    const ring = []
    let segment = first
    let from = segments[first][0]
    while (!walked[segment]) {
      walked[segment] = 1
      ring.push(points.get(from))
      const to = segments[segment][0] === from ? segments[segment][1] : segments[segment][0]
      from = to
      segment = (meeting.get(to) ?? []).find((other) => !walked[other]) ?? segment
    }
    if (ring.length >= 3) rings.push(ring)
  }
  return rings
}

/** A ring with the points left out that it can do without, straying `stray` at most (Douglas–Peucker). */
export function simplified(ring, stray) {
  const off = (p, a, b) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    return length === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / length
  }
  const keep = new Uint8Array(ring.length)
  const run = (from, to) => {
    let most = 0
    let at = -1
    for (let i = from + 1; i < to; i++) {
      const d = off(ring[i], ring[from], ring[to % ring.length])
      if (d > most) {
        most = d
        at = i
      }
    }
    if (most > stray) {
      keep[at] = 1
      run(from, at)
      run(at, to)
    }
  }
  // from the first point, and the one farthest from it, round both ways
  let far = 0
  for (let i = 1; i < ring.length; i++)
    if (Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y) > Math.hypot(ring[far].x - ring[0].x, ring[far].y - ring[0].y)) far = i
  keep[0] = 1
  keep[far] = 1
  run(0, far)
  run(far, ring.length)
  return ring.filter((_, i) => keep[i])
}

const areaOf = (ring) => {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/** The ink, made bolder (`grow` > 0) or thinner, by a round pen of so many dots. */
function grownBy(solid, W, H, grow) {
  const r = Math.abs(grow)
  const reach = Math.ceil(r)
  const pen = []
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) if (dx * dx + dy * dy <= r * r) pen.push([dx, dy])
  const out = new Uint8Array(W * H)
  const want = grow > 0 ? 1 : 0
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let found = 1 - want
      for (const [dx, dy] of pen) {
        const nx = x + dx
        const ny = y + dy
        const v = nx < 0 || ny < 0 || nx >= W || ny >= H ? 0 : solid[ny * W + nx]
        if (v === want) {
          found = want
          break
        }
      }
      out[y * W + x] = found
    }
  return out
}

/**
 * How much of the picture is too fine to print, as shares of its ink: lines thinner than
 * the finest a board house prints, which come out broken or not at all, and gaps
 * narrower than it, which fill in.
 */
function tooFine(ink, W, H, dots) {
  const solid = Uint8Array.from(ink, (v) => (v >= 0.5 ? 1 : 0))
  const r = (FINEST / 2) * dots
  const opened = grownBy(grownBy(solid, W, H, -r), W, H, r)
  const closed = grownBy(grownBy(solid, W, H, r), W, H, -r)
  let inked = 0
  let thin = 0
  let narrow = 0
  for (let i = 0; i < solid.length; i++) {
    inked += solid[i]
    if (solid[i] && !opened[i]) thin++
    if (!solid[i] && closed[i]) narrow++
  }
  return { thin: inked ? thin / inked : 0, narrow: inked ? narrow / inked : 0 }
}

// ---------------------------------------------------------------------------------------
// Written.

const mm = (n) => Math.round(n * 1000) / 1000

/**
 * The picture as artwork: the module the board imports, and what is to be said of it.
 * `width` or `height` in mm.
 */
export function artOf(picture, { width, height, light = false, bottom = false, ink: given } = {}) {
  const ratio = picture.height / picture.width
  const across = width ?? height / ratio
  const tall = across * ratio
  const dots = Math.min(DOTS, MOST_DOTS / Math.max(across, tall))
  const drawn = given ?? inkOf(picture, across, dots, light)
  const { ink, W, H } = drawn
  // the size as drawn, which is whole dots
  const scale = across / drawn.width
  const rings = outlinesOf(ink, W, H)
    .map((ring) => simplified(ring, STRAY / scale))
    .filter((ring) => ring.length >= 3 && areaOf(ring) * scale * scale >= SPECK)
  if (rings.length === 0) throw new Error(`There is nothing ${light ? "light" : "dark"} in the picture to print${light ? "" : ": if it is drawn light, for a dark ground, give --light"}.`)
  // in thousandths of a millimetre, from the top left: the dots are a row in from it
  const units = (p) => {
    const x = Math.round((p.x - 1 + 0.5) * scale * 1000)
    const y = Math.round((p.y - 1 + 0.5) * scale * 1000)
    return `${bottom ? Math.round(across * 1000) - x : x} ${y}`
  }
  const d = rings.map((ring) => `M${ring.map(units).join("L")}Z`).join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(across * 1000)} ${Math.round(tall * 1000)}"><path fill-rule="evenodd" d="${d}"/></svg>`
  return {
    imageUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    width: mm(across),
    height: mm(tall),
    layer: bottom ? "bottom" : "top",
    fine: given ? { thin: 0, narrow: 0 } : tooFine(ink, W, H, dots),
    points: rings.reduce((sum, ring) => sum + ring.length, 0),
  }
}

/** The module, as written beside the picture. */
export const moduleOf = (art, from) =>
  `// ${from}, made into artwork for the board's print by the app's board-art.mjs: make it
// again from the picture rather than change it here. Printed with
// <silkscreengraphic {...thisArt} pcbX={…} pcbY={…} />.
export default {
  width: ${art.width},
  height: ${art.height},
  layer: "${art.layer}",
  imageUrl:
    ${JSON.stringify(art.imageUrl)},
} as const
`

// run by itself: node board-art.mjs pcb/art/<name>.svg --width <mm>
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [given, ...rest] = process.argv.slice(2)
  const flag = (name) => {
    const at = rest.indexOf(`--${name}`)
    return at < 0 ? undefined : Number(rest[at + 1])
  }
  const width = flag("width")
  const height = flag("height")
  if (!given || (width === undefined) === (height === undefined) || !((width ?? height) > 0)) {
    console.error("Say which picture, and how wide or how tall it is to be on the board, in mm: node board-art.mjs pcb/art/logo.svg --width 20")
    process.exit(1)
  }
  try {
    const file = path.resolve(given)
    const art = artOf(readPicture(file), { width, height, light: rest.includes("--light"), bottom: rest.includes("--bottom") })
    const out = path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.ts`)
    fs.writeFileSync(out, moduleOf(art, path.basename(file)))
    console.log(
      `Wrote ${path.relative(process.cwd(), out)}: ${art.width} by ${art.height} mm, on the ${art.layer}, ${art.points} points.`
    )
    const share = (n) => `${Math.max(1, Math.round(n * 100))}%`
    if (art.fine.thin > 0.01)
      console.log(
        `About ${share(art.fine.thin)} of its ink is in lines thinner than ${FINEST} mm, which print broken or not at all: make it bigger, or its lines bolder.`
      )
    if (art.fine.narrow > 0.01)
      console.log(
        `Gaps in it as much as ${share(art.fine.narrow)} of its ink are narrower than ${FINEST} mm, and fill in when printed: make it bigger, or its gaps wider.`
      )
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
