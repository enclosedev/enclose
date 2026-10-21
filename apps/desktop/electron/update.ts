// The app's newer versions. One is looked for where the app was made to look (its
// releases: scripts/dist.mjs says which), as the app starts and every few hours after.
// Nothing is fetched until it is asked for, and what was fetched is what the app is once
// it has been started again. electron-updater does all of that: this keeps where things
// are with it, for the window to show.
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

export class Updates {
  private readonly updater: Updater
  private readonly onChange: (update: Update) => void
  private update: Update = { state: "none" }
  /** a newer version is being looked for now */
  private looking = false
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
    // is known of, as before. Anything else that goes wrong is with one being fetched,
    // or put in.
    updater.on("error", () => {
      if (!this.looking) this.failed()
    })
  }

  get(): Update {
    return this.update
  }

  /** Look for a newer version now, and go on looking every so often. */
  start() {
    this.look()
    this.again = setInterval(() => this.look(), EVERY)
  }

  close() {
    clearInterval(this.again)
  }

  /** Look for a newer version, unless one is already on its way or here. */
  look() {
    const { state } = this.update
    if (this.looking || (state !== "none" && state !== "available")) return
    this.looking = true
    void this.updater
      .checkForUpdates()
      // (the updater has said so itself, where it writes what it does)
      .catch(() => {})
      .finally(() => {
        this.looking = false
      })
  }

  /** Fetch the newer version there is. */
  download() {
    const now = this.update
    if (now.state !== "available") return
    this.set({ state: "downloading", version: now.version, fraction: 0 })
    this.updater.downloadUpdate().catch(() => this.failed())
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
