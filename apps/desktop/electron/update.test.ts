import { EventEmitter } from "node:events"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Update } from "../shared/api"
import { onThisMachine, Updates, type Updater } from "./update"

describe("onThisMachine", () => {
  it("is an address on this machine, and nothing else", () => {
    expect(onThisMachine("http://127.0.0.1:8123/")).toBe(
      "http://127.0.0.1:8123/"
    )
    expect(onThisMachine("http://localhost:8123/")).toBe(
      "http://localhost:8123/"
    )
    expect(onThisMachine("http://[::1]:8123/")).toBe("http://[::1]:8123/")
    expect(onThisMachine("https://updates.example.com/")).toBeNull()
    expect(onThisMachine("http://127.0.0.1.example.com/")).toBeNull()
    expect(onThisMachine("file:///tmp/release/")).toBeNull()
    expect(onThisMachine("not a url")).toBeNull()
    expect(onThisMachine(undefined)).toBeNull()
  })
})

/** An updater that does what it is told to, and keeps what was asked of it. */
function fakeUpdater() {
  const events = new EventEmitter()
  const asked: string[] = []
  // what a look, or a download, comes to: settled by the test
  let settle: { resolve: () => void; reject: (error: Error) => void } | null =
    null
  const pending = (what: string) => {
    asked.push(what)
    return new Promise<void>((resolve, reject) => {
      settle = { resolve, reject }
    })
  }
  const updater: Updater = {
    autoDownload: true,
    checkForUpdates: () => pending("check"),
    downloadUpdate: () => pending("download"),
    quitAndInstall: () => void asked.push("install"),
    on: (event: string, listener: (...args: never[]) => void) =>
      events.on(event, listener as (...args: unknown[]) => void),
  }
  return {
    updater,
    asked,
    emit: (event: string, ...args: unknown[]) => events.emit(event, ...args),
    /** what is being waited for comes to an end, well or (given an error) badly */
    async done(error?: Error) {
      if (error) {
        // as electron-updater does: it says so, and then the promise is refused
        events.emit("error", error)
        settle?.reject(error)
      } else settle?.resolve()
      settle = null
      await new Promise((resolve) => setImmediate(resolve))
    },
  }
}

function setUp() {
  const fake = fakeUpdater()
  const told: Update[] = []
  const updates = new Updates({
    updater: fake.updater,
    onChange: (update) => told.push(update),
  })
  return { ...fake, updates, told }
}

/** As far as a newer version having been found. */
async function found(version = "0.0.2") {
  const made = setUp()
  void made.updates.look()
  made.emit("update-available", { version })
  await made.done()
  return made
}

describe("Updates", () => {
  it("fetches nothing until it is asked to", () => {
    const { updater, updates } = setUp()
    expect(updater.autoDownload).toBe(false)
    expect(updates.get()).toEqual({ state: "none" })
  })

  it("says so when a newer version is found", async () => {
    const { updates, told } = await found()
    const available = { state: "available", version: "0.0.2", failed: false }
    expect(updates.get()).toEqual(available)
    expect(told).toEqual([available])
  })

  it("has nothing to show for a look that came to nothing", async () => {
    const { updates, done, told } = setUp()
    void updates.look()
    await done(new Error("offline"))
    expect(updates.get()).toEqual({ state: "none" })
    expect(told).toEqual([])
  })

  it("keeps the version it found when a later look fails", async () => {
    const { updates, done } = await found()
    void updates.look()
    await done(new Error("offline"))
    expect(updates.get()).toEqual({
      state: "available",
      version: "0.0.2",
      failed: false,
    })
  })

  it("does not look twice at once", () => {
    const { updates, asked } = setUp()
    void updates.look()
    void updates.look()
    expect(asked).toEqual(["check"])
  })

  it("says, once a look is over, whether it got through", async () => {
    const { updates, done, emit } = setUp()
    const first = updates.look()
    // asked again meanwhile, it is the same look
    const again = updates.look()
    await done()
    expect(await first).toBe(true)
    expect(await again).toBe(true)
    const failing = updates.look()
    await done(new Error("offline"))
    expect(await failing).toBe(false)
    // with a version on its way there is nothing to look for
    void updates.look()
    emit("update-available", { version: "0.0.2" })
    await done()
    updates.download()
    expect(await updates.look()).toBe(true)
  })

  it("follows a download to its end, and never back", async () => {
    const { updates, emit, asked } = await found()
    updates.download()
    expect(asked.at(-1)).toBe("download")
    expect(updates.get()).toEqual({
      state: "downloading",
      version: "0.0.2",
      fraction: 0,
    })
    emit("download-progress", { percent: 40 })
    emit("download-progress", { percent: 25 })
    emit("download-progress", { percent: NaN })
    expect(updates.get()).toMatchObject({ fraction: 0.4 })
    emit("download-progress", { percent: 100 })
    expect(updates.get()).toMatchObject({ state: "downloading", fraction: 1 })
    emit("update-downloaded", { version: "0.0.2" })
    expect(updates.get()).toEqual({ state: "ready", version: "0.0.2" })
  })

  it("downloads only what it has found, and once", async () => {
    const none = setUp()
    none.updates.download()
    expect(none.asked).toEqual([])

    const { updates, asked } = await found()
    updates.download()
    updates.download()
    expect(asked.filter((what) => what === "download")).toHaveLength(1)
  })

  it("offers a download that failed again", async () => {
    const { updates, emit, done, asked } = await found()
    updates.download()
    emit("download-progress", { percent: 40 })
    await done(new Error("connection lost"))
    expect(updates.get()).toEqual({
      state: "available",
      version: "0.0.2",
      failed: true,
    })
    // found again by a later look, it is still the one that did not come
    void updates.look()
    emit("update-available", { version: "0.0.2" })
    await done()
    expect(updates.get()).toMatchObject({ failed: true })

    updates.download()
    expect(asked.filter((what) => what === "download")).toHaveLength(2)
    expect(updates.get()).toMatchObject({ state: "downloading", fraction: 0 })
  })

  it("does not look for another while one is on its way, or here", async () => {
    const { updates, emit, asked } = await found()
    updates.download()
    void updates.look()
    emit("update-downloaded", { version: "0.0.2" })
    void updates.look()
    expect(asked.filter((what) => what === "check")).toHaveLength(1)
  })

  it("starts the app again only with a version that is here", async () => {
    const { updates, emit, asked } = await found()
    updates.restart()
    updates.download()
    updates.restart()
    expect(asked).not.toContain("install")

    emit("update-downloaded", { version: "0.0.2" })
    updates.restart()
    updates.restart()
    expect(asked.filter((what) => what === "install")).toHaveLength(1)
    expect(updates.get()).toEqual({ state: "restarting", version: "0.0.2" })
  })

  it("offers the download again when what was fetched will not go in", async () => {
    const { updates, emit } = await found()
    updates.download()
    emit("update-downloaded", { version: "0.0.2" })
    updates.restart()
    emit("error", new Error("code signature did not match"))
    expect(updates.get()).toEqual({
      state: "available",
      version: "0.0.2",
      failed: true,
    })
  })

  describe("on its own", () => {
    const HOURS = 4 * 60 * 60 * 1000
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it("looks as it starts, and every few hours after", async () => {
      const { updates, asked, done } = setUp()
      updates.start()
      expect(asked).toEqual(["check"])
      await done()
      vi.advanceTimersByTime(HOURS)
      expect(asked).toEqual(["check", "check"])
      await done()
      updates.close()
      vi.advanceTimersByTime(HOURS)
      expect(asked).toEqual(["check", "check"])
    })
  })
})
