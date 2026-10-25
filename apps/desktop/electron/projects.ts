// The folders the user has added, where each one's model is, and what branch it is on.
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type { BringingIn, ConversationSummary, Project } from "../shared/api"
import { CONFIG_NAMES, MANIFEST_NAMES } from "../shared/manifest-format"
import { findReference } from "./reference"
import { findTools } from "./custom-tools"
import { findGuides } from "./assembly"
import { boardsWritten } from "./boards"
import { ASSEMBLY_FOLDER } from "../shared/assembly-format"
import { missing, setAside, writeWhole } from "./atomic"
import { markedManaged } from "./backup"
import { isInside } from "./turn"
import {
  BOARD_FOLDER,
  BOARD_SOURCE,
  BUILT_FOLDER,
} from "../shared/board-format"
import { TOOLS_FOLDER } from "../shared/tool-format"
import {
  COLOURS_FILE,
  coloursFile,
  readColours,
  type PartColours,
} from "../shared/colours-format"

type Saved = {
  id: string
  path: string
  /** what the user called it, for a project made here; otherwise the folder's name serves */
  name?: string
  /** the app made this folder itself, rather than being pointed at one that was there */
  made?: boolean
  /**
   * The app set this folder's repository up itself, and keeps its history (backups.ts).
   * Only this says so: never what the repository says of itself.
   */
  kept?: boolean
  /**
   * What the user said of the settings for Claude Code the folder has of its own (see
   * `ownSettings`), asked once: true, the agent goes by them; false, it never does. Not
   * asked yet, it does not. A folder the app made goes by its own without asking.
   */
  trusted?: boolean
  /** `name` is a stand-in, until what is being made gives the project a name of its own */
  standIn?: boolean
  /**
   * Made of CAD files that Claude has yet to look over, to name and group what is in
   * them: what the app wrote its model.py from, which is what it is written from again
   * with those names in it.
   */
  lookOver?: Written
  addedAt: number
  /**
   * From when a project had one conversation: the Claude Code session that carried it on.
   * That conversation takes it with it when it is moved in with the others.
   */
  sessionId?: string | null
  /** from when a project taken off the list was remembered: such a one is now forgotten */
  closed?: boolean
  /** when the user pinned it to the top of the list, if they have */
  pinned?: number
}

/**
 * The projects in the order they are listed: those pinned first, the one pinned last at
 * the top; then the rest, the one added last first.
 */
function listOrder(saved: Saved[]): Saved[] {
  const latest = [...saved].reverse()
  return [
    ...latest
      .filter((p) => p.pinned !== undefined)
      .sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0)),
    ...latest.filter((p) => p.pinned === undefined),
  ]
}

/** Whether what was kept of a project reads as one: it says what it goes by, and where. */
const readsAsProject = (given: unknown): given is Saved =>
  typeof (given as Saved | null)?.id === "string" &&
  typeof (given as Saved).path === "string"

/** The most letters a project's name can have. */
const NAME_LENGTH = 80

/** What a project's model.py was written from: the model's title, and the files it reads. */
export type Written = { title: string; files: string[] }

type Found = {
  /** absolute path of the manifest */
  manifest: string | null
  /** how the project says it is built, from its enclose.json */
  build: string | null
}

/** Folders never looked into: what is installed or built there is none of the project's. */
export const SKIP = new Set([
  "node_modules",
  "venv",
  "__pycache__",
  "dist",
  "target",
])

/**
 * Delete a folder if there is nothing in it, which is the only way this app deletes one.
 * (The Finder leaves a note of its own in any folder it has shown: that does not count.)
 */
function removeIfEmpty(dir: string): boolean {
  try {
    const inside = fs.readdirSync(dir)
    if (inside.some((name) => name !== ".DS_Store")) return false
    for (const name of inside) fs.unlinkSync(path.join(dir, name))
    fs.rmdirSync(dir)
    return true
  } catch {
    return false
  }
}

/**
 * What a new project's folder is called: when it was made, to the minute, then its name
 * in lower case with dashes, as in 2026-10-05-2336-pill-box. The date comes first so
 * that the folders sort in the order they were made.
 */
export function folderName(name: string, made: Date): string {
  const two = (n: number) => String(n).padStart(2, "0")
  const when = [
    made.getFullYear(),
    two(made.getMonth() + 1),
    two(made.getDate()),
    two(made.getHours()) + two(made.getMinutes()),
  ].join("-")
  const slug = name
    // accents come off their letters, so that "café" is "cafe"
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
  return `${when}-${slug || "untitled"}`
}

/**
 * Make a folder by this name in another, and return where it is. Where the name is
 * taken it is numbered, as happens when the same one comes up twice in a minute.
 */
export function makeFolder(parent: string, base: string): string {
  for (let n = 1; ; n++) {
    const dir = path.join(parent, n === 1 ? base : `${base}-${n}`)
    if (fs.existsSync(dir)) continue
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }
}

/**
 * How much room a folder takes, in bytes: every file in it, however deep. A link counts
 * as itself, not as what it points at. Nothing, for a folder that is not there.
 */
export async function folderSize(folder: string): Promise<number> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(folder, { withFileTypes: true })
  } catch {
    return 0
  }
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const one = path.join(folder, entry.name)
      if (entry.isDirectory()) return folderSize(one)
      try {
        return (await fs.promises.lstat(one)).size
      } catch {
        // gone since it was listed
        return 0
      }
    })
  )
  return sizes.reduce((sum, size) => sum + size, 0)
}

const MAX_DEPTH = 6
const MAX_FOLDERS = 4000
const MAX_MANIFEST_BYTES = 5_000_000

/**
 * What was found of each file looked at for a manifest: how big it was and when it was
 * written, and whether it was one. A model is looked for again after every step an
 * agent takes, and its manifest can run to megabytes: one that is as it was is not read
 * again. (The latest MANIFESTS_KEPT, the one looked at longest ago let go first.)
 */
const manifests = new Map<
  string,
  { size: number; mtimeMs: number; is: boolean }
>()
const MANIFESTS_KEPT = 256

function isManifest(file: string): boolean {
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch {
    return false
  }
  const { size, mtimeMs } = stat
  const had = manifests.get(file)
  manifests.delete(file)
  const is =
    had && had.size === size && had.mtimeMs === mtimeMs
      ? had.is
      : readsAsManifest(file, size)
  manifests.set(file, { size, mtimeMs, is })
  if (manifests.size > MANIFESTS_KEPT)
    manifests.delete(manifests.keys().next().value!)
  return is
}

function readsAsManifest(file: string, size: number): boolean {
  try {
    if (size > MAX_MANIFEST_BYTES) return false
    const json: unknown = JSON.parse(fs.readFileSync(file, "utf8"))
    const parts = (json as { parts?: unknown }).parts
    return (
      Array.isArray(parts) &&
      parts.length > 0 &&
      typeof (parts[0] as { file?: unknown }).file === "string"
    )
  } catch {
    return false
  }
}

/**
 * Where a folder keeps its model. An enclose.json at the top can say so outright
 * ({ "model": "path/to/manifest.json", "build": "python3 make.py" }); otherwise the
 * nearest manifest wins, searching level by level.
 */
export function findModel(root: string): Found {
  let build: string | null = null
  for (const name of CONFIG_NAMES) {
    try {
      const config = JSON.parse(
        fs.readFileSync(path.join(root, name), "utf8")
      ) as {
        model?: unknown
        build?: unknown
      }
      if (typeof config.build === "string") build = config.build
      if (typeof config.model === "string") {
        const file = path.resolve(root, config.model)
        if (isManifest(file)) return { manifest: file, build }
      }
      break
    } catch {
      // no config by this name, or not valid JSON: try the next, then the search
    }
  }

  let level = [root]
  let seen = 0
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth++) {
    const next: string[] = []
    for (const dir of level) {
      if (++seen > MAX_FOLDERS) return { manifest: null, build }
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const name of MANIFEST_NAMES) {
        const file = path.join(dir, name)
        if (
          entries.some((e) => e.isFile() && e.name === name) &&
          isManifest(file)
        ) {
          return { manifest: file, build }
        }
      }
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !SKIP.has(entry.name)
        ) {
          next.push(path.join(dir, entry.name))
        }
      }
    }
    level = next
  }
  return { manifest: null, build }
}

/** The branch checked out in the repository this folder is part of, if it is in one. */
export function readBranch(dir: string): string | null {
  let at = dir
  for (;;) {
    const dot = path.join(at, ".git")
    try {
      // a worktree or submodule has a .git file pointing at the real directory
      const gitDir = fs.statSync(dot).isDirectory()
        ? dot
        : path.resolve(
            at,
            /^gitdir: (.+)$/m.exec(fs.readFileSync(dot, "utf8"))?.[1] ?? ""
          )
      const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim()
      return /^ref: refs\/heads\/(.+)$/.exec(head)?.[1] ?? head.slice(0, 7)
    } catch {
      // no repository at this level
    }
    const up = path.dirname(at)
    if (up === at) return null
    at = up
  }
}

/**
 * The files of settings for Claude Code a folder has of its own: what can have it run
 * commands with no asking (hooks, servers of tools, what it is let do), which are the
 * folder's to say only where the user trusts it.
 */
export const OWN_SETTINGS = [
  path.join(".claude", "settings.json"),
  path.join(".claude", "settings.local.json"),
  ".mcp.json",
]

/** Whether a folder has settings for Claude Code of its own. */
export const ownSettings = (dir: string) =>
  OWN_SETTINGS.some((file) => fs.existsSync(path.join(dir, file)))

/** Take a folder's own settings for Claude Code out of it, leaving the rest of `.claude`. */
export const dropOwnSettings = (dir: string) => {
  for (const file of OWN_SETTINGS)
    fs.rmSync(path.join(dir, file), { force: true })
}

/** Whether the app made a project's folder (from before `made` was kept: by its name). */
const madeHere = (project: Saved) => project.made ?? project.name !== undefined

/**
 * `file` as a path inside `root`, or null if it would land outside: by what the path
 * says, and by where it really is, so that a link in the folder that leads out of it
 * leads nowhere here.
 */
export function resolveInside(root: string, file: string): string | null {
  const full = path.resolve(root, `.${path.sep}${file}`)
  const inside =
    full === root ||
    full.startsWith(root.endsWith(path.sep) ? root : root + path.sep)
  return inside && isInside(root, full) ? full : null
}

export class Projects {
  private readonly file: string
  private readonly onChange: () => void
  private saved: Saved[] = []
  private found = new Map<string, Found>()
  private revisions = new Map<string, number>()
  /**
   * Where each project keeps a reference scene of its own, if it has one; how often it
   * has been found rewritten; and what watches it. All by project.
   */
  private scenes = new Map<string, string>()
  private sceneRevisions = new Map<string, number>()
  private sceneWatchers = new Map<string, fs.FSWatcher>()
  private sceneTimers = new Map<string, NodeJS.Timeout>()
  /**
   * The tools each project has of its own, as they were last found: which files, and
   * when each was written. How often that has been found changed; where they are
   * watched for, and what watches. All by project.
   */
  private tools = new Map<string, string>()
  private toolRevisions = new Map<string, number>()
  private toolsWatched = new Map<string, string>()
  private toolWatchers = new Map<string, fs.FSWatcher[]>()
  private toolTimers = new Map<string, NodeJS.Timeout>()
  /** And the assembly guides each has, kept the same way: all by project. */
  private guides = new Map<string, string>()
  private guideRevisions = new Map<string, number>()
  private guidesWatched = new Map<string, string>()
  private guideWatchers = new Map<string, fs.FSWatcher[]>()
  private guideTimers = new Map<string, NodeJS.Timeout>()
  /** And the circuit boards, with what is built of them: all by project, again. */
  private boards = new Map<string, string>()
  private boardRevisions = new Map<string, number>()
  private boardsWatched = new Map<string, string>()
  private boardWatchers = new Map<string, fs.FSWatcher[]>()
  private boardTimers = new Map<string, NodeJS.Timeout>()
  private watchers = new Map<string, fs.FSWatcher>()
  private timers = new Map<string, NodeJS.Timeout>()
  /**
   * The colours given each project's parts by hand, as their file was last read or
   * written, with what it said; how often they have been found changed by something
   * other than the window; and what watches for that. All by project.
   */
  private colours = new Map<string, { parts: PartColours; file: string }>()
  private colourRevisions = new Map<string, number>()
  private coloursWatched = new Map<string, string>()
  private colourWatchers = new Map<string, fs.FSWatcher>()
  private colourTimers = new Map<string, NodeJS.Timeout>()
  /** how far the making of a model from files opened into a project has got */
  private bringing = new Map<string, BringingIn>()
  /**
   * The projects whose folders are not where they were, as they were last looked for: a
   * drive not plugged in, say, or a folder moved or deleted. They stay on the list, with
   * all that was kept of them, and are themselves again once the folder is back.
   */
  private unavailable = new Set<string>()
  /**
   * Where the list of projects was moved to, as the app was opened, where it could not be
   * read: null where there was nothing wrong with it. The list starts empty in its place.
   */
  readonly aside: string | null = null

  /** one of a project's circuit boards was written: in its folder, by what it is known by */
  private readonly onBoard: (id: string, root: string, board: string) => void

  /**
   * `later`: what is in each project's folder is looked for only once `locateAll` is
   * called, and not as the list is read: the app has its window opened in between.
   */
  constructor(
    file: string,
    onChange: () => void,
    onBoard: (id: string, root: string, board: string) => void = () => {},
    { later = false }: { later?: boolean } = {}
  ) {
    this.file = file
    this.onChange = onChange
    this.onBoard = onBoard
    let state: { projects?: unknown; kept?: boolean } | null = null
    try {
      const read: unknown = JSON.parse(fs.readFileSync(file, "utf8"))
      if (typeof read !== "object" || read === null || Array.isArray(read))
        throw new Error("not a list of projects")
      state = read
    } catch (error) {
      // First run. A list there that cannot be read is kept, out of the way, rather than
      // written over by the first project added: what it says can be had back from it.
      if (!missing(error)) this.aside = setAside(file)
    }
    if (state) {
      // (one taken off the list when such were remembered is forgotten now)
      this.saved = (Array.isArray(state.projects) ? state.projects : []).filter(
        (p): p is Saved => readsAsProject(p) && !p.closed
      )
      for (const project of this.saved) {
        if (!fs.existsSync(project.path)) this.unavailable.add(project.id)
        // (pinned at no time that can be told is not pinned)
        if (!Number.isFinite(project.pinned)) delete project.pinned
      }
      // From before the app kept which repositories it set up: those it knew then that say
      // so of themselves are taken at their word, once. A folder opened after never is.
      if (!state.kept) {
        for (const project of this.saved)
          if (markedManaged(project.path)) project.kept = true
        this.save()
      }
    }
    if (!later) this.locateAll()
  }

  /** Look into each project's folder that has not been looked into yet. */
  locateAll() {
    for (const project of this.saved)
      if (!this.unavailable.has(project.id) && !this.found.has(project.id))
        this.locate(project)
  }

  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    // (`kept`: each project says for itself whether its history is the app's to keep)
    writeWhole(
      this.file,
      JSON.stringify({ projects: this.saved, kept: true }, null, 2)
    )
  }

  /**
   * Find the project's model and watch its manifest, so a rebuild shows up by itself.
   * True if anything of the project's is not where, or as, it was last found.
   */
  private locate(project: Saved): boolean {
    const scene = this.scenes.get(project.id)
    this.locateScene(project)
    const tools = this.locateTools(project)
    const guides = this.locateGuides(project)
    const boards = this.locateBoards(project)
    const colours = this.locateColours(project)
    const found = findModel(project.path)
    const before = this.found.get(project.id)?.manifest ?? null
    this.found.set(project.id, found)
    const moved = found.manifest !== before
    if (moved) {
      this.bump(project.id)
      this.watch(project)
    }
    return (
      moved ||
      this.scenes.get(project.id) !== scene ||
      tools ||
      guides ||
      boards ||
      colours
    )
  }

  /** Watch a project's manifest where it now is. */
  private watch(project: Saved) {
    this.watchers.get(project.id)?.close()
    this.watchers.delete(project.id)
    const manifest = this.found.get(project.id)?.manifest
    if (!manifest) return
    const name = path.basename(manifest)
    try {
      const watcher = fs.watch(
        path.dirname(manifest),
        { persistent: false },
        (_, changed) => {
          if (changed !== name) return
          // a build writes the manifest in more than one go; wait for it to settle
          clearTimeout(this.timers.get(project.id))
          this.timers.set(
            project.id,
            setTimeout(() => {
              this.bump(project.id)
              this.onChange()
            }, 400)
          )
        }
      )
      this.watchers.set(project.id, watcher)
    } catch {
      // unwatchable (a network drive, say): the model still loads, it just won't auto-reload
    }
  }

  private bump(id: string) {
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1)
  }

  /**
   * Find the reference scene a project has of its own, if it has one, and watch its
   * manifest as the model's is watched: a scene built again shows up by itself.
   */
  private locateScene(project: Saved) {
    const { id } = project
    const found = findReference(project.path)
    if (found === (this.scenes.get(id) ?? null)) return
    this.sceneWatchers.get(id)?.close()
    this.sceneWatchers.delete(id)
    if (!found) {
      this.scenes.delete(id)
      return
    }
    this.scenes.set(id, found)
    const bump = () =>
      this.sceneRevisions.set(id, (this.sceneRevisions.get(id) ?? 0) + 1)
    bump()
    const name = path.basename(found)
    try {
      this.sceneWatchers.set(
        id,
        fs.watch(path.dirname(found), { persistent: false }, (_, changed) => {
          if (changed !== name) return
          clearTimeout(this.sceneTimers.get(id))
          this.sceneTimers.set(
            id,
            setTimeout(() => {
              if (fs.existsSync(found)) bump()
              else this.locateScene(project)
              this.onChange()
            }, 400)
          )
        })
      )
    } catch {
      // unwatchable: the scene still loads, it just won't load again by itself
    }
  }

  /**
   * Find the tools a project has of its own, and watch for them: the folder they are
   * in, for one being written, and the project's, for that folder coming or going. A
   * tool written again shows up by itself, as a model built again does. True if they
   * are not as they were last found.
   */
  private locateTools(project: Saved): boolean {
    const { id } = project
    const dir = path.join(project.path, TOOLS_FOLDER)
    const found = findTools(project.path)
      .map((name) => {
        try {
          const { mtimeMs, size } = fs.statSync(path.join(dir, name))
          return `${name}:${mtimeMs}:${size}`
        } catch {
          return name
        }
      })
      .join("|")
    const there = fs.existsSync(dir)
    const watched = `${project.path}|${there}`
    if (this.toolsWatched.get(id) !== watched) {
      this.toolsWatched.set(id, watched)
      for (const watcher of this.toolWatchers.get(id) ?? []) watcher.close()
      const again = () => {
        clearTimeout(this.toolTimers.get(id))
        this.toolTimers.set(
          id,
          setTimeout(() => {
            if (this.locateTools(project)) this.onChange()
          }, 300)
        )
      }
      const watchers: fs.FSWatcher[] = []
      try {
        watchers.push(
          fs.watch(project.path, { persistent: false }, (_, changed) => {
            if (changed === TOOLS_FOLDER) again()
          })
        )
        if (there) watchers.push(fs.watch(dir, { persistent: false }, again))
      } catch {
        // unwatchable: the tools still load, they just won't load again by themselves
      }
      this.toolWatchers.set(id, watchers)
    }
    if (found === (this.tools.get(id) ?? "")) return false
    if (found) this.tools.set(id, found)
    else this.tools.delete(id)
    this.toolRevisions.set(id, (this.toolRevisions.get(id) ?? 0) + 1)
    return true
  }

  /**
   * Find the assembly guides a project has, and watch for them, as its tools are found
   * and watched for: the folder they are in, for one being written, and the project's,
   * for that folder coming or going. True if they are not as they were last found.
   */
  private locateGuides(project: Saved): boolean {
    const { id } = project
    const dir = path.join(project.path, ASSEMBLY_FOLDER)
    const found = findGuides(project.path)
      .map((name) => {
        try {
          const { mtimeMs, size } = fs.statSync(path.join(dir, name))
          return `${name}:${mtimeMs}:${size}`
        } catch {
          return name
        }
      })
      .join("|")
    const there = fs.existsSync(dir)
    const watched = `${project.path}|${there}`
    if (this.guidesWatched.get(id) !== watched) {
      this.guidesWatched.set(id, watched)
      for (const watcher of this.guideWatchers.get(id) ?? []) watcher.close()
      const again = () => {
        clearTimeout(this.guideTimers.get(id))
        this.guideTimers.set(
          id,
          setTimeout(() => {
            if (this.locateGuides(project)) this.onChange()
          }, 300)
        )
      }
      const watchers: fs.FSWatcher[] = []
      try {
        watchers.push(
          fs.watch(project.path, { persistent: false }, (_, changed) => {
            if (changed === ASSEMBLY_FOLDER) again()
          })
        )
        if (there) watchers.push(fs.watch(dir, { persistent: false }, again))
      } catch {
        // unwatchable: the guides are still read, they just won't be read again by themselves
      }
      this.guideWatchers.set(id, watchers)
    }
    if (found === (this.guides.get(id) ?? "")) return false
    if (found) this.guides.set(id, found)
    else this.guides.delete(id)
    this.guideRevisions.set(id, (this.guideRevisions.get(id) ?? 0) + 1)
    return true
  }

  /**
   * Find the circuit boards a project has, and watch for them, as its guides are found
   * and watched for: and the folder in theirs that what is built of them goes in, for a
   * board built again to show up by itself. True if they are not as they were last
   * found.
   */
  private locateBoards(project: Saved): boolean {
    const { id } = project
    const dir = path.join(project.path, BOARD_FOLDER)
    const built = path.join(dir, BUILT_FOLDER)
    const found = boardsWritten(project.path)
    const there = fs.existsSync(dir)
    const builtThere = fs.existsSync(built)
    const watched = `${project.path}|${there}|${builtThere}`
    if (this.boardsWatched.get(id) !== watched) {
      this.boardsWatched.set(id, watched)
      for (const watcher of this.boardWatchers.get(id) ?? []) watcher.close()
      const again = () => {
        clearTimeout(this.boardTimers.get(id))
        this.boardTimers.set(
          id,
          setTimeout(() => {
            if (this.locateBoards(project)) this.onChange()
          }, 300)
        )
      }
      const watchers: fs.FSWatcher[] = []
      try {
        watchers.push(
          fs.watch(project.path, { persistent: false }, (_, changed) => {
            if (changed === BOARD_FOLDER) again()
          })
        )
        if (there)
          watchers.push(
            fs.watch(dir, { persistent: false }, (_, changed) => {
              const board = BOARD_SOURCE.exec(String(changed ?? ""))?.[1]
              if (board) this.onBoard(id, project.path, board)
              again()
            })
          )
        if (builtThere)
          watchers.push(fs.watch(built, { persistent: false }, again))
      } catch {
        // unwatchable: the boards are still read, they just won't be read again by themselves
      }
      this.boardWatchers.set(id, watchers)
    }
    if (found === (this.boards.get(id) ?? "")) return false
    if (found) this.boards.set(id, found)
    else this.boards.delete(id)
    this.boardRevisions.set(id, (this.boardRevisions.get(id) ?? 0) + 1)
    return true
  }

  /**
   * Read the colours given a project's parts by hand from its folder, and watch the
   * folder for their file being written: by the window, whose own writing is no news to
   * it, or by anything else (a conversation's version of the folder put in place, a turn
   * taken back, Claude). True if they are not as they were last read or written.
   */
  private locateColours(project: Saved): boolean {
    const { id } = project
    if (this.coloursWatched.get(id) !== project.path) {
      this.coloursWatched.set(id, project.path)
      this.colourWatchers.get(id)?.close()
      this.colourWatchers.delete(id)
      try {
        this.colourWatchers.set(
          id,
          fs.watch(project.path, { persistent: false }, (_, changed) => {
            if (changed !== COLOURS_FILE) return
            clearTimeout(this.colourTimers.get(id))
            this.colourTimers.set(
              id,
              setTimeout(() => {
                if (this.locateColours(project)) this.onChange()
              }, 300)
            )
          })
        )
      } catch {
        // unwatchable: they are read again when the project is next looked for
      }
    }
    let file = ""
    try {
      file = fs.readFileSync(path.join(project.path, COLOURS_FILE), "utf8")
    } catch {
      // none given, or none kept
    }
    if (this.colours.get(id)?.file === file) return false
    let parts: PartColours = {}
    try {
      parts = readColours(JSON.parse(file))
    } catch {
      // not a list of colours, or one being written: none, until it is whole
    }
    this.colours.set(id, { parts, file })
    this.colourRevisions.set(id, (this.colourRevisions.get(id) ?? 0) + 1)
    return true
  }

  /**
   * Write the colours given a project's parts by hand into its folder, or take their
   * file away where there are none. It is no news to the window, which gave them, unless
   * it is to `announce` them. True if the file is not as it was.
   */
  saveColours(
    id: string,
    parts: PartColours,
    { announce = false }: { announce?: boolean } = {}
  ): boolean {
    const project = this.saved.find((p) => p.id === id)
    if (!project) return false
    const file = Object.keys(parts).length > 0 ? coloursFile(parts) : ""
    if (this.colours.get(id)?.file === file) return false
    const at = path.join(project.path, COLOURS_FILE)
    try {
      if (file) fs.writeFileSync(at, file)
      else fs.rmSync(at, { force: true })
    } catch {
      return false
    }
    this.colours.set(id, { parts, file })
    if (announce)
      this.colourRevisions.set(id, (this.colourRevisions.get(id) ?? 0) + 1)
    return true
  }

  /** Whether a project's folder has colours given by hand already. */
  hasColours(id: string): boolean {
    return Boolean(this.colours.get(id)?.file)
  }

  /**
   * The projects, the one added last first: they are kept in the order they came. One
   * whose folder is not there is on it as `missing`, with nothing of its folder's.
   */
  list(conversations: (id: string) => ConversationSummary[]): Project[] {
    return listOrder(this.saved).map((p): Project => {
      if (this.unavailable.has(p.id))
        return {
          id: p.id,
          path: p.path,
          name: p.name ?? path.basename(p.path),
          missing: true,
          branch: null,
          manifest: null,
          bringingIn: null,
          lookOver: null,
          revision: this.revisions.get(p.id) ?? 0,
          reference: null,
          tools: null,
          assembly: null,
          boards: null,
          colours: { revision: 0, parts: {} },
          assembling: false,
          undo: null,
          redo: null,
          conversations: [],
          settingsToTrust: false,
          pinned: p.pinned !== undefined,
        }
      const manifest = this.found.get(p.id)?.manifest ?? null
      return {
        id: p.id,
        path: p.path,
        name: p.name ?? path.basename(p.path),
        branch: readBranch(p.path),
        manifest: manifest && path.relative(p.path, manifest),
        bringingIn: this.bringing.get(p.id) ?? null,
        // there is nothing to look over until there is a model
        lookOver: p.lookOver && manifest ? "wanted" : null,
        revision: this.revisions.get(p.id) ?? 0,
        reference: this.scenes.has(p.id)
          ? (this.sceneRevisions.get(p.id) ?? 0)
          : null,
        tools: this.tools.has(p.id)
          ? (this.toolRevisions.get(p.id) ?? 0)
          : null,
        assembly: this.guides.has(p.id)
          ? (this.guideRevisions.get(p.id) ?? 0)
          : null,
        boards: this.boards.has(p.id)
          ? (this.boardRevisions.get(p.id) ?? 0)
          : null,
        colours: {
          revision: this.colourRevisions.get(p.id) ?? 0,
          parts: this.colours.get(p.id)?.parts ?? {},
        },
        // whether one is being made is known to whoever has the conversations
        assembling: false,
        // what can be taken back is kept elsewhere (changes.ts), and said by whoever
        // has both
        undo: null,
        redo: null,
        conversations: conversations(p.id),
        settingsToTrust:
          !madeHere(p) && p.trusted === undefined && ownSettings(p.path),
        pinned: p.pinned !== undefined,
      }
    })
  }

  /**
   * Pin a project to the top of the list, over the others pinned before it; or let it go
   * back to its place among the rest.
   */
  pin(id: string, pinned: boolean, now = Date.now()) {
    const project = this.saved.find((p) => p.id === id)
    if (!project || (project.pinned !== undefined) === pinned) return
    if (pinned) project.pinned = now
    else delete project.pinned
    this.save()
    this.onChange()
  }

  /**
   * Whether the agent goes by the settings a project's folder has of its own, as well as
   * the user's: where the app made it, where it has none, or where the user trusts them.
   */
  goesByOwnSettings(id: string): boolean {
    const project = this.saved.find((p) => p.id === id)
    if (!project) return false
    return (
      madeHere(project) ||
      project.trusted === true ||
      !ownSettings(project.path)
    )
  }

  /** The user says whether the agent goes by the settings the folder has of its own. */
  trust(id: string, trusted: boolean) {
    const project = this.saved.find((p) => p.id === id)
    if (!project) return
    project.trusted = trusted
    this.save()
    this.onChange()
  }

  /**
   * Whether a project's model has parts made of a mesh (an STL or OBJ file), as its
   * manifest says: what the agent is to be told about, when it has.
   */
  hasMeshes(id: string): boolean {
    const manifest = this.found.get(id)?.manifest
    if (!manifest) return false
    try {
      const { parts } = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
        parts?: { mesh?: unknown }[]
      }
      return Array.isArray(parts) && parts.some((part) => part?.mesh === true)
    } catch {
      return false
    }
  }

  /** Whether a folder is one of the projects already. */
  knows(dir: string): boolean {
    try {
      const real = fs.realpathSync(dir)
      return this.saved.some((p) => p.path === real)
    } catch {
      return false
    }
  }

  /**
   * A project, with what was found in its folder. Null for one that is not on the list,
   * or whose folder is not there: nothing is to be done in it until it is.
   */
  get(id: string): (Saved & Found & { reference: string | null }) | null {
    const project = this.saved.find((p) => p.id === id)
    if (!project || this.unavailable.has(id)) return null
    return {
      ...project,
      ...(this.found.get(id) ?? { manifest: null, build: null }),
      // absolute path of the manifest of its own reference scene, if it has one
      reference: this.scenes.get(id) ?? null,
    }
  }

  /**
   * Add a folder, or return the project it already is. `made` says the app has just made
   * the folder itself, under what name the project goes, whether that name is only a
   * stand-in, and whether there are files in it a model is about to be made of: the
   * project is then in the list as that from the first, never as one with nothing in it.
   * `lookOver` says Claude is to look that model over, and what it was written from.
   */
  add(
    dir: string,
    made?: {
      name: string
      standIn?: boolean
      reading?: boolean
      lookOver?: Written
    }
  ): string {
    const real = fs.realpathSync(dir)
    // (one whose folder was not there is the same project, with all that was kept of it)
    const existing = this.saved.find((p) => p.path === real)
    if (existing) {
      if (this.unavailable.delete(existing.id)) {
        this.locate(existing)
        this.onChange()
      }
      return existing.id
    }
    // lower-case hex: the id is used as a host name in model URLs
    const project: Saved = {
      id: randomBytes(6).toString("hex"),
      path: real,
      ...(made
        ? {
            name: made.name,
            made: true,
            ...(made.standIn ? { standIn: true } : {}),
            ...(made.lookOver ? { lookOver: made.lookOver } : {}),
          }
        : {}),
      addedAt: Date.now(),
    }
    this.saved.push(project)
    if (made?.reading)
      this.bringing.set(project.id, { state: "working", done: 0, total: null })
    this.locate(project)
    this.save()
    this.onChange()
    return project.id
  }

  /** The app has set a project's repository up: it keeps its history from now on. */
  keep(id: string) {
    const project = this.saved.find((p) => p.id === id)
    if (!project || project.kept) return
    project.kept = true
    this.save()
  }

  /**
   * A project on the list, whether or not its folder is there: what it goes by, where it
   * was, and whether it is missing. Null for one that is not on the list.
   */
  listed(
    id: string
  ): { id: string; path: string; name: string; missing: boolean } | null {
    const project = this.saved.find((p) => p.id === id)
    return project
      ? {
          id,
          path: project.path,
          name: project.name ?? path.basename(project.path),
          missing: this.unavailable.has(id),
        }
      : null
  }

  /**
   * Take a project off the list, and forget it: added again, its folder is a new project.
   * Nothing in the folder is touched. The one exception is a folder that came to nothing
   * - one the app made, with nothing put in it - which is cleared away rather than left
   * lying about for good.
   */
  remove(id: string) {
    const project = this.saved.find((p) => p.id === id)
    if (!project) return
    this.watchers.get(id)?.close()
    this.watchers.delete(id)
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    this.found.delete(id)
    this.revisions.delete(id)
    this.sceneWatchers.get(id)?.close()
    this.sceneWatchers.delete(id)
    clearTimeout(this.sceneTimers.get(id))
    this.sceneTimers.delete(id)
    this.scenes.delete(id)
    this.sceneRevisions.delete(id)
    for (const watcher of this.toolWatchers.get(id) ?? []) watcher.close()
    this.toolWatchers.delete(id)
    clearTimeout(this.toolTimers.get(id))
    this.toolTimers.delete(id)
    this.tools.delete(id)
    this.toolRevisions.delete(id)
    this.toolsWatched.delete(id)
    for (const watcher of this.guideWatchers.get(id) ?? []) watcher.close()
    this.guideWatchers.delete(id)
    clearTimeout(this.guideTimers.get(id))
    this.guideTimers.delete(id)
    this.guides.delete(id)
    this.guideRevisions.delete(id)
    this.guidesWatched.delete(id)
    for (const watcher of this.boardWatchers.get(id) ?? []) watcher.close()
    this.boardWatchers.delete(id)
    clearTimeout(this.boardTimers.get(id))
    this.boardTimers.delete(id)
    this.boards.delete(id)
    this.boardRevisions.delete(id)
    this.colourWatchers.get(id)?.close()
    this.colourWatchers.delete(id)
    clearTimeout(this.colourTimers.get(id))
    this.colourTimers.delete(id)
    this.colours.delete(id)
    this.colourRevisions.delete(id)
    this.coloursWatched.delete(id)
    this.boardsWatched.delete(id)
    this.bringing.delete(id)
    this.unavailable.delete(id)
    this.saved = this.saved.filter((p) => p !== project)
    if (madeHere(project)) removeIfEmpty(project.path)
    this.save()
    this.onChange()
  }

  /**
   * Call a project something else, as the user asks. That is its name from then on: one
   * that went by a stand-in is no longer waiting for its model to name it, and its
   * folder, which was named after the stand-in, is renamed to match, as `christen`
   * renames it: where `moved` is given, which is to hear of it, for nothing is at work
   * in the folder. Any other project's folder is left as it is called. A name that says
   * nothing changes nothing.
   */
  rename(id: string, name: string, moved?: (from: string, to: string) => void) {
    const project = this.saved.find((p) => p.id === id)
    const called = name.replace(/\s+/g, " ").trim().slice(0, NAME_LENGTH)
    if (!project || !called) return
    if (called === (project.name ?? path.basename(project.path))) return
    // A folder the app did not make is known, where nothing says, by its project having
    // no name of its own (see `remove`): it is said outright before it is given one.
    if (project.made === undefined && project.name === undefined)
      project.made = false
    if (project.standIn && moved) this.rehouse(project, called, moved)
    project.name = called
    delete project.standIn
    this.save()
    this.onChange()
  }

  /**
   * Give a project that still goes by a stand-in the name of what has been made in it:
   * the title of its model. Its folder is renamed to match, keeping the date it was made
   * on. To be called when nothing is at work in the folder. `moved` hears of the rename.
   */
  christen(id: string, moved: (from: string, to: string) => void) {
    const project = this.saved.find((p) => p.id === id)
    const manifest = this.found.get(id)?.manifest
    if (!project?.standIn || !manifest) return
    let title: unknown
    try {
      title = (
        JSON.parse(fs.readFileSync(manifest, "utf8")) as { title?: unknown }
      ).title
    } catch {
      return
    }
    if (typeof title !== "string" || !title.trim()) return
    const name = title.replace(/\s+/g, " ").trim()
    this.rehouse(project, name, moved)
    project.name = name
    delete project.standIn
    this.save()
    this.onChange()
  }

  /**
   * Rename a project's folder after the name it is being given, keeping the date it was
   * made on, and follow it there. Where the folder cannot be renamed it stays as it is
   * called. `moved` hears of the rename.
   */
  private rehouse(
    project: Saved,
    name: string,
    moved: (from: string, to: string) => void
  ) {
    const from = project.path
    const base = folderName(name, new Date(project.addedAt))
    if (path.basename(from) === base) return
    let to: string
    for (let n = 1; ; n++) {
      to = path.join(path.dirname(from), n === 1 ? base : `${base}-${n}`)
      if (!fs.existsSync(to)) break
    }
    try {
      fs.renameSync(from, to)
    } catch {
      return
    }
    project.path = to
    // the model is the same model, somewhere else: watched there, without being taken
    // for a new one
    const found = this.found.get(project.id)
    if (found)
      this.found.set(project.id, {
        ...found,
        manifest:
          found.manifest && path.join(to, path.relative(from, found.manifest)),
      })
    this.watch(project)
    this.locateScene(project)
    this.locateTools(project)
    this.locateGuides(project)
    this.locateColours(project)
    moved(from, to)
  }

  /**
   * The Claude Code session of the one conversation a project used to have, handed over
   * for good to whoever asks: the conversation keeps it from here on.
   */
  takeSession(id: string): string | null {
    const project = this.saved.find((p) => p.id === id)
    const sessionId = project?.sessionId ?? null
    if (project && "sessionId" in project) {
      delete project.sessionId
      this.save()
    }
    return sessionId
  }

  /**
   * A project's model is no longer waiting to be looked over: Claude is at it, or the
   * user has started on the project themselves. Returns what its model.py was written
   * from, if it was waiting.
   */
  lookedOver(id: string): Written | null {
    const project = this.saved.find((p) => p.id === id)
    const written = project?.lookOver ?? null
    if (project && written) {
      delete project.lookOver
      this.save()
      this.onChange()
    }
    return written
  }

  /**
   * Say how far the making of a model from a project's files has got, or (null) that
   * it is over with: there is a model now, and it is looked for.
   */
  report(id: string, state: BringingIn | null) {
    const project = this.saved.find((p) => p.id === id)
    if (!project) return
    if (state) this.bringing.set(id, state)
    else {
      this.bringing.delete(id)
      this.locate(project)
    }
    this.onChange()
  }

  /**
   * The files of a project's model were put as they were at some other time, without
   * its manifest being written to: the window is to load them again all the same.
   */
  changed(id: string) {
    this.bump(id)
    this.onChange()
  }

  /**
   * Look again for the model: Claude may just have created or moved it. True if
   * anything of the project's is not where, or as, it was last found.
   */
  refresh(id: string): boolean {
    const project = this.saved.find((p) => p.id === id)
    return project && !this.unavailable.has(id) ? this.locate(project) : false
  }

  /**
   * Look again for every project's folder, which may have gone since, or come back:
   * one that came back is looked into again. Whether any folder went or came back.
   */
  lookForFolders(): boolean {
    let changed = false
    for (const project of this.saved) {
      const there = fs.existsSync(project.path)
      if (there !== this.unavailable.has(project.id)) continue
      changed = true
      if (there) {
        this.unavailable.delete(project.id)
        this.locate(project)
      } else this.unavailable.add(project.id)
    }
    return changed
  }

  /**
   * Look again at every project: for its folder, which may have gone since, or come
   * back, and for its model. Whether any folder went or came back.
   */
  refreshAll(): boolean {
    const changed = this.lookForFolders()
    for (const project of this.saved)
      if (!this.unavailable.has(project.id)) this.locate(project)
    return changed
  }

  /** What each project on the list is known by, in the order they were added. */
  ids(): string[] {
    return this.saved.map((project) => project.id)
  }

  close() {
    for (const watcher of this.watchers.values()) watcher.close()
    for (const timer of this.timers.values()) clearTimeout(timer)
    for (const watcher of this.sceneWatchers.values()) watcher.close()
    for (const timer of this.sceneTimers.values()) clearTimeout(timer)
    for (const watchers of this.toolWatchers.values())
      for (const watcher of watchers) watcher.close()
    for (const timer of this.toolTimers.values()) clearTimeout(timer)
    for (const watchers of this.guideWatchers.values())
      for (const watcher of watchers) watcher.close()
    for (const timer of this.guideTimers.values()) clearTimeout(timer)
    for (const watchers of this.boardWatchers.values())
      for (const watcher of watchers) watcher.close()
    for (const timer of this.boardTimers.values()) clearTimeout(timer)
  }
}
