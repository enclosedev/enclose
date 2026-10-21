// The dev loop: Vite serves the window with hot reload, esbuild rebuilds the Electron
// side on save, and Electron is restarted whenever that side changes.
//   npm run dev                 open the app
//   npm run dev -- <folder>     ...with that folder added as a project
import { spawn } from "node:child_process"
import path from "node:path"

import { context } from "esbuild"
import { createServer } from "vite"

import { guide, main, preload } from "./electron-build.mjs"
import { namedElectron } from "./electron-name.mjs"

const electron = namedElectron()

// A run with somewhere else to keep its state (ENCLOSE_USER_DATA, see electron/main.ts)
// keeps Vite's copies of the packages there as well. Otherwise they are made again in
// the folder every dev loop shares, whenever two are run differently: under the feet of
// one that is serving its window from them.
const elsewhere = process.env.ENCLOSE_USER_DATA
const server = await createServer(
  elsewhere ? { cacheDir: path.join(elsewhere, "vite") } : {}
)
await server.listen()
const url = server.resolvedUrls.local[0]

let app = null
let restarting = false

// A terminal inside an Electron-based editor can carry this, and it would make our
// Electron start as plain Node instead of as an app.
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env

function start() {
  app = spawn(electron, [".", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...env, VITE_DEV_SERVER_URL: url },
  })
  app.once("exit", (code) => {
    if (restarting) return
    // the window was closed, or a one-shot run (--capture) finished: the session is over
    void server.close().then(() => process.exit(code ?? 0))
  })
}

function restart() {
  if (!app) return start()
  // One restart at a time. A second asked for while the first is under way would start
  // a second app, which finds the first holding the single-instance lock and quits - and
  // an app that quits is taken for the window being closed, which ends the session.
  if (restarting) return
  restarting = true
  app.once("exit", () => {
    restarting = false
    start()
  })
  app.kill()
}

// several files saved together are several builds: wait for them to stop arriving
let soon = null
function restartSoon() {
  clearTimeout(soon)
  soon = setTimeout(restart, 150)
}

// both bundles report in after every build; start once both are there, restart after that
let built = 0
const relaunch = {
  name: "relaunch",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return
      if (++built >= 2) restartSoon()
    })
  },
}

for (const options of [main, preload]) {
  const bundle = await context({ ...options, plugins: [relaunch] })
  await bundle.watch()
}

// The page of an assembly guide is read from disk each time one is opened: built again
// on save, it is there the next time, and nothing has to be restarted for it.
await (await context(guide)).watch()

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restarting = true
    app?.kill()
    void server.close().then(() => process.exit(0))
  })
}
