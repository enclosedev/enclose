// The app's newer versions. One is looked for where the app was made to look (its
// releases: scripts/dist.mjs says which), as the app starts and every few hours after.
// Nothing is fetched until it is asked for, and what was fetched is what the app is once
// it has been started again. electron-updater does all of that: this keeps where things
// are with it, for the window to show.
import fs from "node:fs"
import path from "node:path"
import { format } from "node:util"

import type { Update } from "../shared/api"

/** What is used of electron-updater's `autoUpdater`. */
export type Updater = {
  autoDownload: boolean
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
  on(
    event: "update-available" | "update-downloaded",
    listener: (info: { version: string }) => void
  ): unknown
  on(
    event: "download-progress",
    listener: (progress: { percent: number }) => void
  ): unknown
  on(event: "error", listener: (error: Error) => void): unknown
}

/**
 * Where the app is told to look for its newer versions instead (ENCLOSE_UPDATES_URL), if
 * that is an address on this machine, as where `npm run dist` wrote them is served to try
 * one out: anywhere else, nothing it is told counts, and it looks where it was made to.
 */
export function onThisMachine(url: string | undefined): string | null {
  if (!url) return null
  try {
    const { protocol, hostname } = new URL(url)
    return (protocol === "http:" || protocol === "https:") &&
      ["127.0.0.1", "localhost", "[::1]"].includes(hostname)
      ? url
      : null
  } catch {
    return null
  }
}

export type UpdatesDeps = {
  updater: Updater
  /** told where things are, each time that changes */
  onChange: (update: Update) => void
}

/** How long it is between one look for a newer version and the next, in ms. */
const EVERY = 4 * 60 * 60 * 1000

/**
 * How long a download the server or the connection let down waits before it is asked
 * for once more, in ms.
 */
const AGAIN_AFTER = 5 * 1000

/**
 * Whether what stopped a download was the server's doing or the connection's, and so may
 * well not happen a moment later: an answer of 5xx (or 408, or 429), or no answer at all.
 * (The releases' server has answered some of the asks for a file with a 504, for a few
 * minutes at a time, as 0.0.19 came out.)
 */
export function mayPass(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const { statusCode } = error as Error & { statusCode?: unknown }
  if (typeof statusCode === "number")
    return statusCode >= 500 || statusCode === 408 || statusCode === 429
  return /^net::ERR_|timed out|aborted by the server|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up/i.test(
    error.message
  )
}

/** What electron-updater writes what it does to. */
export type Log = {
  info(message?: unknown): void
  warn(message?: unknown): void
  error(message?: unknown): void
  debug(message: string): void
}

/** How large the log grows before it is put aside and another started, in bytes. */
const LOG_MOST = 1024 * 1024

/**
 * What electron-updater does, written to a file: an installed app's own output is read
 * by no one, and why an update did not come is otherwise not known after. Grown large,
 * it is put aside as `<name>.old.log` (the one before it, gone) as the app starts. Nothing
 * that goes wrong writing it gets in the way of the update.
 */
export function logIn(file: string, most = LOG_MOST): Log {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (fs.statSync(file).size > most)
      fs.renameSync(file, file.replace(/(\.log)?$/, ".old.log"))
  } catch {
    // (not there yet)
  }
  const write = (level: string) => (message?: unknown) => {
    try {
      fs.appendFileSync(
        file,
        `${new Date().toISOString()} ${level} ${format(message)}\n`
      )
    } catch {
      // (not kept, then)
    }
  }
  return {
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
    debug: write("debug"),
  }
}

export class Updates {
  private readonly updater: Updater
  private readonly onChange: (update: Update) => void
  private update: Update = { state: "none" }
  /** a newer version is being looked for now: whether that gets through, once it has */
  private looking: Promise<boolean> | null = null
  private again: ReturnType<typeof setInterval> | undefined

  constructor(deps: UpdatesDeps) {
    this.updater = deps.updater
    this.onChange = deps.onChange
    const { updater } = this
    updater.autoDownload = false
    updater.on("update-available", ({ version }) => {
      const now = this.update
      if (now.state !== "none" && now.state !== "available") return
      const failed =
        now.state === "available" && now.version === version && now.failed
      this.set({ state: "available", version, failed })
    })
    updater.on("download-progress", ({ percent }) => {
      const now = this.update
      if (now.state !== "downloading" || !Number.isFinite(percent)) return
      // (never back: where fetching only what has changed fails, the whole of it is
      // fetched, and counted from nothing)
      const fraction = Math.min(1, Math.max(now.fraction, percent / 100))
      this.set({ ...now, fraction })
    })
    updater.on("update-downloaded", ({ version }) =>
      this.set({ state: "ready", version })
    )
    // A look that came to nothing is nothing to show: there is no newer version that
    // is known of, as before. A download that fails is heard of where it was asked for,
    // which may ask for it again (fetch, below). Anything else that goes wrong is with
    // one being put in.
    updater.on("error", () => {
      if (!this.looking && this.update.state !== "downloading") this.failed()
    })
  }

  get(): Update {
    return this.update
  }

  /** Look for a newer version now, and go on looking every so often. */
  start() {
    void this.look()
    this.again = setInterval(() => void this.look(), EVERY)
  }

  close() {
    clearInterval(this.again)
  }

  /**
   * Look for a newer version, unless one is already on its way or here; looked for
   * already, the look under way is the one. Resolves once it is over, to whether it got
   * through (what it found is heard of as ever), and at once to true where there is no
   * need to look.
   */
  look(): Promise<boolean> {
    const { state } = this.update
    if (state !== "none" && state !== "available") return Promise.resolve(true)
    if (this.looking) return this.looking
    const looking = this.updater.checkForUpdates().then(
      () => true,
      // (the updater has said why itself, where it writes what it does)
      () => false
    )
    this.looking = looking
    void looking.finally(() => {
      if (this.looking === looking) this.looking = null
    })
    return looking
  }

  /** Fetch the newer version there is. */
  download() {
    const now = this.update
    if (now.state !== "available") return
    this.set({ state: "downloading", version: now.version, fraction: 0 })
    void this.fetch()
  }

  /**
   * Fetch it, and where the server or the connection let that down, once more after a
   * while, before it is said not to have come. (Fetched, a Mac may still refuse it, once
   * it is ready: that is not asked again.)
   */
  private async fetch(tries = 2): Promise<void> {
    try {
      await this.updater.downloadUpdate()
    } catch (error) {
      if (tries > 1 && this.update.state === "downloading" && mayPass(error)) {
        await new Promise((resolve) => setTimeout(resolve, AGAIN_AFTER))
        return this.fetch(tries - 1)
      }
      this.failed()
    }
  }

  /** Start the app again as the version that was fetched. */
  restart() {
    const now = this.update
    if (now.state !== "ready") return
    this.set({ state: "restarting", version: now.version })
    // (not always at once: a Mac may still be putting the new version where it goes)
    this.updater.quitAndInstall()
  }

  /** What was asked for did not come, or would not go in: it can be asked for again. */
  private failed() {
    const now = this.update
    if (now.state === "none" || now.state === "available") return
    this.set({ state: "available", version: now.version, failed: true })
  }

  private set(update: Update) {
    this.update = update
    this.onChange(update)
  }
}
