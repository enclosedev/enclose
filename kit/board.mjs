// Builds one of a project's circuit boards, for Enclose (https://enclose.dev).
//
// This file belongs to Enclose: run it from where the app keeps it, and do not copy it
// into a project. A board is written with tscircuit, in a project's pcb/ folder, and
// this builds it with tscircuit's own command line (`tsci build`), fetched by npx the
// first time and kept from then on:
//
//     node /path/to/kit/board.mjs pcb/main.circuit.tsx
//
// What it makes goes in pcb/build/, beside the board, each file named for it:
//
//     main.circuit.json   the board as tscircuit has it: what the app draws it from
//     main.glb            the board in 3D, as the app shows it
//     main.step           the board in 3D, for the model to take in
//     main.gerbers.zip    the files a board house makes it from, with what goes on it
//                         and where (a BOM, and where each part is placed)
//     main.parts.json     the parts whose makers' own 3D models tscircuit could not put
//     main.parts/         into main.step, and where each goes: the models are fetched,
//                         for the model to read beside the board
//     main.pcb.png        pictures of it, to check it by: the board,
//     main.schematic.png  its schematic,
//     main.3d.png         and the board in 3D
//
// The BOM and the placement file in main.gerbers.zip are mended as JLCPCB reads them:
// each part named by its maker's number and its package, and turned the way JLCPCB's
// own footprint of it needs. A board that is finished is then checked as it would be
// ordered (board-check.mjs, beside this), and what the checks found is said at the end.
//
// While it builds, main.building.json says how far it has got: the app shows that, and
// the routing as it goes. And while it routes, main.routing.json has what the router is
// trying, as tscircuit's router draws that of itself: the app draws it over the board.
// Both are gone when the build is over, however it ended.
//
// With --preview it builds only a quick look at the board, unrouted and with nothing
// else made of it, into main.preview.json: the app does that by itself each time the
// board's file is written while an agent is at work on it, so that the board can be
// seen coming together, even while it still breaks tscircuit's rules. A preview is in a
// folder of its own, and leaves the board's real build as it is.
//
// It is built in a folder of its own, out of the project, so that nothing of tscircuit's
// is left in the project but what it made. Anything after the board's file is handed on
// to `tsci build` as it is (--routing-disabled, say). Where the build fails, what was
// built before is left as it was, and it says why.
//
// It needs Node.js 18 or later, and the internet the first time, for tscircuit itself.
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { checkBoard, mendOrder, passedAll, said } from "./board-check.mjs"
import { letteringOf } from "./board-lettering.mjs"

/** The tscircuit it builds with: the one the app is known to work with. */
const TSCIRCUIT = "tscircuit@0.0.2892"

/**
 * What tscircuit is run with. npm 12 fetches nothing from git unless it is let:
 * tscircuit has a part that is (@tscircuit/pcb-trace-linter, which it has from GitHub),
 * and so it is let, as an environment variable, which an older npm passes over. Its
 * install scripts are left to run: sharp, which a build reaches, gets its binary so.
 * And tscircuit counts how its command line is used unless it is told not to: it is
 * told, as the privacy policy says.
 */
const TSCI_ENV = {
  ...process.env,
  npm_config_allow_git: "all",
  TSCI_TELEMETRY_DISABLED: "1",
}

/** What a board's file is called: its name, as the app knows the board by it, and this. */
const ENDING = ".circuit.tsx"
/** What the app takes for a board's name: lower case, and nothing an address cannot hold. */
const NAME = /^[a-z0-9][a-z0-9-]*$/

/** What the build writes, under what each is called in pcb/build/. */
const MADE = [
  ["3d.glb", "glb"],
  ["3d.step", "step"],
  ["gerbers.zip", "gerbers.zip"],
  ["pcb.png", "pcb.png"],
  ["schematic.png", "schematic.png"],
  ["3d.png", "3d.png"],
  // last: what the app goes by, so that the rest is there by the time it looks
  ["circuit.json", "circuit.json"],
]

/** How sharp the board's face is drawn in 3D, in pixels to a millimetre, and its bounds. */
const SHARPNESS = 36
const LEAST_TEXTURE = 1024
const MOST_TEXTURE = 4096

/** How often, at the most, how far the build has got is written down, ms. */
const TELLING_MS = 250

const stop = (why) => {
  console.error(why)
  process.exit(1)
}

const args = process.argv.slice(2)
const preview = args.includes("--preview")
const [given, ...rest] = args.filter((one) => one !== "--preview")
if (!given)
  stop("Say which board to build: node board.mjs pcb/<name>.circuit.tsx")
const file = path.resolve(given)
if (!fs.existsSync(file)) stop(`There is no ${given}.`)
const name = path.basename(file).endsWith(ENDING)
  ? path.basename(file).slice(0, -ENDING.length)
  : null
if (!name || !NAME.test(name))
  stop(
    `A board's file is called <name>${ENDING}, its name in lower case letters, figures and hyphens (main${ENDING}): ${path.basename(file)} is not.`
  )

// The board's folder, as it is, but for what was built of it: in a folder of its own
// that is kept from one build to the next, for what tscircuit keeps there of the parts
// it has looked up, and the makers' models fetched (both kept in dot folders).
const folder = path.dirname(file)
const built = path.join(folder, "build")
const work = path.join(
  os.tmpdir(),
  "enclose-boards",
  createHash("sha1").update(folder).digest("hex").slice(0, 12) +
    (preview ? "-preview" : "")
)
const fetched = path.join(work, ".models")
fs.mkdirSync(fetched, { recursive: true })
for (const entry of fs.readdirSync(work))
  if (!entry.startsWith("."))
    fs.rmSync(path.join(work, entry), { recursive: true, force: true })
for (const entry of fs.readdirSync(folder))
  if (entry !== "build" && !entry.startsWith("."))
    fs.cpSync(path.join(folder, entry), path.join(work, entry), {
      recursive: true,
    })
fs.mkdirSync(built, { recursive: true })

/** A file written whole, or not at all: the app may read it the moment it is there. */
function writeWhole(target, write) {
  write(`${target}.part`)
  fs.renameSync(`${target}.part`, target)
}


// How far the build has got, for the app: written as it changes, and gone at the end.
const building = path.join(built, `${name}.building.json`)
const since = Date.now()
let state = { since, at: since, stage: "building" }
let told = 0
let telling = null
function tell(next, now = false) {
  state = { ...state, ...next, at: Date.now() }
  const write = () => {
    telling = null
    told = Date.now()
    writeWhole(building, (to) => fs.writeFileSync(to, JSON.stringify(state)))
  }
  if (now || Date.now() - told >= TELLING_MS) write()
  else telling ??= setTimeout(write, TELLING_MS)
}
function over() {
  clearTimeout(telling)
  // (a preview says nothing of how far it has got: what is there is a real build's)
  if (!preview) {
    fs.rmSync(building, { force: true })
    fs.rmSync(path.join(built, `${name}.routing.json`), { force: true })
  }
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => {
    over()
    process.exit(1)
  })

/**
 * Run tscircuit's command line in the work folder: what it prints goes on to whoever
 * ran this, line by line, and to `each`; or only to `each`, `quiet`. Resolves to how it
 * ended.
 */
function tsci(args, each = () => {}, quiet = false) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["--yes", "-p", TSCIRCUIT, "tsci", ...args], {
      cwd: work,
      stdio: ["ignore", "pipe", "pipe"],
      env: TSCI_ENV,
      shell: process.platform === "win32",
    })
    for (const [stream, to] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      let left = ""
      stream.on("data", (chunk) => {
        if (!quiet) to.write(chunk)
        const lines = (left + chunk).split("\n")
        left = lines.pop() ?? ""
        for (const line of lines) each(line.replace(/\x1b\[[0-9;]*m/g, ""))
      })
    }
    child.on("error", (error) => resolve({ status: null, error }))
    child.on("close", (status) => resolve({ status, error: null }))
  })
}

if (preview) {
  const ran = await tsci([
    "build",
    path.basename(file),
    "--routing-disabled",
    "--ignore-warnings",
    ...rest,
  ])
  // A board half written breaks rules that tscircuit checks it by (pads too near, a
  // footprint it cannot read), and the build says it failed: but it has written the
  // board as far as it could be made, and that is what a preview is for. Only where
  // there is no board at all is there nothing to show. (The work folder is emptied
  // before each build: what is in it is this one's.)
  const circuit = path.join(work, "dist", name, "circuit.json")
  let made = false
  try {
    made = JSON.parse(fs.readFileSync(circuit, "utf8")).some(
      (element) => element?.type === "pcb_board"
    )
  } catch {
    // none written, or not whole
  }
  if (!made) process.exit(1)
  writeWhole(path.join(built, `${name}.preview.json`), (to) =>
    fs.copyFileSync(circuit, to)
  )
  process.exit(0)
}

// What the router is trying, as it routes. tscircuit's command line makes the board with
// the RootCircuit of the tscircuit it finds in the folder it builds in, or else its own:
// so the work folder is given one of its own, which is tscircuit itself but for a
// RootCircuit that also writes down what the router draws of its work as it goes (its
// debug graphics, a few times a second), for the app to draw over the board. Where the
// tscircuit npx keeps cannot be found, there is none, and the board builds as it would.
const routing = path.join(built, `${name}.routing.json`)
fs.rmSync(routing, { force: true })
if (!preview) {
  const real = realTscircuit()
  if (real) {
    // (with a node_modules of its own, the folder is looked in for all that the board
    // imports, React with it, and no longer has it fetched: so it has the rest of what
    // npx keeps beside tscircuit, as links)
    const kept = real.slice(0, real.lastIndexOf(`${path.sep}tscircuit${path.sep}`))
    const modules = path.join(work, "node_modules")
    fs.mkdirSync(modules, { recursive: true })
    for (const entry of fs.readdirSync(kept))
      if (entry !== "tscircuit" && !entry.startsWith("."))
        fs.symlinkSync(path.join(kept, entry), path.join(modules, entry), "junction")
    const own = path.join(modules, "tscircuit")
    fs.mkdirSync(own, { recursive: true })
    fs.writeFileSync(
      path.join(own, "package.json"),
      JSON.stringify({ name: "tscircuit", type: "module", main: "index.mjs" })
    )
    fs.writeFileSync(
      path.join(own, "index.mjs"),
      watchingRouter(pathToFileURL(real).href, routing)
    )
  }
}

/**
 * Where the tscircuit that npx keeps for TSCIRCUIT is, as a file to import: asked of npx
 * once, and kept in the work folder for the builds after. Null where it cannot be found.
 */
function realTscircuit() {
  const kept = path.join(work, ".tscircuit.json")
  try {
    const was = JSON.parse(fs.readFileSync(kept, "utf8"))
    if (was.version === TSCIRCUIT && fs.existsSync(was.entry)) return was.entry
  } catch {
    // not asked yet
  }
  // npx puts the folder of what it runs first on the PATH: tscircuit is beside it
  const find = `const p = require("path"), f = require("fs")
for (const bin of (process.env.PATH ?? "").split(p.delimiter)) {
  const at = p.join(bin, "..", "tscircuit")
  if (!f.existsSync(p.join(at, "package.json"))) continue
  const pkg = JSON.parse(f.readFileSync(p.join(at, "package.json"), "utf8"))
  const dot = pkg.exports?.["."]
  const entry = (typeof dot === "string" ? dot : dot?.import ?? dot?.default) ?? pkg.module ?? pkg.main
  if (entry) { process.stdout.write(p.join(at, entry)); break }
}`
  try {
    const entry = execFileSync("npx", ["--yes", "-p", TSCIRCUIT, "node", "-e", find], {
      cwd: work,
      env: TSCI_ENV,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
    }).trim()
    if (!entry || !fs.existsSync(entry)) return null
    fs.writeFileSync(kept, JSON.stringify({ version: TSCIRCUIT, entry }))
    return entry
  } catch {
    return null
  }
}

/** The folder of packages the tscircuit that npx keeps for TSCIRCUIT is in, or null. */
function modulesOfTscircuit() {
  const entry = realTscircuit()
  if (!entry) return null
  const parts = entry.split(path.sep)
  const at = parts.lastIndexOf("node_modules")
  return at < 0 ? null : parts.slice(0, at + 1).join(path.sep)
}

/**
 * The tscircuit the work folder has: the real one at `real` (a file URL), but for a
 * RootCircuit that writes what the router draws of its work to `file`, as it routes.
 * What it writes is kept small: the lines, boxes and points of it, in millimetres on the
 * board, rounded, and no more than so many of each.
 */
function watchingRouter(real, file) {
  return `// Written by Enclose's kit/board.mjs for this build alone: tscircuit itself, but for a
// RootCircuit that writes down what the router draws of its work as it routes.
import fs from "node:fs"
import { RootCircuit as Root } from ${JSON.stringify(real)}
export * from ${JSON.stringify(real)}

const FILE = ${JSON.stringify(file)}
const EVERY_MS = 400
const MOST = 4000
const r = (n) => Math.round(n * 1000) / 1000
const ok = (n) => typeof n === "number" && Number.isFinite(n)

function picture(event) {
  const g = event.debugGraphics ?? {}
  const lines = []
  for (const line of g.lines ?? []) {
    const points = (line.points ?? []).filter((p) => ok(p?.x) && ok(p?.y))
    if (points.length < 2) continue
    lines.push(points.flatMap((p) => [r(p.x), r(p.y)]))
    if (lines.length >= MOST) break
  }
  const rects = []
  for (const rect of g.rects ?? []) {
    const c = rect.center
    if (!ok(c?.x) || !ok(c?.y) || !ok(rect.width) || !ok(rect.height)) continue
    rects.push([r(c.x), r(c.y), r(rect.width), r(rect.height)])
    if (rects.length >= MOST) break
  }
  const points = []
  for (const point of [...(g.points ?? []), ...(g.circles ?? []).map((c) => c.center)]) {
    if (!ok(point?.x) || !ok(point?.y)) continue
    points.push([r(point.x), r(point.y)])
    if (points.length >= MOST) break
  }
  return {
    at: Date.now(),
    phase: typeof event.phase === "string" ? event.phase : null,
    progress: ok(event.progress) ? event.progress : null,
    lines,
    rects,
    points,
  }
}

export class RootCircuit extends Root {
  constructor(...args) {
    super(...args)
    let last = 0
    this.on?.("autorouting:progress", (event) => {
      const now = Date.now()
      if (now - last < EVERY_MS || !event?.debugGraphics) return
      last = now
      try {
        fs.writeFileSync(FILE + ".part", JSON.stringify(picture(event)))
        fs.renameSync(FILE + ".part", FILE)
      } catch {
        // what the router is at is only shown: the build goes on without it
      }
    })
  }
}
`
}

// What the build says as it goes: how the routing is getting on, and the makers' models
// that could not be put into the board's STEP file.
const unmerged = new Set()
function heard(line) {
  const started = /phase (\d+)\/(\d+) start/.exec(line)
  if (/^Autorouting /.test(line) && started)
    tell({
      stage: "routing",
      phase: Number(started[1]),
      phases: Number(started[2]),
      progress: 0,
      step: null,
    })
  const going = /phase (\d+)\/(\d+) progress:(.*)/.exec(line)
  const share = going && /\bprogress=(\d+(?:\.\d+)?)%/.exec(going[3])
  if (going && share)
    tell({
      stage: "routing",
      phase: Number(going[1]),
      phases: Number(going[2]),
      progress: Number(share[1]) / 100,
      // what the router is at: "topologyPlanningSolver", say
      step: /\bsolver_phase=(\S+)/.exec(going[3])?.[1] ?? null,
    })
  const done = /phase (\d+)\/(\d+) done/.exec(line)
  if (done)
    tell({
      stage: Number(done[1]) < Number(done[2]) ? "routing" : "finishing",
      progress: 1,
      // routed, tscircuit writes the board's files: its STEP, its 3D, its pictures
      task: "files",
    })
  const failed = /Failed to merge STEP model from (https?:\/\/\S+)/.exec(line)
  if (failed) unmerged.add(failed[1].replace(/[.,;:)]+$/, ""))
}

tell({}, true)
try {
  const ran = await tsci(
    [
      "build",
      path.basename(file),
      "--glbs",
      "--step",
      "--pcb-png",
      "--schematic-png",
      "--3d-png",
      // what has it say how the routing is getting on, as it goes
      "--autorouter-debug",
      ...rest,
    ],
    heard
  )
  if (ran.error)
    stop(
      `Could not run npx: ${ran.error.message}. tscircuit needs Node.js 18 or later.`
    )
  if (ran.status !== 0) {
    console.error(
      `\nThe board did not build, so what was built of it before is left as it was.`
    )
    process.exitCode = ran.status ?? 1
  } else await keep()
} finally {
  over()
}

/** What was built, put where the app and the model look for it. */
async function keep() {
  // where it put them: dist/, under the board's file's name
  const out = path.join(work, "dist", name)
  const circuit = path.join(out, "circuit.json")
  if (!fs.existsSync(circuit))
    stop(`tscircuit built the board but wrote no circuit.json in ${out}.`)
  tell({ stage: "finishing", task: "gerbers" }, true)
  unstroked(circuit)

  // the files to have it made from, which the build does not write by itself
  const gerbers = await tsci([
    "export",
    circuit,
    "-f",
    "gerbers",
    "-o",
    path.join(out, "gerbers.zip"),
  ])
  if (gerbers.status !== 0)
    console.error("\nThe Gerbers could not be written; the rest of the board was.")

  const board = JSON.parse(fs.readFileSync(circuit, "utf8"))
  tell({ task: "model" }, true)
  await sharper(board, path.join(out, "3d.glb"))
  tell({ task: "parts" }, true)
  await parts(board)
  tell({ task: "gerbers" }, true)
  if (gerbers.status === 0) await mend(board, path.join(out, "gerbers.zip"))

  const wrote = []
  for (const [from, to] of MADE) {
    const source = path.join(out, from)
    if (!fs.existsSync(source)) continue
    const target = path.join(built, `${name}.${to}`)
    writeWhole(target, (part) => fs.copyFileSync(source, part))
    wrote.push(path.relative(process.cwd(), target))
  }
  console.log(`\nBuilt ${name}:\n${wrote.map((one) => `  ${one}`).join("\n")}`)
  sheeted(board)
  if (gerbers.status !== 0) return
  // a finished board is checked as it would be ordered; a rough one only for its parts,
  // and its lettering
  if (finished()) {
    tell({ task: "checks" }, true)
    await checked()
  }
  else {
    sourcing(board)
    lettering(board)
  }
}

/**
 * Whether the schematic is all on its sheet: tscircuit lays out each section's parts by
 * itself, and says of each part, label and line it has put outside the sheet's frame.
 * A board of many sections outgrows A4.
 */
function sheeted(circuit) {
  const outside = circuit.filter(
    (element) => element.type === "schematic_element_outside_sheet_warning"
  ).length
  if (outside === 0) return
  console.log(
    `\nThe schematic does not fit its sheet: ${outside} of what is in it is drawn outside the sheet's frame. Make the sheet bigger, as the reference says under The schematic.`
  )
}

/** What is wrong with the lettering printed on the board: see board-lettering.mjs. */
function lettering(circuit) {
  const wrong = letteringOf(circuit)
  if (wrong.length === 0) return
  console.log(
    `\nThe lettering on the board, to mend as the reference says under Lettering (and Artwork):\n${wrong.map((one) => `  - ${one}`).join("\n")}`
  )
}

/**
 * The board without the lines tscircuit draws round each piece of artwork it prints
 * (<silkscreengraphic>), for whatever cannot draw the artwork itself: its Gerbers have
 * the artwork, and with those lines as well it would be printed bolder than it is, by a
 * pen as wide as a sixtieth of it. They are known by lying on the artwork's outlines.
 */
function unstroked(file) {
  const circuit = JSON.parse(fs.readFileSync(file, "utf8"))
  const key = (p) => `${p.x.toFixed(6)} ${p.y.toFixed(6)}`
  const outlines = new Set()
  for (const art of circuit) {
    if (art.type !== "pcb_silkscreen_graphic" || !art.brep_shape) continue
    for (const ring of [art.brep_shape.outer_ring, ...(art.brep_shape.inner_rings ?? [])])
      for (const point of ring?.vertices ?? []) outlines.add(key(point))
  }
  if (outlines.size === 0) return
  const kept = circuit.filter(
    (one) =>
      one.type !== "pcb_silkscreen_path" ||
      !(one.route?.length >= 2 && one.route.every((point) => outlines.has(key(point))))
  )
  if (kept.length < circuit.length) fs.writeFileSync(file, JSON.stringify(kept))
}

/** Whether the board says it is finished: one that says nothing of itself is, as the app has it. */
function finished() {
  try {
    const said = JSON.parse(
      fs.readFileSync(path.join(folder, `${name}.board.json`), "utf8")
    )
    return said.finished !== false
  } catch {
    return true
  }
}

/**
 * The BOM and the placement file in the Gerbers' zip mended, as JLCPCB reads them (see
 * board-check.mjs): where they cannot be, they are left as tscircuit wrote them.
 */
async function mend(board, zip) {
  try {
    const { turned, untold } = await mendOrder(board, zip)
    if (turned.length)
      console.log(
        `\nThe placement file turns ${turned.map((one) => `${one.name} to ${one.to}° (tscircuit had ${one.from}°)`).join(", ")}, for JLCPCB's own footprint of each to sit on its pads.`
      )
    if (untold.length && finished())
      console.log(
        `\nThe rotation JLCPCB needs could not be told for ${untold.map((one) => one.name).join(", ")}: see the checks below.`
      )
  } catch (error) {
    console.error(
      `\nThe BOM and the placement file are as tscircuit wrote them: they could not be mended (${error.message}).`
    )
  }
}

/**
 * The checks a board is ordered by, said: see board-check.mjs. And tscircuit's own, of
 * the board as it was just built: no shorts between copper that is not one net, a
 * netlist that is whole, and parts placed clear of each other and of the edge.
 */
async function checked() {
  try {
    const checks = await checkBoard(folder, name)
    const own = []
    let passed = true
    for (const check of ["shorts", "netlist", "placement"]) {
      const lines = []
      const ran = await tsci(
        ["check", check, path.basename(file)],
        (line) => lines.push(line),
        true
      )
      const said = lines.map((line) => line.trim()).filter(Boolean)
      if (ran.status === 0) {
        if (check === "shorts")
          own.push(said.find((line) => /no shorts/i.test(line)) ?? "No shorts.")
        continue
      }
      passed = false
      // what it found: its summary and the issues it numbers, where it has them, and
      // not its counting up of the rest of the board
      const issues = said.filter((line) => /summary:|^\d+\. /.test(line))
      const found = issues.length
        ? issues
        : said.filter((line) => !/^npm |^Could not save autorouting/.test(line))
      own.push(`tsci check ${check}: ${found.slice(0, 8).join(" ") || `ended with ${ran.status}`}`)
    }
    // (before what the assembly costs, which is only for the user to know)
    checks.splice(-1, 0, { title: "tscircuit's checks", passed, lines: own })
    console.log(
      `\n${passedAll(checks) ? "Ready to order" : "Not ready to order"} from JLCPCB:\n\n${said(checks)}`
    )
  } catch (error) {
    console.error(`\nThe board could not be checked for ordering: ${error.message}`)
  }
}

/**
 * Says which parts the BOM in the Gerbers' zip has no JLCPCB part number for, which
 * JLCPCB cannot assemble from it: tscircuit gives one by itself to many resistors and
 * capacitors, and to the rest only where the board says. It goes by the rule tscircuit's
 * BOM is written by, as the app does to warn the user (unsourcedOf, in
 * shared/board-format.ts): every part placed, but for test points and bare holes.
 */
function sourcing(circuit) {
  const MODELS = ["obj", "stl", "3mf", "gltf", "glb", "step", "wrl"]
    .map((kind) => `model_${kind}_url`)
    .concat("model_jscad")
  const numbered = (numbers) =>
    Array.isArray(numbers) && numbers.some((one) => String(one).trim())
  const sources = new Map(
    circuit
      .filter((one) => one.type === "source_component")
      .map((one) => [one.source_component_id, one])
  )
  const bareHole = (source, placed) => {
    const mine = (one) => one.pcb_component_id === placed.pcb_component_id
    if (
      source.ftype !== "simple_chip" ||
      source.manufacturer_part_number?.trim()
    )
      return false
    if (Object.values(source.supplier_part_numbers ?? {}).some(numbered))
      return false
    if (
      circuit.some(
        (one) =>
          one.type === "cad_component" &&
          mine(one) &&
          MODELS.some((model) => one[model])
      )
    )
      return false
    const shape = circuit.filter(
      (one) =>
        ["pcb_plated_hole", "pcb_hole", "pcb_smtpad"].includes(one.type) &&
        mine(one)
    )
    return shape.length === 1 && shape[0].type !== "pcb_smtpad"
  }
  const unsourced = new Set()
  for (const placed of circuit) {
    if (placed.type !== "pcb_component" || placed.do_not_place) continue
    const source = sources.get(placed.source_component_id)
    if (!source || source.ftype === "simple_test_point") continue
    const suppliers = source.supplier_part_numbers ?? {}
    if (numbered(suppliers.jlcpcb) || numbered(suppliers.lcsc)) continue
    if (bareHole(source, placed)) continue
    unsourced.add(source.name || placed.pcb_component_id)
  }
  if (unsourced.size === 0) return
  const parts = [...unsourced].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true })
  )
  console.log(
    `\nThe BOM has no JLCPCB part number for ${parts.join(", ")}. Give each one (supplierPartNumbers={{ jlcpcb: ["C…"] }}), of a part JLCPCB has in stock, before the board is finished.`
  )
}

/**
 * The board in 3D made again, with its face (its copper, print and mask, which are one
 * picture) drawn sharper than tscircuit draws it, 1024 pixels across whatever the size
 * of the board: as sharp as SHARPNESS has it, within what a screen's memory takes well.
 * It is made with what tscircuit makes it with, at the version it builds with; where
 * that cannot be had, the board in 3D is as tscircuit made it.
 */
async function sharper(board, glb) {
  try {
    // where npx keeps the tscircuit it builds with, and so what that makes 3D with (not
    // the tsci first on the PATH, which can be one installed for the whole Mac)
    const modules = modulesOfTscircuit()
    if (!modules) throw new Error("the tscircuit it builds with could not be found")
    const { convertCircuitJsonToGltf } = await import(
      pathToFileURL(path.join(modules, "circuit-json-to-gltf", "dist", "index.js")).href
    )
    const widest = board
      .filter((one) => one.type === "pcb_board")
      .map((one) => Math.max(one.width ?? 0, one.height ?? 0))
      .reduce((most, one) => Math.max(most, one), 0)
    const resolution = Math.min(
      MOST_TEXTURE,
      Math.max(LEAST_TEXTURE, Math.ceil(widest * SHARPNESS))
    )
    const made = await convertCircuitJsonToGltf(board, {
      format: "glb",
      boardTextureResolution: resolution,
    })
    writeWhole(glb, (to) => fs.writeFileSync(to, Buffer.from(made)))
  } catch (error) {
    console.error(
      `The board in 3D is as tscircuit made it: it could not be drawn sharper (${error.message}).`
    )
  }
}

/**
 * The parts whose makers' 3D models tscircuit could not put into the board's STEP file,
 * fetched, with where each goes on the board: a model is turned and moved as the board's
 * layout says, from where the maker has its middle (`origin`), in the board's frame:
 * its middle at the origin, its top at half its thickness, Z up.
 */
async function parts(circuit) {
  const names = new Map(
    circuit
      .filter((one) => one.type === "source_component")
      .map((one) => [one.source_component_id, one.name])
  )
  const layers = new Map(
    circuit
      .filter((one) => one.type === "pcb_component")
      .map((one) => [one.pcb_component_id, one.layer])
  )
  const listed = path.join(built, `${name}.parts.json`)
  const models = path.join(built, `${name}.parts`)
  fs.rmSync(models, { recursive: true, force: true })
  const kept = []
  for (const one of circuit) {
    if (one.type !== "cad_component" || !one.model_step_url) continue
    if (!unmerged.has(one.model_step_url)) continue
    const called = names.get(one.source_component_id) ?? one.cad_component_id
    const cached = path.join(
      fetched,
      `${createHash("sha1").update(one.model_step_url).digest("hex").slice(0, 16)}.step`
    )
    try {
      if (!fs.existsSync(cached)) {
        const response = await fetch(one.model_step_url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const model = Buffer.from(await response.arrayBuffer())
        writeWhole(cached, (to) => fs.writeFileSync(to, model))
      }
    } catch (error) {
      console.error(`The 3D model of ${called} could not be fetched: ${error.message}`)
      continue
    }
    fs.mkdirSync(models, { recursive: true })
    const model = `${called.replace(/[^A-Za-z0-9_-]+/g, "_")}.step`
    fs.copyFileSync(cached, path.join(models, model))
    const xyz = (v) => [v?.x ?? 0, v?.y ?? 0, v?.z ?? 0]
    kept.push({
      name: called,
      file: `${name}.parts/${model}`,
      at: xyz(one.position),
      turn: xyz(one.rotation),
      origin: xyz(one.model_origin_position),
      layer: layers.get(one.pcb_component_id) ?? "top",
    })
  }
  if (kept.length === 0) return fs.rmSync(listed, { force: true })
  writeWhole(listed, (to) =>
    fs.writeFileSync(to, JSON.stringify({ parts: kept }, null, 2))
  )
  console.log(
    `\nThe makers' 3D models of ${kept.map((one) => one.name).join(", ")} are beside the board, in ${path.relative(process.cwd(), listed)}.`
  )
}
