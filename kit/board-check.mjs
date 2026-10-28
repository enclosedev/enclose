// Checks one of a project's circuit boards before it is ordered from JLCPCB, for Enclose
// (https://enclose.dev). Run it from the top of the project, on a board that has been
// built (kit/board.mjs):
//
//     node /path/to/kit/board-check.mjs pcb/main.circuit.tsx
//
// It says, check by check, what JLCPCB would find wrong with the order, which is what
// a user otherwise finds for themselves on JLCPCB's site:
//
//   1. every part placed has a JLCPCB part number, of a part JLCPCB lists and has in
//      stock, and the BOM names each by its maker's number and its package;
//   2. each part's rotation in the placement file (pick_and_place.csv) turns JLCPCB's
//      own footprint of that part onto the board's pads, pin on pin;
//   3. each part has a 3D model, for the board in 3D;
//   4. the lettering and artwork printed on it read as they should (board-lettering.mjs);
//   5. the Gerbers' zip is of the board as its file is now;
//   6. and, for the user to know, which parts cost more to have assembled: those
//      through the board, and those on its underside.
//
// It ends with 0 when the first five pass, and 1 when any does not, or could not be
// checked (offline, say). The build uses it too: what it can mend in the zip, the BOM's
// columns and the placement file's, it mends as it builds (`mendOrder`).
//
// Parts are looked up in tscircuit's copy of JLCPCB's catalogue (jlcsearch.tscircuit.com),
// and in JLCPCB's own parts search for those the copy does not have; their footprints in
// EasyEDA's library, which is JLCPCB's own. It needs Node.js 18 or later, and the internet.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import zlib from "node:zlib"

import { letteringOf } from "./board-lettering.mjs"

/** How far a pad of JLCPCB's footprint can be from the board's own and be on it, mm. */
const ON_PAD = 0.2
/** EasyEDA's unit, in mm: 10 mil. */
const EASYEDA_UNIT = 0.254
/** What EasyEDA is asked with: it turns away a request that is not a browser's. */
const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
/** How long a lookup is waited for, ms; and how many go at once. */
const LOOKUP_MS = 15_000
const AT_ONCE = 2
/** How long to wait before asking again, ms, when EasyEDA turns a lookup away for coming too often. */
const AGAIN_MS = [3_000, 10_000]
/**
 * Where the footprints looked up are kept, from one run to the next and for every
 * project: EasyEDA turns away whoever asks it for many at once.
 */
const FOOTPRINTS = path.join(os.tmpdir(), "enclose-boards", ".footprints")

// ---------------------------------------------------------------------------------------
// A zip, read and written whole: a board's Gerbers' zip is small, and Node has no zip of
// its own. Entries stored or deflated, which is all a zip of Gerbers has.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(data) {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A zip's files, by name, in their order. */
export function readZip(file) {
  const zip = fs.readFileSync(file)
  let end = zip.length - 22
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error(`${file} is not a zip.`)
  const count = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  const files = new Map()
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`${file} is not whole.`)
    const method = zip.readUInt16LE(at + 10)
    const size = zip.readUInt32LE(at + 20)
    const nameLength = zip.readUInt16LE(at + 28)
    const extra = zip.readUInt16LE(at + 30)
    const comment = zip.readUInt16LE(at + 32)
    const local = zip.readUInt32LE(at + 42)
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength)
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const data = zip.subarray(start, start + size)
    files.set(name, method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data))
    at += 46 + nameLength + extra + comment
  }
  return files
}

/** Those files, as a zip. */
export function zipOf(files) {
  const now = new Date()
  const time =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date =
    ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, data] of files) {
    const packed = zlib.deflateRawSync(data)
    const called = Buffer.from(name, "utf8")
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(called.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(called.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, called, packed)
    centrals.push(central, called)
    offset += local.length + called.length + packed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.size, 8)
  end.writeUInt16LE(files.size, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

// ---------------------------------------------------------------------------------------
// CSV, as the BOM and the placement file are written: quoted or not.

function readCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") row.push(field), (field = "")
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field), rows.push(row), (row = []), (field = "")
    } else field += c
  }
  if (field || row.length) row.push(field), rows.push(row)
  return rows.filter((one) => one.some((cell) => cell !== ""))
}

const csvOf = (rows) =>
  rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n") + "\n"

/** A table's rows as objects, by its first row; and that row. */
function table(text) {
  const [head = [], ...rows] = readCsv(text)
  return {
    head,
    rows: rows.map((row) => Object.fromEntries(head.map((name, i) => [name, row[i] ?? ""]))),
  }
}

// ---------------------------------------------------------------------------------------
// The board, as tscircuit has it.

const MODELS = ["obj", "stl", "3mf", "gltf", "glb", "step", "wrl"]
  .map((kind) => `model_${kind}_url`)
  .concat("model_jscad")

const numbered = (numbers) =>
  Array.isArray(numbers) && numbers.some((one) => String(one).trim())

/** The JLCPCB number a part is given, "C2765186", or null. */
function numberOf(source) {
  const suppliers = source?.supplier_part_numbers ?? {}
  const given = [suppliers.jlcpcb, suppliers.lcsc]
    .filter(Array.isArray)
    .flat()
    .map((one) => String(one).trim().toUpperCase())
    .find(Boolean)
  if (!given) return null
  return /^C\d+$/.test(given) ? given : /^\d+$/.test(given) ? `C${given}` : given
}

/**
 * What is placed on the board, part by part, as JLCPCB is to assemble it: not test
 * points, nor a bare hole written as a chip (as the build's own list of parts with no
 * JLCPCB number has it: unsourcedOf, in the app's shared/board-format.ts).
 */
export function placedParts(circuit) {
  const sources = new Map(
    circuit
      .filter((one) => one.type === "source_component")
      .map((one) => [one.source_component_id, one])
  )
  const ports = new Map(
    circuit
      .filter((one) => one.type === "source_port")
      .map((one) => [one.source_port_id, one])
  )
  const pcbPorts = new Map(
    circuit
      .filter((one) => one.type === "pcb_port")
      .map((one) => [one.pcb_port_id, ports.get(one.source_port_id)])
  )
  const parts = []
  for (const placed of circuit) {
    if (placed.type !== "pcb_component" || placed.do_not_place) continue
    const source = sources.get(placed.source_component_id)
    if (!source || source.ftype === "simple_test_point") continue
    const mine = (one) => one.pcb_component_id === placed.pcb_component_id
    const shape = circuit.filter(
      (one) =>
        ["pcb_plated_hole", "pcb_hole", "pcb_smtpad"].includes(one.type) && mine(one)
    )
    const cad = circuit.filter((one) => one.type === "cad_component" && mine(one))
    const bareHole =
      source.ftype === "simple_chip" &&
      !source.manufacturer_part_number?.trim() &&
      !Object.values(source.supplier_part_numbers ?? {}).some(numbered) &&
      !cad.some((one) => MODELS.some((model) => one[model])) &&
      shape.length === 1 &&
      shape[0].type !== "pcb_smtpad"
    if (bareHole) continue
    const centre = placed.center ?? { x: 0, y: 0 }
    const pads = shape
      .filter((one) => one.type !== "pcb_hole")
      .flatMap((one) => {
        const pin = pcbPorts.get(one.pcb_port_id)?.pin_number
        let { x, y } = one
        if ((x === undefined || y === undefined) && Array.isArray(one.points)) {
          x = one.points.reduce((all, p) => all + p.x, 0) / one.points.length
          y = one.points.reduce((all, p) => all + p.y, 0) / one.points.length
        }
        if (pin === undefined || x === undefined || y === undefined) return []
        return [{ pin: String(pin), x: x - centre.x, y: y - centre.y }]
      })
    parts.push({
      name: source.name || placed.pcb_component_id,
      source,
      number: numberOf(source),
      maker: source.manufacturer_part_number?.trim() || null,
      layer: placed.layer === "bottom" ? "bottom" : "top",
      rotation: placed.rotation ?? 0,
      // (pins through the board only: not a surface-mounted part with pegs that hold it)
      throughHole:
        shape.some((one) => one.type === "pcb_plated_hole") &&
        !shape.some((one) => one.type === "pcb_smtpad"),
      modelled: cad.some(
        (one) => MODELS.some((model) => one[model]) || one.footprinter_string
      ),
      pads,
    })
  }
  return parts.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
}

// ---------------------------------------------------------------------------------------
// Looked up: a part in JLCPCB's catalogue, and its footprint in EasyEDA's library. Each
// once a run; a footprint once at all, where there is a folder to keep it in.

const looked = new Map()
function once(key, look) {
  if (!looked.has(key)) looked.set(key, look())
  return looked.get(key)
}

let going = 0
const waiting = []
async function fetched(url, headers = {}, body = undefined) {
  if (going >= AT_ONCE) await new Promise((go) => waiting.push(go))
  going++
  try {
    for (let tries = 0; ; tries++) {
      const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(LOOKUP_MS),
      })
      if (response.ok) return await response.json()
      if (![403, 429].includes(response.status) || tries >= AGAIN_MS.length)
        throw new Error(`HTTP ${response.status}`)
      await new Promise((go) => setTimeout(go, AGAIN_MS[tries]))
    }
  } finally {
    going--
    waiting.shift()?.()
  }
}

/**
 * A part as JLCPCB's catalogue has it: { maker, package, stock, basic }; null where it
 * is not listed. Throws where it cannot be looked up.
 *
 * tscircuit's copy of the catalogue is asked first, and JLCPCB itself for a part the
 * copy does not have: the copy is missing many that JLCPCB lists and stocks, among them
 * its basic resistors and capacitors (C25804, C14663). So only JLCPCB is believed when
 * it says a part is not listed.
 */
export function catalogued(number) {
  return once(`part:${number}`, async () => {
    const copied = await inCopy(number).catch(() => null)
    return copied ?? (await atJlcpcb(number))
  })
}

/** A part as tscircuit's copy of JLCPCB's catalogue has it; null where the copy has no such part. */
async function inCopy(number) {
  const id = Number(number.slice(1))
  const found = await fetched(
    `https://jlcsearch.tscircuit.com/api/search?q=${encodeURIComponent(number)}&limit=10`
  )
  const part = (found?.components ?? []).find((one) => one.lcsc === id)
  return part
    ? {
        maker: part.mfr || null,
        package: part.package || null,
        stock: typeof part.stock === "number" ? part.stock : null,
        basic: !!part.is_basic,
      }
    : null
}

/**
 * A part as JLCPCB's own parts search has it, the one its site's parts library is
 * searched with; null where it is not listed. The search matches loosely, so only a
 * part of that very number is taken.
 */
async function atJlcpcb(number) {
  const found = await fetched(
    "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList",
    { "User-Agent": BROWSER },
    { keyword: number, currentPage: 1, pageSize: 10 }
  )
  const listed = found?.data?.componentPageInfo?.list
  if (found?.code !== 200 || !Array.isArray(listed))
    throw new Error("JLCPCB's parts search gave no answer")
  const part = listed.find((one) => String(one.componentCode).toUpperCase() === number.toUpperCase())
  return part
    ? {
        maker: part.componentModelEn || null,
        package: part.componentSpecificationEn || null,
        stock: typeof part.stockCount === "number" ? part.stockCount : null,
        basic: part.componentLibraryType === "base",
      }
    : null
}

/**
 * A part's footprint as JLCPCB places it, from EasyEDA: its pads, each with its pin, from
 * the footprint's own origin, in mm, Y up. Null where EasyEDA has none.
 */
export function footprintOf(number, keep = FOOTPRINTS) {
  return once(`footprint:${number}`, async () => {
    const kept = keep && path.join(keep, `${number}.json`)
    if (kept && fs.existsSync(kept))
      return JSON.parse(fs.readFileSync(kept, "utf8"))
    const found = await fetched(
      `https://easyeda.com/api/products/${encodeURIComponent(number)}/components?version=6.4.19.5`,
      { "User-Agent": BROWSER }
    )
    const data = found?.result?.packageDetail?.dataStr
    let footprint = null
    if (data && Array.isArray(data.shape)) {
      const ox = Number(data.head?.x ?? 0)
      const oy = Number(data.head?.y ?? 0)
      const pads = data.shape
        .filter((one) => typeof one === "string" && one.startsWith("PAD~"))
        .map((one) => one.split("~"))
        .map((field) => ({
          pin: field[8],
          x: (Number(field[2]) - ox) * EASYEDA_UNIT,
          // (EasyEDA's Y is down)
          y: -(Number(field[3]) - oy) * EASYEDA_UNIT,
        }))
        .filter((pad) => pad.pin && Number.isFinite(pad.x) && Number.isFinite(pad.y))
      footprint = { name: data.head?.c_para?.package ?? null, pads }
    }
    if (kept) {
      fs.mkdirSync(keep, { recursive: true })
      fs.writeFileSync(kept, JSON.stringify(footprint))
    }
    return footprint
  })
}

// ---------------------------------------------------------------------------------------
// Rotations: JLCPCB turns its own footprint of a part by the placement file's rotation,
// anticlockwise from that footprint's 0°, which is often not tscircuit's 0°.

const turned = ({ x, y }, degrees) => {
  const a = (degrees * Math.PI) / 180
  return {
    x: x * Math.cos(a) - y * Math.sin(a),
    y: x * Math.sin(a) + y * Math.cos(a),
  }
}

/**
 * How far JLCPCB's footprint, turned by `degrees` (and mirrored, for a part on the
 * underside), is from the board's pads, pin on pin, mm: its worst pad. Null where too
 * few pins are in both to tell.
 */
function missBy(part, footprint, degrees) {
  const theirs = footprint.pads.map((pad) => ({
    pin: pad.pin,
    ...turned(part.layer === "bottom" ? { x: -pad.x, y: pad.y } : pad, degrees),
  }))
  const pins = [...new Set(part.pads.map((pad) => pad.pin))].filter((pin) =>
    theirs.some((pad) => pad.pin === pin)
  )
  // (pins named otherwise in the one than the other, A1 and 1, are told apart by shape)
  const all = new Set(part.pads.map((pad) => pad.pin)).size
  if (pins.length < 2 || pins.length < all * 0.8) return null
  // the footprint's origin need not be the middle of its pads: it is moved onto them
  // as well as it goes, pin by pin
  const middle = (pads) => ({
    x: pads.reduce((all, pad) => all + pad.x, 0) / pads.length,
    y: pads.reduce((all, pad) => all + pad.y, 0) / pads.length,
  })
  let dx = 0
  let dy = 0
  for (const pin of pins) {
    const ours = middle(part.pads.filter((pad) => pad.pin === pin))
    const mine = middle(theirs.filter((pad) => pad.pin === pin))
    dx += ours.x - mine.x
    dy += ours.y - mine.y
  }
  dx /= pins.length
  dy /= pins.length
  let worst = 0
  for (const pad of part.pads) {
    if (!pins.includes(pad.pin)) continue
    const nearest = Math.min(
      ...theirs
        .filter((one) => one.pin === pad.pin)
        .map((one) => Math.hypot(pad.x - one.x - dx, pad.y - one.y - dy))
    )
    worst = Math.max(worst, nearest)
  }
  return worst
}

/**
 * How many of the board's pads JLCPCB's footprint, turned by `degrees`, puts a pad of its
 * own on, whatever their pins are called, and how far off the worst of those is: moved
 * onto them as well as it goes.
 */
function shapeMiss(part, footprint, degrees) {
  const theirs = footprint.pads.map((pad) =>
    turned(part.layer === "bottom" ? { x: -pad.x, y: pad.y } : pad, degrees)
  )
  const [anchor] = part.pads
  let best = { on: 0, by: Infinity }
  // each of its pads tried as where the board's first one is
  for (const at of theirs) {
    const dx = anchor.x - at.x
    const dy = anchor.y - at.y
    let on = 0
    let worst = 0
    for (const pad of part.pads) {
      const nearest = Math.min(
        ...theirs.map((one) => Math.hypot(pad.x - one.x - dx, pad.y - one.y - dy))
      )
      if (nearest <= ON_PAD) on++
      worst = Math.max(worst, nearest)
    }
    if (on > best.on || (on === best.on && worst < best.by)) best = { on, by: worst }
  }
  return best
}

const round = (degrees) => ((Math.round(degrees * 100) / 100) % 360 + 360) % 360

/**
 * The rotation the placement file is to give a part for JLCPCB to put it on its pads:
 * { rotation, by } where one fits, `by` how far off its worst pad is then; { rotation:
 * null, why } where none does, or it cannot be told.
 */
export async function rotationFor(part, keep = FOOTPRINTS) {
  if (!part.number) return { rotation: null, why: "it has no JLCPCB number" }
  let footprint
  try {
    footprint = await footprintOf(part.number, keep)
  } catch (error) {
    return { rotation: null, why: `EasyEDA could not be asked (${error.message})`, offline: true }
  }
  if (!footprint || footprint.pads.length === 0)
    return { rotation: null, why: "EasyEDA has no footprint for it" }
  const tried = [0, 90, 180, 270].map((more) => {
    const rotation = round(part.rotation + more)
    return { rotation, by: missBy(part, footprint, rotation) }
  })
  if (tried.every((one) => one.by === null)) {
    // its pins are named otherwise than JLCPCB's: by the shape of its pads, where that
    // fits one way only
    const shaped = [0, 90, 180, 270]
      .map((more) => round(part.rotation + more))
      .map((rotation) => ({ rotation, ...shapeMiss(part, footprint, rotation) }))
      .filter((one) => one.on === part.pads.length)
    if (shaped.length === 1) return { rotation: shaped[0].rotation, by: shaped[0].by, byShape: true }
    return {
      rotation: null,
      why:
        shaped.length === 0
          ? `its pins are named otherwise than in JLCPCB's footprint (${footprint.name ?? part.number}), and its pads do not match that footprint's`
          : `its pins are named otherwise than in JLCPCB's footprint (${footprint.name ?? part.number}), and its pads fit that footprint more than one way round`,
    }
  }
  const fits = tried.filter((one) => one.by !== null && one.by <= ON_PAD)
  if (fits.length === 0) {
    const best = Math.min(...tried.map((one) => one.by ?? Infinity))
    return {
      rotation: null,
      why: `no rotation puts JLCPCB's footprint (${footprint.name ?? part.number}) on its pads: the nearest is ${best.toFixed(2)} mm off: the board's footprint is not JLCPCB's`,
    }
  }
  // a part whose pins are alike all round fits more than one way: the way it is drawn,
  // where that is one of them
  const best =
    fits.find((one) => one.rotation === round(part.rotation)) ??
    fits.reduce((a, b) => (b.by < a.by ? b : a))
  return best
}

/** Where pin 1 of a part is, as the board is drawn from the top: "top left". */
function pinOneOf(part) {
  const ones = part.pads.filter((pad) => pad.pin === "1")
  if (ones.length === 0) return null
  const { x, y } = ones[0]
  const side = (value, low, high) =>
    Math.abs(value) < 0.25 ? "" : value < 0 ? low : high
  const said = [side(y, "bottom", "top"), side(x, "left", "right")].filter(Boolean).join(" ")
  return said || "middle"
}

// ---------------------------------------------------------------------------------------
// The order files mended, in the Gerbers' zip: as JLCPCB reads them.

const isNumber = (text) => /^C\d+$/i.test(String(text).trim())

/**
 * Mend the BOM and the placement file in a board's Gerbers' zip, in place: the BOM's
 * Comment the maker's part number and its Footprint the package, where tscircuit wrote
 * the JLCPCB number in both; the placement file's layer as Top or Bottom, its places in
 * mm with the unit, and each part's rotation the one that turns JLCPCB's footprint onto
 * the board's pads. Resolves to what was turned, and what could not be told:
 * { turned: [{ name, from, to }], untold: [{ name, why }] }.
 */
export async function mendOrder(circuit, zipFile, keep = FOOTPRINTS) {
  const files = readZip(zipFile)
  const parts = new Map(placedParts(circuit).map((part) => [part.name, part]))
  const done = { turned: [], untold: [] }
  const bomName = [...files.keys()].find((name) => /(^|\/)bom\.csv$/i.test(name))
  if (bomName) {
    const { head, rows } = table(files.get(bomName).toString("utf8"))
    for (const row of rows) {
      const part = parts.get(row.Designator)
      const number = row["JLCPCB Part #"] || row["LCSC Part #"] || part?.number
      let listed = null
      if (number && isNumber(number))
        listed = await catalogued(number.toUpperCase()).catch(() => null)
      if ("Comment" in row && (!row.Comment.trim() || isNumber(row.Comment)))
        row.Comment = part?.maker ?? listed?.maker ?? row.Value ?? row.Comment
      if ("Footprint" in row && (!row.Footprint.trim() || isNumber(row.Footprint))) {
        // the name of JLCPCB's own footprint of it, where EasyEDA has one: the catalogue's
        // package is as often as not "SMD", or in Chinese
        const footprint =
          number && isNumber(number)
            ? await footprintOf(number.toUpperCase(), keep).catch(() => null)
            : null
        row.Footprint =
          footprint?.name ?? listed?.package ?? part?.source?.footprinter_string ?? row.Footprint
      }
      if ("Value" in row && isNumber(row.Value)) row.Value = row.Comment
    }
    files.set(bomName, Buffer.from(csvOf([head, ...rows.map((row) => head.map((name) => row[name]))])))
  }
  const placeName = [...files.keys()].find((name) => /pick_and_place\.csv$/i.test(name))
  if (placeName) {
    const { head, rows } = table(files.get(placeName).toString("utf8"))
    const mm = (value) => {
      const n = Number(String(value).replace(/mm$/i, ""))
      return Number.isFinite(n) ? `${n.toFixed(4)}mm` : value
    }
    await Promise.all(
      rows.map(async (row) => {
        row["Mid X"] = mm(row["Mid X"])
        row["Mid Y"] = mm(row["Mid Y"])
        row.Layer = /^b/i.test(row.Layer) ? "Bottom" : "Top"
        const part = parts.get(row.Designator)
        if (!part?.number) return
        const found = await rotationFor(part, keep)
        if (found.rotation === null) {
          done.untold.push({ name: part.name, why: found.why })
          return
        }
        const was = Number(row.Rotation)
        if (round(was) !== found.rotation) {
          row.Rotation = String(found.rotation)
          done.turned.push({ name: part.name, from: round(was), to: found.rotation })
        }
      })
    )
    files.set(placeName, Buffer.from(csvOf([head, ...rows.map((row) => head.map((name) => row[name]))])))
  }
  fs.writeFileSync(`${zipFile}.part`, zipOf(files))
  fs.renameSync(`${zipFile}.part`, zipFile)
  return done
}

// ---------------------------------------------------------------------------------------
// The checks.

const list = (names) => {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/**
 * Check a built board, as this script's header says: each check { title, passed, lines },
 * `passed` null where it could not be checked, and the last for the user's information
 * alone. `folder` is the board's folder (pcb/), `name` the board's.
 */
export async function checkBoard(folder, name, keep = FOOTPRINTS) {
  const built = path.join(folder, "build")
  const circuitFile = path.join(built, `${name}.circuit.json`)
  const zipFile = path.join(built, `${name}.gerbers.zip`)
  if (!fs.existsSync(circuitFile))
    throw new Error(`${name} has not been built: there is no ${path.relative(process.cwd(), circuitFile)}.`)
  const circuit = JSON.parse(fs.readFileSync(circuitFile, "utf8"))
  const parts = placedParts(circuit)
  const files = fs.existsSync(zipFile) ? readZip(zipFile) : null
  const bom = files && [...files.entries()].find(([file]) => /(^|\/)bom\.csv$/i.test(file))
  const cpl = files && [...files.entries()].find(([file]) => /pick_and_place\.csv$/i.test(file))
  const checks = []

  // 1. part numbers, in stock, and the BOM's columns
  {
    const lines = []
    let passed = true
    const counts = new Map()
    for (const part of parts)
      if (part.number) counts.set(part.number, (counts.get(part.number) ?? 0) + 1)
    const none = parts.filter((part) => !part.number).map((part) => part.name)
    if (none.length) {
      passed = false
      lines.push(
        `No JLCPCB number: ${list(none)}. Give each supplierPartNumbers={{ jlcpcb: ["C…"] }}, of a part JLCPCB has in stock.`
      )
    }
    let offline = false
    for (const [number, count] of counts) {
      const who = list(parts.filter((part) => part.number === number).map((part) => part.name))
      let listed
      try {
        listed = await catalogued(number)
      } catch (error) {
        offline = true
        lines.push(`${who} (${number}) could not be looked up (${error.message}).`)
        continue
      }
      if (!listed) {
        passed = false
        lines.push(
          `${who}: ${number} is not in JLCPCB's catalogue, or no longer: take a part that is, which does the same job in the same footprint, and tell the user.`
        )
      } else if (listed.stock !== null && listed.stock < count) {
        passed = false
        lines.push(
          `${who}: ${number} (${listed.maker ?? "?"}) has ${listed.stock} in stock: take one that is in stock, and tell the user.`
        )
      }
    }
    if (bom) {
      const { rows } = table(bom[1].toString("utf8"))
      const wrong = rows
        .filter((row) => isNumber(row.Comment ?? "") || isNumber(row.Footprint ?? "") || !String(row.Comment ?? "").trim())
        .map((row) => row.Designator)
      if (wrong.length) {
        passed = false
        lines.push(
          `In the BOM, ${list(wrong)} ${wrong.length === 1 ? "has" : "have"} the JLCPCB number, or nothing, where the maker's part number (Comment) or the package (Footprint) goes: build the board again, which mends it.`
        )
      }
    } else {
      passed = false
      lines.push("There is no BOM: the Gerbers' zip is missing, or has none.")
    }
    if (passed && offline) passed = null
    if (passed)
      lines.push(`All ${parts.length} parts have a JLCPCB number of a part in stock, and the BOM names each.`)
    checks.push({ title: "Part numbers", passed, lines })
  }

  // 2. rotations, and the placement file's form
  {
    const lines = []
    let passed = true
    let offline = false
    if (!cpl) {
      passed = false
      lines.push("There is no placement file (pick_and_place.csv) in the Gerbers' zip.")
    } else {
      const { rows } = table(cpl[1].toString("utf8"))
      const byName = new Map(rows.map((row) => [row.Designator, row]))
      const formed = rows.filter(
        (row) => !/^(Top|Bottom)$/.test(row.Layer) || !/mm$/.test(row["Mid X"]) || !/mm$/.test(row["Mid Y"])
      )
      if (formed.length) {
        passed = false
        lines.push(
          `The placement file is not in JLCPCB's form (Layer Top or Bottom, places in mm with the unit) for ${list(formed.map((row) => row.Designator))}: build the board again, which mends it.`
        )
      }
      const told = await Promise.all(
        parts.filter((part) => part.number).map(async (part) => ({ part, found: await rotationFor(part, keep) }))
      )
      const wrong = []
      for (const { part, found } of told) {
        const row = byName.get(part.name)
        if (!row) {
          passed = false
          lines.push(`${part.name} is not in the placement file.`)
          continue
        }
        if (found.rotation === null) {
          if (found.offline) offline = true
          else passed = false
          lines.push(`${part.name} (${part.number}): could not be checked, ${found.why}. Check it by hand on JLCPCB's preview.`)
          continue
        }
        if (round(Number(row.Rotation)) !== found.rotation) wrong.push(`${part.name} (${round(Number(row.Rotation))}°, should be ${found.rotation}°)`)
      }
      if (wrong.length) {
        passed = false
        lines.push(`Turned the wrong way for JLCPCB's footprint: ${list(wrong)}. Build the board again, which mends it.`)
      }
      if (passed) {
        lines.push(
          `Every part with a JLCPCB number sits on its pads, pin on pin, as JLCPCB turns its own footprint by the placement file.`
        )
      }
      // where pin 1 is, for the user to check JLCPCB's preview by: of the parts with
      // more than two pins, whose way round matters most and is easiest to get wrong
      const pinned = told
        .filter(({ part }) => new Set(part.pads.map((pad) => pad.pin)).size > 2)
        .map(({ part }) => [part.name, pinOneOf(part)])
        .filter(([, where]) => where)
      if (pinned.length)
        lines.push(
          `In JLCPCB's preview the magenta dot of each part must sit on its pin 1: ${pinned.map(([who, where]) => `${who} at its ${where}`).join(", ")} (as the board is drawn from the top). JLCPCB's preview can snap a part onto pads it does not fit, so a wrong turn can still look right there.`
        )
    }
    if (passed && offline) passed = null
    checks.push({ title: "Rotations", passed, lines })
  }

  // 3. 3D models
  {
    const bare = parts.filter((part) => !part.modelled).map((part) => part.name)
    checks.push({
      title: "3D models",
      passed: bare.length === 0,
      lines: bare.length
        ? [
            `No 3D model, so the board in 3D shows bare pads: ${list(bare)}. A footprint written by hand carries none: give each a cadModel, as the reference says.`,
          ]
        : ["Every part has a 3D model."],
    })
  }

  // 4. the lettering
  {
    const wrong = letteringOf(circuit)
    checks.push({
      title: "Lettering",
      passed: wrong.length === 0,
      lines: wrong.length
        ? [...wrong, "Mend each as the reference says, under Lettering (and Artwork)."]
        : ["Every word printed on the board is in capitals, reads upright, and is clear of the rest and of the edge, and so is its artwork."],
    })
  }

  // 5. the order files of the board as it is
  {
    const lines = []
    let passed = true
    if (!fs.existsSync(zipFile)) {
      passed = false
      lines.push("There is no Gerbers' zip: build the board.")
    } else {
      const zipped = fs.statSync(zipFile).mtimeMs
      const newer = fs
        .readdirSync(folder, { recursive: true })
        .map(String)
        .filter((file) => !file.split(path.sep).some((part) => part === "build" || part.startsWith(".")))
        .filter((file) => file === `${name}.circuit.tsx` || !/\.circuit\.tsx$|\.board\.json$/.test(file))
        .filter((file) => {
          const stat = fs.statSync(path.join(folder, file))
          return stat.isFile() && stat.mtimeMs > zipped
        })
      if (newer.length) {
        passed = false
        lines.push(
          `The Gerbers' zip is older than ${list(newer)}: what would be ordered is the board as it was before. Build it again.`
        )
      }
      if (zipped < fs.statSync(circuitFile).mtimeMs - 60_000) {
        passed = false
        lines.push(
          "The Gerbers' zip is older than the board's last build: its Gerbers could not be written then. Build it again, and read why."
        )
      }
      if (passed) lines.push("The Gerbers' zip is of the board as its file is now.")
    }
    checks.push({ title: "Up to date", passed, lines })
  }

  // 6. what the assembly costs
  {
    const lines = []
    const through = parts.filter((part) => part.throughHole)
    const under = parts.filter((part) => part.layer === "bottom")
    if (through.length)
      lines.push(
        `Through the board, which JLCPCB assembles at extra cost: ${list(through.map((part) => `${part.name}${part.number ? ` (${part.number})` : ""}`))}. They can be left off the order and soldered by hand.`
      )
    if (under.length)
      lines.push(
        `On the underside, which makes it two-sided assembly, at extra cost: ${list(under.map((part) => part.name))}.`
      )
    if (lines.length === 0)
      lines.push("Every part is surface-mounted, on the top: the cheapest assembly JLCPCB does.")
    checks.push({ title: "Assembly cost", passed: undefined, lines })
  }
  return checks
}

/** The checks, as they are printed. */
export function said(checks) {
  return checks
    .map((check, i) => {
      const mark =
        check.passed === true ? "✓" : check.passed === false ? "✗" : check.passed === null ? "?" : "·"
      return [`${mark} ${i + 1}. ${check.title}`, ...check.lines.map((line) => `    ${line}`)].join("\n")
    })
    .join("\n")
}

/** Whether a board passed them: every check, but for the one that only informs. */
export const passedAll = (checks) => checks.every((check) => check.passed !== false && check.passed !== null)

// run by itself: node board-check.mjs pcb/<name>.circuit.tsx
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const given = process.argv[2]
  const ending = ".circuit.tsx"
  if (!given || !given.endsWith(ending)) {
    console.error("Say which board to check: node board-check.mjs pcb/<name>.circuit.tsx")
    process.exit(1)
  }
  const file = path.resolve(given)
  const name = path.basename(file).slice(0, -ending.length)
  try {
    const checks = await checkBoard(path.dirname(file), name)
    console.log(`Before ordering ${name} from JLCPCB:\n\n${said(checks)}`)
    process.exit(passedAll(checks) ? 0 : 1)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
