// The projects backed up on Enclose Cloud, for the account signed in to (account.ts):
// started from Settings, Account, and from then on done again by itself every so often.
//
// Each project's files are those its repository has (git's own, and those it would take:
// what .gitignore leaves out, as the build, is left out here too), or for a folder that
// is not a repository, all of it but what is never wanted (.git, node_modules, build).
// Each file is sent once, under its SHA-256: the server is asked first which it has not
// got (so nothing is sent twice, and a backup cut short goes on where it was). Then each
// project is sent as it is: its files' paths and hashes. See apps/cloud/src/backup.ts.
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type { CloudState, Progress } from "../shared/api"
import type { Git } from "./backup"

/** The biggest file backed up: the server takes no bigger (apps/cloud/src/account.ts). */
export const FILE_LIMIT = 95 * 1024 ** 2
/** How many files are sent at once. */
const AT_ONCE = 4
/** How often the projects are backed up again by themselves, once they have been, ms. */
export const EVERY_MS = 15 * 60_000
/** How long the server out of reach is waited on before trying again, ms. */
export const RETRY_MS = 30_000
/** How often the window is told how far along it is, at most, ms. */
const TOLD_EVERY_MS = 100
/** What is never backed up, of a folder that is not a repository. */
const NEVER = new Set([".git", "node_modules", "build", ".DS_Store", ".venv"])

export type CloudProject = { id: string; name: string; path: string }

/** How a backup ended, as it is counted (the app's usage data). */
export type CloudOutcome = "done" | "stopped" | "offline" | "failed" | "full"

export type CloudDeps = {
  /** where the account is kept */
  server: string
  /** what signs in to it: null where the app is not signed in */
  token: () => string | null
  /** how much the account keeps, of the most it may: null where it has not said */
  storage: () => { used: number; limit: number } | null
  projects: () => CloudProject[]
  git: Git
  get: typeof fetch
  onChange: (state: CloudState) => void
  /** a backup is done: what the account keeps is to be asked again */
  done: () => void
  record: (
    event: "cloud backup",
    properties: Record<string, string | number | boolean>
  ) => void
  /** the time, ms: the tests' own */
  now?: () => number
}

/** A file of a project's, as it is backed up. */
type Found = { path: string; abs: string; size: number; hash: string }

class Stopped extends Error {}
class Offline extends Error {}
/** What the server said, refusing. */
type Refusal = {
  code?: string
  message?: string
  used?: number
  limit?: number
}
class Refused extends Error {
  readonly status: number
  readonly body: Refusal
  constructor(status: number, body: Refusal) {
    super(body.message ?? `The server answered ${status}`)
    this.status = status
    this.body = body
  }
}

export class CloudBackup {
  private readonly deps: CloudDeps
  private now: CloudState = { state: "idle", tooBig: 0 }
  /** the backup under way: stops when this is aborted */
  private running: AbortController | null = null
  /** the files hashed before, as they were then: not read again while unchanged */
  private readonly hashes = new Map<
    string,
    { size: number; mtime: number; hash: string }
  >()
  private every: ReturnType<typeof setInterval> | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private toldAt = 0

  constructor(deps: CloudDeps) {
    this.deps = deps
  }

  get state(): CloudState {
    return this.now
  }

  private set(next: CloudState, often = false) {
    this.now = next
    // (how far along it is, said no more than so often)
    const at = (this.deps.now ?? Date.now)()
    if (often && at - this.toldAt < TOLD_EVERY_MS) return
    this.toldAt = at
    this.deps.onChange(next)
  }

  /** Whether a backup is under way (or waits to go on). */
  get busy(): boolean {
    return this.running !== null || this.retry !== null
  }

  /**
   * Back up every so often by itself, as the account has backups (or stop, as it is
   * signed out of): the first time at once.
   */
  keepUp(on: boolean) {
    if (!on) {
      if (this.every) clearInterval(this.every)
      this.every = null
      return
    }
    if (this.every) return
    this.every = setInterval(() => {
      if (!this.busy) void this.backUp()
    }, EVERY_MS)
    this.every.unref?.()
    if (!this.busy) void this.backUp()
  }

  /** Stop backing up: what was sent is kept, and not sent again next time. */
  stop() {
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.running?.abort()
    if (!this.running) this.set({ state: "idle", tooBig: 0 })
  }

  /** Signed out: nothing is backed up, and nothing said of how it went. */
  signedOut() {
    this.keepUp(false)
    this.stop()
    this.set({ state: "idle", tooBig: 0 })
  }

  /** Back the projects up now. */
  async backUp(): Promise<void> {
    if (this.running || !this.deps.token()) return
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    const running = new AbortController()
    this.running = running
    const clock = this.deps.now ?? Date.now
    const began = clock()
    let outcome: CloudOutcome = "done"
    let projects = 0
    let sent: Progress = { done: 0, total: 0 }
    let bytes: Progress = { done: 0, total: 0 }
    try {
      this.set({ state: "preparing", files: 0 })
      const { found, tooBig } = await this.look(running.signal)
      projects = found.length

      // what the server has not got yet, each once
      const byHash = new Map<string, Found>()
      for (const { files } of found)
        for (const file of files) byHash.set(file.hash, file)
      const missing = await this.missing([...byHash.keys()], running.signal)
      const toSend = missing.map((hash) => byHash.get(hash)!)
      sent = { done: 0, total: toSend.length }
      bytes = {
        done: 0,
        total: toSend.reduce((sum, file) => sum + file.size, 0),
      }
      const storage = this.deps.storage()
      if (storage && storage.used + bytes.total > storage.limit) {
        outcome = "full"
        this.set({
          state: "full",
          needed: bytes.total,
          used: storage.used,
          limit: storage.limit,
        })
        return
      }

      this.set({ state: "uploading", files: sent, bytes })
      const queue = [...toSend]
      const worker = async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          await this.send(file, running.signal)
          sent = { ...sent, done: sent.done + 1 }
          bytes = { ...bytes, done: bytes.done + file.size }
          this.set({ state: "uploading", files: sent, bytes }, true)
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(AT_ONCE, queue.length) }, worker)
      )

      for (const { project, files } of found)
        await this.snapshot(project, files, running.signal)

      this.set({ state: "idle", tooBig })
      this.deps.done()
    } catch (error) {
      if (error instanceof Stopped || running.signal.aborted) {
        outcome = "stopped"
        this.set({ state: "idle", tooBig: 0 })
      } else if (error instanceof Offline) {
        // (tried again by itself, from where it was: what was sent is not sent again)
        outcome = "offline"
        this.set({ state: "waiting", files: sent, bytes })
        this.retry = setTimeout(() => {
          this.retry = null
          void this.backUp()
        }, RETRY_MS)
        this.retry.unref?.()
      } else if (error instanceof Refused && error.body.code === "FULL") {
        outcome = "full"
        this.set({
          state: "full",
          needed: bytes.total - bytes.done,
          used: error.body.used ?? 0,
          limit: error.body.limit ?? 0,
        })
      } else {
        outcome = "failed"
        this.set({ state: "failed", trouble: troubleOf(error) })
      }
    } finally {
      this.running = null
      this.deps.record("cloud backup", {
        outcome,
        projects,
        files: sent.done,
        megabytes: Math.round((bytes.done / 1024 ** 2) * 10) / 10,
        seconds: Math.round((clock() - began) / 1000),
      })
    }
  }

  /** Every project's files, hashed (the window told how many so far). */
  private async look(signal: AbortSignal) {
    const found: { project: CloudProject; files: Found[] }[] = []
    let looked = 0
    let tooBig = 0
    for (const project of this.deps.projects()) {
      const files: Found[] = []
      for (const relative of await this.filesOf(project.path)) {
        if (signal.aborted) throw new Stopped()
        const abs = path.join(project.path, relative)
        let stat: fs.Stats
        try {
          stat = await fs.promises.stat(abs)
        } catch {
          continue // (gone since)
        }
        if (!stat.isFile()) continue
        if (stat.size > FILE_LIMIT) {
          tooBig++
          continue
        }
        files.push({
          path: relative.split(path.sep).join("/"),
          abs,
          size: stat.size,
          hash: await this.hashOf(abs, stat),
        })
        looked++
        this.set({ state: "preparing", files: looked }, true)
      }
      found.push({ project, files })
    }
    return { found, tooBig }
  }

  /** A project's files, within it: as its repository has them, or else all but NEVER. */
  private async filesOf(dir: string): Promise<string[]> {
    if (fs.existsSync(path.join(dir, ".git"))) {
      const listed = await this.deps.git(
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        dir
      )
      if (listed.code === 0)
        return [...new Set(listed.stdout.split("\0").filter(Boolean))]
    }
    const files: string[] = []
    const walk = async (at: string) => {
      let entries: fs.Dirent[]
      try {
        entries = await fs.promises.readdir(path.join(dir, at), {
          withFileTypes: true,
        })
      } catch {
        return
      }
      for (const entry of entries) {
        if (NEVER.has(entry.name)) continue
        const relative = at ? path.join(at, entry.name) : entry.name
        if (entry.isDirectory()) await walk(relative)
        else if (entry.isFile()) files.push(relative)
      }
    }
    await walk("")
    return files
  }

  private async hashOf(abs: string, stat: fs.Stats): Promise<string> {
    const known = this.hashes.get(abs)
    if (known && known.size === stat.size && known.mtime === stat.mtimeMs)
      return known.hash
    const hash = await new Promise<string>((resolve, reject) => {
      const digest = createHash("sha256")
      fs.createReadStream(abs)
        .on("data", (chunk) => digest.update(chunk))
        .on("error", reject)
        .on("end", () => resolve(digest.digest("hex")))
    })
    this.hashes.set(abs, { size: stat.size, mtime: stat.mtimeMs, hash })
    return hash
  }

  /** A request to the server, signed in: Offline where it could not be reached. */
  private async ask(
    route: string,
    init: RequestInit,
    signal: AbortSignal
  ): Promise<unknown> {
    const token = this.deps.token()
    if (!token) throw new Refused(401, {})
    let response: Response
    try {
      response = await this.deps.get(`${this.deps.server}${route}`, {
        ...init,
        signal,
        headers: { authorization: `Bearer ${token}`, ...init.headers },
      })
    } catch {
      if (signal.aborted) throw new Stopped()
      throw new Offline()
    }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Refused(response.status, body as Refusal)
    return body
  }

  private async missing(
    hashes: string[],
    signal: AbortSignal
  ): Promise<string[]> {
    const missing: string[] = []
    for (let at = 0; at < hashes.length; at += 1000) {
      const reply = (await this.ask(
        "/v1/backup/missing",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hashes: hashes.slice(at, at + 1000) }),
        },
        signal
      )) as { missing: string[] }
      missing.push(...reply.missing)
    }
    return missing
  }

  private async send(file: Found, signal: AbortSignal) {
    let body: Buffer
    try {
      body = await fs.promises.readFile(file.abs)
    } catch {
      return // (gone since: the snapshot says what it was, and the next one won't)
    }
    // (changed since it was hashed: sent next time, as it is then)
    if (createHash("sha256").update(body).digest("hex") !== file.hash) return
    await this.ask(
      `/v1/backup/files/${file.hash}`,
      { method: "PUT", body: new Uint8Array(body) },
      signal
    )
  }

  private async snapshot(
    project: CloudProject,
    files: Found[],
    signal: AbortSignal
  ) {
    try {
      await this.ask(
        "/v1/backup/snapshots",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            project: { id: project.id, name: project.name },
            files: files.map(({ path, hash, size }) => ({ path, hash, size })),
          }),
        },
        signal
      )
    } catch (error) {
      // a file that changed on the way (not sent): the project is kept next time
      if (error instanceof Refused && error.body.code === "MISSING") return
      throw error
    }
  }
}

function troubleOf(error: unknown): string {
  if (error instanceof Refused) {
    if (error.status === 401) return "You were signed out. Sign in again."
    if (error.body.code === "SERVICE_FULL" && error.body.message)
      return error.body.message
  }
  return "Enclose Cloud couldn't keep your files. Try again."
}
