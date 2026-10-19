// Taking back what a turn of Claude's did to a project's folder, and putting it back.
//
// Before Claude is set to work, the folder is copied aside, whole. (On a Mac's own disk
// a copy takes no room until one of the two is written to.) When the turn is over, the
// copy is gone through against the folder and all of it that the turn left alone is let
// go. What is kept is a change: each file the turn wrote to or took away, as it was
// before; each file it wrote to or made, as the turn left it; and which is which. Taking
// the change back puts the first lot where they were and takes away what the turn made.
// Putting it back does the opposite. Neither asks anything of Claude, or builds anything:
// what a build wrote is in the folder too, and goes back with the rest.
//
// The folder as the last turn left it is kept as well, beside the changes, with how each
// of its files stood then. A file that stands the same at the next turn is not copied
// aside again but linked to from there, which takes no time and no room on any disk:
// only what was written to in between is copied.
//
// A change is taken back only from where its turn left things, and put back only from
// where taking it back left them. A file that has been written to since, by hand or by
// anything else, is not written over: nothing is done, and the files in the way are
// named.
//
// Where each conversation has the folder its own way (see versions.ts), the changes that
// can be taken back in it are that conversation's: the turns of another were had in a
// folder that was put aside when this one was turned to.
import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { INSPIRATION_FOLDER } from "../shared/inspiration-format"
import { missing, writeWhole } from "./atomic"
import { Locks } from "./locks"

/** One file a turn touched: what was in it before and after, as a hash; null where there was none. */
type Touched = { path: string; before: string | null; after: string | null }

/** What one turn did to a project's folder. */
export type Change = {
  id: string
  /** the conversation the turn was in */
  conversationId: string
  /** what was asked for in it, in a line */
  what: string
  /** when the folder was put aside, as the turn began (not kept of the oldest changes) */
  since?: number
  /** when the turn was over */
  at: number
  /** when it was taken back, while it is */
  undoneAt: number | null
  files: Touched[]
  /** what Claude was last told of it, if it has had to be told anything */
  told: "undone" | "redone" | null
}

/** How long the turn of a change took, ms: null for one too old to have kept it. */
export const tookOf = (change: Change): number | null =>
  typeof change.since === "number" ? change.at - change.since : null

/** A folder copied aside before a turn: what there was in it, and how each file stood. */
export type Pending = {
  projectId: string
  id: string
  /** when it was put aside */
  since: number
  files: Map<string, { size: number; mtimeMs: number }>
}

export type Outcome =
  | { ok: true; change: Change }
  /** nothing to take back; or files in the way, which have been written to since */
  | { ok: false; why: "nothing" | "changed"; files: string[] }

/** What a project has had done to it, the latest last; and what of that is taken back. */
type Index = { done: Change[]; undone: Change[] }

/** How many changes are kept for a project: the ones before are let go. */
const KEPT = 12
/**
 * A folder with more in it than this is not copied aside, and what is done in it cannot
 * be taken back: the app is for a model's own folder, not for whatever it is opened on.
 */
const MOST = { files: 20_000, bytes: 4e9 }
/** Not a project's own, or made again from what is: left out of the copy, and left alone. */
const LEFT_OUT = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  ".DS_Store",
])
/**
 * And these, at the top of the folder: what is the same in every version of the project,
 * and only ever the user's doing, so that no turn has anything of it to take back. The
 * inspiration board (shared/inspiration-format.ts).
 */
const LEFT_OUT_AT_TOP = new Set([INSPIRATION_FOLDER])

type Standing = { path: string; size: number; mtimeMs: number }

/** How many files are copied, or linked to, at once. */
const AT_ONCE = 8
/**
 * A folder with more in it than this, in bytes, is not kept as the last turn left it:
 * on a disk that cannot share what two copies have the same, that would be the room
 * the whole of it takes again, for good. It is copied aside whole before each turn.
 */
const LATEST_MOST = 512e6

/**
 * Do something to each of these, AT_ONCE at a time. Rejects, once all that was begun is
 * over, with what went wrong first, if anything did; nothing more is begun after that.
 */
export async function eachOf<T>(
  items: T[],
  work: (item: T) => Promise<void>,
  most = AT_ONCE
) {
  let next = 0
  let failed = null as { error: unknown } | null
  const worker = async () => {
    while (next < items.length && !failed) {
      const item = items[next++]
      try {
        await work(item)
      } catch (error) {
        failed ??= { error }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(most, items.length) }, worker)
  )
  if (failed) throw failed.error
}

/**
 * Every file of a folder that is the project's own, as it stands. Null if there is too
 * much. Rejects where the folder, or a folder in it, cannot be read: what it has then is
 * not known, and is not to be taken for nothing.
 */
export async function filesOf(folder: string): Promise<Standing[] | null> {
  const found: Standing[] = []
  let bytes = 0
  const go = async (within: string): Promise<boolean> => {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(path.join(folder, within), {
        withFileTypes: true,
      })
    } catch (error) {
      // (one in it that has gone since it was seen has nothing in it)
      if (within !== "" && missing(error)) return true
      throw error
    }
    // a Python of the project's own, under whatever name
    if (entries.some((entry) => entry.name === "pyvenv.cfg")) return true
    for (const entry of entries) {
      if (LEFT_OUT.has(entry.name)) continue
      if (within === "" && LEFT_OUT_AT_TOP.has(entry.name)) continue
      const at = path.join(within, entry.name)
      if (entry.isDirectory()) {
        if (!(await go(at))) return false
      } else if (entry.isFile()) {
        const stat = await fs.promises
          .stat(path.join(folder, at))
          .catch(() => null)
        if (!stat) continue
        found.push({ path: at, size: stat.size, mtimeMs: stat.mtimeMs })
        bytes += stat.size
        if (found.length > MOST.files || bytes > MOST.bytes) return false
      }
    }
    return true
  }
  return (await go("")) ? found : null
}

export async function hashOf(file: string): Promise<string | null> {
  try {
    const hash = createHash("sha1")
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    return hash.digest("hex")
  } catch {
    return null
  }
}

/** A copy that takes no room where the disk can make one that way. */
export async function copy(from: string, to: string) {
  await fs.promises.mkdir(path.dirname(to), { recursive: true })
  await fs.promises.copyFile(from, to, fs.constants.COPYFILE_FICLONE)
}

/**
 * A second name for a file, which is the same file: whether it could be had. (Only
 * for what is kept here, which is never written to where it is, but put in place whole.)
 */
async function linked(from: string, to: string): Promise<boolean> {
  try {
    await fs.promises.mkdir(path.dirname(to), { recursive: true })
    await fs.promises.link(from, to)
    return true
  } catch {
    return false
  }
}

/** Whether a file stands as it did: not written to since, to the instant. */
const same = (
  was: { size: number; mtimeMs: number } | undefined,
  is: { size: number; mtimeMs: number } | undefined
) => !!was && !!is && was.size === is.size && was.mtimeMs === is.mtimeMs

/** A path within a folder, as it was written down: not one that leads out of it. */
const within = (file: unknown): file is string =>
  typeof file === "string" &&
  file !== "" &&
  !path.isAbsolute(file) &&
  !file.split(/[\\/]/).includes("..")

/**
 * Whether a change is one of those looked among: a conversation's, where the folder is
 * as that conversation alone has it (`of`), and otherwise any.
 */
const among = (of: string | undefined) => (change: Change) =>
  of === undefined || change.conversationId === of

export class Changes {
  private readonly dir: string
  private indexes = new Map<string, Index>()
  /** the copies put aside for turns that are not yet over, by id */
  private pending = new Set<string>()
  /**
   * one thing at a time is done with a project's changes: and, where the lock is the one
   * everything else done in its folder holds (see locks.ts), with its folder
   */
  private readonly locks: Locks

  constructor(dir: string, locks = new Locks()) {
    this.dir = dir
    this.locks = locks
  }

  private root(projectId: string, id?: string) {
    return id
      ? path.join(this.dir, projectId, id)
      : path.join(this.dir, projectId)
  }

  /** Where a project's folder is kept as the last turn left it. */
  private latest(projectId: string) {
    return path.join(this.dir, `${projectId}.latest`)
  }

  /**
   * How each file of the folder kept as the last turn left it stood then: null where
   * there is none, or what says so cannot be read.
   */
  private async latestOf(
    projectId: string
  ): Promise<Map<string, { size: number; mtimeMs: number }> | null> {
    try {
      const read = JSON.parse(
        await fs.promises.readFile(
          path.join(this.latest(projectId), "standing.json"),
          "utf8"
        )
      ) as unknown
      if (!Array.isArray(read)) return null
      return new Map(
        (read as Partial<Standing>[]).flatMap((file) =>
          within(file?.path) &&
          typeof file.size === "number" &&
          typeof file.mtimeMs === "number"
            ? [[file.path, { size: file.size, mtimeMs: file.mtimeMs }]]
            : []
        )
      )
    } catch {
      return null
    }
  }

  /**
   * Keep the folder as a turn left it (`standing`), for the next turn's copy to be
   * linked to: each file the turn left as it was (`left`) moved from where it was put
   * aside before the turn, which is no part of the change; each it wrote to or made
   * from what the change keeps of it as the turn left it; and anything else copied
   * from the folder. What was kept before is let go. Where any of this cannot be done,
   * nothing is kept, and the next turn's copy is made whole.
   */
  private async keepLatest(
    projectId: string,
    root: string,
    folder: string,
    standing: Standing[],
    left: Set<string>
  ) {
    const latest = this.latest(projectId)
    const next = `${latest}.next`
    const rm = (at: string) =>
      fs.promises.rm(at, { recursive: true, force: true })
    try {
      await rm(next)
      if (standing.reduce((sum, file) => sum + file.size, 0) > LATEST_MOST)
        return await rm(latest)
      await eachOf(standing, async (file) => {
        const to = path.join(next, "folder", file.path)
        if (left.has(file.path)) {
          try {
            await fs.promises.mkdir(path.dirname(to), { recursive: true })
            // (it would be let go of next anyway)
            return await fs.promises.rename(
              path.join(root, "before", file.path),
              to
            )
          } catch {
            // copied, then
          }
        } else if (await linked(path.join(root, "after", file.path), to)) return
        await copy(path.join(folder, file.path), to)
      })
      await fs.promises.writeFile(
        path.join(next, "standing.json"),
        JSON.stringify(standing)
      )
      await rm(latest)
      await fs.promises.rename(next, latest)
    } catch (error) {
      console.error("[changes]", error)
      await rm(next).catch(() => {})
    }
  }

  private index(projectId: string): Index {
    let index = this.indexes.get(projectId)
    if (index) return index
    index = { done: [], undone: [] }
    let text: string | null = null
    try {
      text = fs.readFileSync(
        path.join(this.root(projectId), "index.json"),
        "utf8"
      )
    } catch (error) {
      // (nothing kept yet is nothing to go by; one there that cannot be read is not)
      if (!missing(error)) text = ""
    }
    try {
      if (text === null) throw new Error("nothing kept")
      const kept = JSON.parse(text) as Partial<Index> | null
      if (typeof kept !== "object" || kept === null)
        throw new Error("not an index")
      const read = (changes: unknown): Change[] =>
        (Array.isArray(changes) ? changes : []).filter(
          (change: Partial<Change> | null): change is Change =>
            within(change?.id) &&
            typeof change.what === "string" &&
            typeof change.conversationId === "string" &&
            typeof change.at === "number" &&
            Array.isArray(change.files) &&
            change.files.every((file) => within(file?.path))
        )
      index = { done: read(kept.done), undone: read(kept.undone) }
    } catch {
      // An index that was there but does not read, cut short say, says nothing of which
      // copies are what: they are all moved aside with it, as they are, and none of them
      // taken for one left behind and let go. What is done from here on starts afresh.
      if (text !== null) {
        try {
          fs.renameSync(
            this.root(projectId),
            `${this.root(projectId)}.corrupt-${Date.now()}`
          )
        } catch {
          // where it cannot be moved, it is not looked through for copies to let go
          this.indexes.set(projectId, index)
          return index
        }
      }
    }
    this.indexes.set(projectId, index)
    // A copy put aside for a turn that the app was quit in the middle of belongs to
    // nothing: it is let go, the first time the project is looked at.
    const known = new Set(
      [...index.done, ...index.undone].map((change) => change.id)
    )
    try {
      for (const name of fs.readdirSync(this.root(projectId)))
        if (
          name !== "index.json" &&
          !known.has(name) &&
          !this.pending.has(name)
        )
          this.drop(projectId, name)
    } catch {
      // nothing has been kept for it yet
    }
    return index
  }

  private save(projectId: string) {
    const index = this.index(projectId)
    try {
      fs.mkdirSync(this.root(projectId), { recursive: true })
      writeWhole(
        path.join(this.root(projectId), "index.json"),
        JSON.stringify(index)
      )
    } catch {
      // kept for as long as the app is up, then
    }
  }

  private drop(projectId: string, id: string) {
    try {
      fs.rmSync(this.root(projectId, id), { recursive: true, force: true })
    } catch (error) {
      // (left where it is, taking up room, and let go of with the rest the next time)
      console.error("[changes]", error)
    }
  }

  /** One after another: a copy is not gone through while a change is being taken back. */
  private queued<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    return this.locks.hold(projectId, work)
  }

  /**
   * Copy a project's folder aside, before a turn is begun in it. Null if there is too
   * much in it to copy, or it could not be: what the turn does then cannot be taken back.
   */
  before(projectId: string, folder: string): Promise<Pending | null> {
    return this.queued(projectId, async () => {
      // (what is kept of the project is read first, and seen to if it has to be, before
      // there is a copy of this turn's among it)
      this.index(projectId)
      const standing = await filesOf(folder)
      if (!standing) return null
      const since = Date.now()
      const id = `${since}-${randomBytes(3).toString("hex")}`
      const aside = path.join(this.root(projectId, id), "before")
      const files: Pending["files"] = new Map()
      this.pending.add(id)
      // what stands as the last turn left it is linked to, and only the rest copied
      const latest = await this.latestOf(projectId)
      const kept = path.join(this.latest(projectId), "folder")
      try {
        await fs.promises.mkdir(aside, { recursive: true })
        await eachOf(standing, async (file) => {
          const to = path.join(aside, file.path)
          if (
            !same(latest?.get(file.path), file) ||
            !(await linked(path.join(kept, file.path), to))
          )
            await copy(path.join(folder, file.path), to)
        })
        for (const file of standing)
          files.set(file.path, { size: file.size, mtimeMs: file.mtimeMs })
      } catch {
        this.pending.delete(id)
        this.drop(projectId, id)
        return null
      }
      return { projectId, id, since, files }
    })
  }

  /**
   * The turn is over: go through the copy against the folder, and keep what the turn
   * changed as a change that can be taken back. Null if it changed nothing.
   */
  after(
    pending: Pending,
    folder: string,
    about: { conversationId: string; what: string },
    /** the conversation the folder is as only it has it, where it is so */
    of?: string
  ): Promise<Change | null> {
    const { projectId, id, since } = pending
    return this.queued(projectId, async () => {
      const root = this.root(projectId, id)
      const standing = await filesOf(folder)
      if (!standing) {
        this.discard(pending)
        return null
      }
      const now = new Map(standing.map((file) => [file.path, file]))
      const files: Touched[] = []
      /** the files the turn left as they were: what was put aside of them is no change */
      const left = new Set<string>()
      for (const [file, was] of pending.files) {
        const is = now.get(file)
        const kept = path.join(root, "before", file)
        // as it stood, to the instant: not written to
        if (same(was, is)) {
          left.add(file)
          continue
        }
        const before = await hashOf(kept)
        const after = is ? await hashOf(path.join(folder, file)) : null
        // written again, with what was in it already: a build does that to all it makes
        if (before === null || before === after) {
          left.add(file)
          continue
        }
        if (after !== null)
          await copy(path.join(folder, file), path.join(root, "after", file))
        files.push({ path: file, before, after })
      }
      for (const file of standing) {
        if (pending.files.has(file.path)) continue
        const after = await hashOf(path.join(folder, file.path))
        if (after === null) continue
        await copy(
          path.join(folder, file.path),
          path.join(root, "after", file.path)
        )
        files.push({ path: file.path, before: null, after })
      }
      // the folder as the turn left it, for the next turn's copy to be linked to: taking
      // what it can of that from what was put aside of it, which is let go of after
      await this.keepLatest(projectId, root, folder, standing, left)
      await eachOf([...left], (file) =>
        fs.promises.rm(path.join(root, "before", file), { force: true })
      )
      if (files.length === 0) {
        this.discard(pending)
        return null
      }
      const change: Change = {
        id,
        conversationId: about.conversationId,
        what: about.what,
        since,
        at: Date.now(),
        undoneAt: null,
        files,
        told: null,
      }
      const index = this.index(projectId)
      // what was taken back is not put back over something done since
      for (const gone of index.undone.filter(among(of)))
        this.drop(projectId, gone.id)
      index.undone = index.undone.filter((gone) => !among(of)(gone))
      index.done.push(change)
      // it is one of the project's changes from here on, and no longer a copy put aside
      this.pending.delete(id)
      const old = index.done.filter(among(of)).slice(0, -KEPT)
      for (const one of old) this.drop(projectId, one.id)
      index.done = index.done.filter((one) => !old.includes(one))
      this.save(projectId)
      return change
    })
  }

  /** A copy that was made for a turn that never came to anything: let go. */
  discard(pending: Pending) {
    this.pending.delete(pending.id)
    this.drop(pending.projectId, pending.id)
  }

  /** The latest change that can be taken back, and the latest that can be put back. */
  last(
    projectId: string,
    of?: string
  ): { undo: Change | null; redo: Change | null } {
    const { done, undone } = this.index(projectId)
    return {
      undo: done.findLast(among(of)) ?? null,
      redo: undone.findLast(among(of)) ?? null,
    }
  }

  /**
   * The files of a change that do not stand in the folder as they should for it to be
   * taken back (`after`), or put back (`before`).
   */
  private async strayed(
    folder: string,
    change: Change,
    as: "before" | "after"
  ): Promise<string[]> {
    const strayed: string[] = []
    for (const file of change.files)
      if ((await hashOf(path.join(folder, file.path))) !== file[as])
        strayed.push(file.path)
    return strayed
  }

  /**
   * Put the files of a change as they were on one side of it. `last` is a file to see
   * to after all the others: the one whose being written is taken for the rest being so.
   * What is to go goes first: a file that was a folder on the other side, or the other
   * way round, has the way cleared for it before it is written.
   */
  private async put(
    projectId: string,
    folder: string,
    change: Change,
    as: "before" | "after",
    last: string | null
  ) {
    const from = path.join(this.root(projectId, change.id), as)
    const rank = (file: Touched) =>
      file[as] === null ? 0 : file.path === last ? 2 : 1
    const ordered = [...change.files].sort((a, b) => rank(a) - rank(b))
    for (const file of ordered) {
      const at = path.join(folder, file.path)
      if (file[as] !== null) {
        await copy(path.join(from, file.path), at)
        continue
      }
      await fs.promises.rm(at, { force: true })
      // and the folders that were made for it, where nothing else is in them
      for (
        let above = path.dirname(file.path);
        above !== "." && above !== "";
        above = path.dirname(above)
      ) {
        const emptied = await fs.promises
          .rmdir(path.join(folder, above))
          .then(() => true)
          .catch(() => false)
        if (!emptied) break
      }
    }
  }

  /** Take back the latest change to a project's folder. */
  undo(
    projectId: string,
    folder: string,
    last: string | null = null,
    of?: string
  ): Promise<Outcome> {
    return this.queued(projectId, async (): Promise<Outcome> => {
      const index = this.index(projectId)
      const change = index.done.findLast(among(of))
      if (!change) return { ok: false, why: "nothing", files: [] }
      const strayed = await this.strayed(folder, change, "after")
      if (strayed.length > 0)
        return { ok: false, why: "changed", files: strayed }
      await this.put(projectId, folder, change, "before", last)
      index.done.splice(index.done.indexOf(change), 1)
      change.undoneAt = Date.now()
      index.undone.push(change)
      this.save(projectId)
      return { ok: true, change }
    })
  }

  /** Put back the change that was last taken back. */
  redo(
    projectId: string,
    folder: string,
    last: string | null = null,
    of?: string
  ): Promise<Outcome> {
    return this.queued(projectId, async (): Promise<Outcome> => {
      const index = this.index(projectId)
      const change = index.undone.findLast(among(of))
      if (!change) return { ok: false, why: "nothing", files: [] }
      const strayed = await this.strayed(folder, change, "before")
      if (strayed.length > 0)
        return { ok: false, why: "changed", files: strayed }
      await this.put(projectId, folder, change, "after", last)
      index.undone.splice(index.undone.indexOf(change), 1)
      change.undoneAt = null
      index.done.push(change)
      this.save(projectId)
      return { ok: true, change }
    })
  }

  /**
   * What Claude is to be told of, the next time something is said in a conversation:
   * the turns of it whose changes have been taken back since it was last told, and
   * those that have been put back again, each by what was asked in it. It is then told.
   */
  toTell(
    projectId: string,
    conversationId: string
  ): { undone: string[]; redone: string[] } {
    const index = this.index(projectId)
    const mine = (change: Change) => change.conversationId === conversationId
    const undone = index.undone.filter(
      (change) => mine(change) && change.told !== "undone"
    )
    const redone = index.done.filter(
      (change) => mine(change) && change.told === "undone"
    )
    for (const change of undone) change.told = "undone"
    for (const change of redone) change.told = "redone"
    if (undone.length + redone.length > 0) this.save(projectId)
    return {
      undone: undone.map((change) => change.what),
      redone: redone.map((change) => change.what),
    }
  }

  /** A project is taken off the list: nothing of what was done in it is kept. */
  forget(projectId: string) {
    this.indexes.delete(projectId)
    fs.rmSync(this.root(projectId), { recursive: true, force: true })
    fs.rmSync(this.latest(projectId), { recursive: true, force: true })
    fs.rmSync(`${this.latest(projectId)}.next`, {
      recursive: true,
      force: true,
    })
  }
}
