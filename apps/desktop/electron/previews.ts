// A quick look at a circuit board as it is being written. While an agent is at work in a
// project, each time it writes one of the project's boards the app builds it again by
// itself, unrouted and with nothing else made of it (kit/board.mjs --preview), so that
// the board is seen coming together in PCB mode as the agent writes it, and not only
// when it builds it. A board that is being built for real is left to that.
import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { BOARD_FOLDER, builtOf, readBuilding } from "../shared/board-format"

/** How long a board's file is let be after it was written before it is looked at, ms. */
const SETTLE_MS = 800

export type PreviewsDeps = {
  /** the app's script that builds boards */
  script: string
  /** whether an agent is at work in a project now */
  working: (projectId: string) => boolean
}

export class Previews {
  private readonly deps: PreviewsDeps
  /** by project and board: what waits for the file to settle, and what is building */
  private timers = new Map<string, NodeJS.Timeout>()
  private running = new Map<string, ChildProcess>()
  /** written again while a preview of it was being made: to be made again after */
  private again = new Set<string>()
  /** there is no Node.js to build with: nothing is tried again this run of the app */
  private none = false

  constructor(deps: PreviewsDeps) {
    this.deps = deps
  }

  /** One of a project's boards has just been written, in its folder `root`. */
  written(projectId: string, root: string, board: string) {
    if (this.none || !this.deps.working(projectId)) return
    const key = `${projectId}:${board}`
    clearTimeout(this.timers.get(key))
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key)
        this.make(key, projectId, root, board)
      }, SETTLE_MS)
    )
  }

  private make(key: string, projectId: string, root: string, board: string) {
    if (this.running.has(key)) {
      this.again.add(key)
      return
    }
    try {
      const building = path.join(root, BOARD_FOLDER, builtOf(board).building)
      if (
        readBuilding(JSON.parse(fs.readFileSync(building, "utf8")), Date.now())
      )
        return
    } catch {
      // nothing being built
    }
    const child = spawn(
      "node",
      [
        this.deps.script,
        path.join(BOARD_FOLDER, `${board}.circuit.tsx`),
        "--preview",
      ],
      { cwd: root, stdio: "ignore" }
    )
    this.running.set(key, child)
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") this.none = true
    })
    child.on("close", () => {
      this.running.delete(key)
      if (this.again.delete(key) && this.deps.working(projectId))
        this.make(key, projectId, root, board)
    })
  }

  close() {
    for (const timer of this.timers.values()) clearTimeout(timer)
    for (const child of this.running.values()) child.kill()
    this.timers.clear()
    this.running.clear()
  }
}
