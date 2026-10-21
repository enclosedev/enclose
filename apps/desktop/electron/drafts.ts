// The model as an agent writes it. While an agent is at work in a project, each time it
// saves one of the scripts at the top of the project's folder the app builds the model
// again by itself, into a folder of its own (kit/enclose.py writes there when
// ENCLOSE_DRAFT names it, and quickly: with no STEP files), and the view shows that, so
// that the model is seen changing as the agent writes it and not only when it builds it.
// A draft is shown only while it is newer than the project's own build, and only while
// the agent is at work: then it is put away, and the project's own build is what is seen.
// A project whose enclose.py is an older copy, which knows nothing of drafts and would
// write its own build/ instead, has none.
//
// The build is the project's command, from its enclose.json, run through a shell: which
// the agent can write as well as model.py. One that runs a Python file of the project's
// is run as it is; any other only where the turn may (threads.ts `mayBuild`): in Full
// access, or where it is what the project had when the turn began, or once the user has
// said yes to it.
import fs from "node:fs"
import path from "node:path"

import { runBuild } from "./imports"

/** How long a script is let be after it was written before the model is built, ms. */
const SETTLE_MS = 1000
/** what kit/enclose.py is told the folder to write a draft to by */
const DRAFT = "ENCLOSE_DRAFT"
/** what kit/enclose.py writes, last of all */
const MANIFEST = "enclose.model.json"

export type DraftsDeps = {
  /** where drafts are written: a folder to each project */
  folder: string
  /** the projects there are */
  ids: () => string[]
  /** a project's folder, the command its model is built with, and its own manifest */
  project: (projectId: string) => {
    path: string
    build: string | null
    manifest: string | null
  } | null
  /** whether an agent is at work in a project now */
  working: (projectId: string) => boolean
  /** whether a draft may be built with a command that does more than run a Python file */
  mayBuild: (projectId: string, command: string) => Promise<boolean>
  /** what a build is run with */
  env: () => NodeJS.ProcessEnv
  /** a draft was made to be shown, or one that was shown was put away */
  onChange: () => void
}

/**
 * Whether a build command runs a Python file of the project's, and no more: a Python by
 * name, or one within the project (its own .venv, say), and a script within it.
 */
export function runsPython(command: string): boolean {
  const words = command.trim().split(/ +/)
  if (words.length !== 2) return false
  const [python, script] = words
  // a path within the project, with nothing in it a shell would make more of
  const within = (file: string) =>
    /^[\w.][\w.-]*(\/[\w.-]+)*$/.test(file) && !file.split("/").includes("..")
  return (
    within(python) &&
    /^python(3(\.\d+)?)?$/.test(path.posix.basename(python)) &&
    within(script) &&
    script.endsWith(".py")
  )
}

export class Drafts {
  private readonly deps: DraftsDeps
  /** by project: its folder watched, what waits for a script to settle, what is building */
  private watchers = new Map<string, fs.FSWatcher>()
  private timers = new Map<string, NodeJS.Timeout>()
  private running = new Map<string, () => void>()
  /** a script written again while a draft was being made: to be made again after */
  private again = new Set<string>()
  /** each project's latest draft: the folder it is in, and when its build began */
  private made = new Map<string, { dir: string; began: number }>()
  /** goes up each time a project's draft is shown or put away, so the view loads again */
  private stamps = new Map<string, number>()
  private count = 0

  constructor(deps: DraftsDeps) {
    this.deps = deps
    // (what a run of the app that ended unawares left)
    fs.rmSync(deps.folder, { recursive: true, force: true })
  }

  /**
   * Look again at where an agent is at work: watch those projects' folders, and stop
   * watching the others, putting their drafts away.
   */
  sync() {
    const ids = new Set(this.deps.ids())
    for (const id of ids) {
      if (this.deps.working(id)) this.watch(id)
      else this.stop(id)
    }
    for (const id of [...this.watchers.keys(), ...this.made.keys()])
      if (!ids.has(id)) this.stop(id)
  }

  /**
   * The manifest of the draft of a project's model to show in place of its own: where
   * there is one, an agent is at work, and the draft is newer than the project's build.
   */
  shown(projectId: string): string | null {
    return this.deps.working(projectId) ? this.newer(projectId) : null
  }

  /** The manifest of a project's draft, where it is newer than the project's build. */
  private newer(projectId: string): string | null {
    const made = this.made.get(projectId)
    const manifest = this.deps.project(projectId)?.manifest
    if (!made || !manifest) return null
    try {
      if (fs.statSync(manifest).mtimeMs >= made.began) return null
    } catch {
      return null
    }
    return path.join(made.dir, MANIFEST)
  }

  /** A number that goes up each time a project's draft is shown or put away. */
  stamp(projectId: string): number {
    return this.stamps.get(projectId) ?? 0
  }

  private watch(id: string) {
    const root = this.deps.project(id)?.path
    if (this.watchers.has(id) || !root) return
    try {
      this.watchers.set(
        id,
        fs.watch(root, { persistent: false }, (_, name) => {
          if (!name || !(name.endsWith(".py") || name === "enclose.json"))
            return
          clearTimeout(this.timers.get(id))
          this.timers.set(
            id,
            setTimeout(() => {
              this.timers.delete(id)
              this.make(id)
            }, SETTLE_MS)
          )
        })
      )
    } catch {
      // unwatchable (a network drive, say): the model shows when the agent builds it
    }
  }

  private make(id: string) {
    if (this.running.has(id)) {
      this.again.add(id)
      return
    }
    const project = this.deps.project(id)
    if (!project?.build || !project.manifest || !this.deps.working(id)) return
    // an older copy of the exporter would write the project's own build/
    try {
      const kit = fs.readFileSync(path.join(project.path, "enclose.py"), "utf8")
      if (!kit.includes(DRAFT)) return
    } catch {
      return
    }
    const { build } = project
    if (runsPython(build)) return this.build(id, project.path, build)
    void this.deps.mayBuild(id, build).then((may) => {
      if (may && this.deps.working(id) && !this.running.has(id))
        this.build(id, project.path, build)
    })
  }

  private build(id: string, root: string, command: string) {
    // a folder to each draft, so that the one shown is never written over
    const dir = path.join(this.deps.folder, id, String(++this.count))
    fs.mkdirSync(dir, { recursive: true })
    const began = Date.now()
    const build = runBuild(
      root,
      command,
      // (and nothing of it in the project's folder, not even Python's cache)
      { ...this.deps.env(), [DRAFT]: dir, PYTHONDONTWRITEBYTECODE: "1" },
      () => {}
    )
    this.running.set(id, build.stop)
    void build.finished.then((failed) => {
      // stopped: the agent is no longer at work, and what was made is put away
      if (this.running.get(id) !== build.stop) return
      this.running.delete(id)
      // (a script half written does not build: the agent will see to that itself)
      if (!failed && fs.existsSync(path.join(dir, MANIFEST))) {
        const before = this.made.get(id)
        this.made.set(id, { dir, began })
        if (before) fs.rmSync(before.dir, { recursive: true, force: true })
        if (this.shown(id)) this.changed(id)
      } else fs.rmSync(dir, { recursive: true, force: true })
      if (this.again.delete(id)) this.make(id)
    })
  }

  /** Stop watching a project, and put away whatever draft it has. */
  private stop(id: string) {
    const showing = this.newer(id) !== null
    this.watchers.get(id)?.close()
    this.watchers.delete(id)
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    const stop = this.running.get(id)
    this.running.delete(id)
    stop?.()
    this.again.delete(id)
    if (this.made.delete(id) || stop)
      fs.rmSync(path.join(this.deps.folder, id), {
        recursive: true,
        force: true,
      })
    if (showing) this.changed(id)
  }

  private changed(id: string) {
    this.stamps.set(id, this.stamp(id) + 1)
    this.deps.onChange()
  }

  close() {
    for (const watcher of this.watchers.values()) watcher.close()
    for (const timer of this.timers.values()) clearTimeout(timer)
    for (const stop of this.running.values()) stop()
    this.watchers.clear()
    this.timers.clear()
    this.running.clear()
    fs.rmSync(this.deps.folder, { recursive: true, force: true })
  }
}
