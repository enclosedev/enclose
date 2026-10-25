// Sees that a project's tool is shut in, in the app itself: `npm run sandbox`.
//
// A tool is code that came with a project's folder, and is run without being read (see
// src/lib/custom-tools/runner.ts). What keeps it from the network is the worker it is
// run in, with the ways out of it taken away, and the window's policy: and neither can
// be seen to hold but in the app, as it is built. So this makes a project with one tool
// in it that tries every way out it knows (scripts/sandbox/tool.js), each at a
// listening post on this machine; runs the app on that project, with no one at it; and
// then goes by two things. What the post heard, which is to be nothing. And what the
// tool says came of each try, which is to be that it was refused.
//
//   npm run build && npm run sandbox     the built app, which is what is given out
//   npm run sandbox -- --dev             the app as it is served while it is worked on
//
// The two make the tool's worker differently, so a change to how tools are run, or to
// the window's policy (shared/content-policy.ts), is worth both.
import { spawn } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"

const HERE = import.meta.dirname
const APP = path.join(HERE, "..")
/** The project the tool is put in: one of the app's examples, which has a model built. */
const EXAMPLE = path.join(APP, "../../examples/stool")
/** How long the app is given to come up, run the tool and say what it said, in ms. */
const WITHIN = 150_000

const dev = process.argv.includes("--dev")
if (!dev && !fs.existsSync(path.join(APP, "dist/index.html"))) {
  console.error(
    "There is no built app to try: run `npm run build` first, or `npm run sandbox -- --dev`."
  )
  process.exit(1)
}

// The listening post: it answers whatever asks, as a server that wanted to be reached
// would, and keeps what asked.
const heard = []
const post = http.createServer((request, response) => {
  heard.push(`${request.method} ${request.url}`)
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-type": "text/javascript",
  })
  response.end("export default 1")
})
// (a socket that asks to be something other than HTTP has got through all the same)
post.on("upgrade", (request, socket) => {
  heard.push(`UPGRADE ${request.url}`)
  socket.destroy()
})
await new Promise((resolve) => post.listen(0, "127.0.0.1", resolve))
const address = `127.0.0.1:${post.address().port}`
// (it is seen to hear, before anything is made of its hearing nothing)
await fetch(`http://${address}/are-you-there`)
if (heard.length !== 1) {
  console.error("The listening post does not hear: there is nothing to go by.")
  process.exit(1)
}
heard.length = 0

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-sandbox-"))
const project = path.join(scratch, "stool")
fs.cpSync(EXAMPLE, project, { recursive: true })
fs.mkdirSync(path.join(project, "tools"), { recursive: true })
fs.writeFileSync(
  path.join(project, "tools/escape.js"),
  fs
    .readFileSync(path.join(HERE, "sandbox/tool.js"), "utf8")
    .replaceAll("__POST__", address)
)

/** Run the app on the project with no one at it, and give back what the window's script said. */
function ask() {
  // A terminal inside an Electron-based editor can carry this, and it would make our
  // Electron start as plain Node instead of as an app.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env
  const app = spawn(
    process.execPath,
    [
      path.join(HERE, dev ? "dev.mjs" : "start.mjs"),
      project,
      `--capture=${path.join(scratch, "window.png")}`,
      `--script=${path.join(HERE, "sandbox/ask.js")}`,
      "--wait=1500",
      // On a Mac, the key the app seals what it keeps with is in the login keychain, and
      // a new Electron is asked for leave to read it: the check would wait on a dialog.
      "--use-mock-keychain",
      // A machine in CI has no graphics card, and Chromium draws no WebGL without one
      // unless told to draw it in software: without it the model never shows, and the
      // project's tools never come up to be tried.
      ...(process.env.CI
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        : []),
    ],
    {
      cwd: APP,
      // (its own state, and none of the real one: the app that is in use is left alone)
      env: { ...env, ENCLOSE_USER_DATA: path.join(scratch, "data") },
    }
  )
  let printed = ""
  app.stdout.on("data", (data) => (printed += data))
  app.stderr.on("data", (data) => (printed += data))
  return new Promise((resolve) => {
    const late = setTimeout(() => app.kill(), WITHIN)
    app.once("exit", () => {
      clearTimeout(late)
      const said = /^\[script\] (.+)$/m.exec(printed)?.[1]
      try {
        resolve(
          said ? JSON.parse(said) : { failed: printed.trim().slice(-800) }
        )
      } catch {
        resolve({ failed: said })
      }
    })
  })
}

const found = await ask()
post.close()
post.closeAllConnections()
// The app can leave something going in its folder that is still at it once the app is
// gone, its Python being made there say, and adding files as they are taken away: what
// cannot be, after a while of trying, is left for the system to clear, as it says
// nothing of the tool.
try {
  fs.rmSync(scratch, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  })
} catch {
  console.log(`(${scratch} is left: something was still writing into it)`)
}

const wrong = []
if (!found || found.failed || !found.tried || !found.there || !found.could)
  wrong.push(
    `The tool was not heard from, so nothing is known: ${found?.failed ?? JSON.stringify(found)}`
  )
else {
  for (const one of heard) wrong.push(`Reached the listening post: ${one}`)
  for (const one of found.there) wrong.push(`Still to be had by a tool: ${one}`)
  for (const [way, came] of Object.entries(found.tried))
    if (!came.startsWith("refused")) wrong.push(`Not refused: ${way}: ${came}`)
  // these are tried whatever is there to be had: one that is missing was never tried
  for (const way of [
    "import from an address",
    "eval",
    "new Function",
    "a timer given words to run",
  ])
    if (!(way in found.tried)) wrong.push(`Never tried: ${way}`)
  for (const [what, came] of Object.entries(found.could))
    if (came !== "allowed")
      wrong.push(
        `A tool could not ${what} (${came}): if it cannot do what it is let do, its being refused the rest says nothing.`
      )
  if (Object.keys(found.could).length === 0)
    wrong.push(
      "Nothing a tool is let do was tried: the trying is not known to work."
    )
}

console.log(
  `A tool that tries to get out, in the ${dev ? "app as it is served" : "built app"}:`
)
for (const [way, came] of Object.entries(found?.tried ?? {}))
  console.log(`  ${way}: ${came}`)
for (const [what, came] of Object.entries(found?.could ?? {}))
  console.log(`  ${what}: ${came}`)
console.log(
  `  heard at the listening post: ${heard.length === 0 ? "nothing" : heard.join(", ")}`
)
if (wrong.length === 0) console.log("It is shut in.")
else {
  console.error(
    `\nIt is not shut in:\n${wrong.map((one) => `  - ${one}`).join("\n")}`
  )
  process.exitCode = 1
}
