import { EventEmitter } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Update } from "../shared/api"
import { logIn, mayPass, onThisMachine, Updates, type Updater } from "./update"

/** An error as electron-updater makes one of an answer it did not want. */
const answered = (statusCode: number) =>
  Object.assign(new Error(`HTTP error: ${statusCode}`), { statusCode })

describe("mayPass", () => {
  it("is what the server or the connection did, and nothing else", () => {
    expect(mayPass(answered(504))).toBe(true)
    expect(mayPass(answered(502))).toBe(true)
    expect(mayPass(answered(429))).toBe(true)
    expect(mayPass(answered(404))).toBe(false)
    expect(mayPass(answered(403))).toBe(false)
    expect(mayPass(new Error("net::ERR_CONNECTION_RESET"))).toBe(true)
    expect(mayPass(new Error("Request timed out"))).toBe(true)
    expect(mayPass(new Error("sha512 checksum mismatch, expected x"))).toBe(
      false
    )
    expect(mayPass(new Error("ZIP file not provided: []"))).toBe(false)
    expect(mayPass("offline")).toBe(false)
  })
})

describe("logIn", () => {
  let folder: string
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-log-"))
  })
  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  it("writes what it is told a line at a time, in a folder it makes", () => {
    const file = path.join(folder, "Logs", "updates.log")
    const log = logIn(file)
    log.info("Checking for update")
    log.error(answered(504))
    const written = fs.readFileSync(file, "utf8")
    expect(written).toMatch(
      /^\d{4}-\d\d-\d\dT[\d:.]+Z info Checking for update\n/
    )
    // an error with where it came from
    expect(written).toContain(" error Error: HTTP error: 504\n    at ")
  })

  it("puts aside a log that has grown large", () => {
    const file = path.join(folder, "updates.log")
    fs.writeFileSync(file, "x".repeat(20))
    logIn(file, 10).info("new")
    expect(fs.readFileSync(path.join(folder, "updates.old.log"), "utf8")).toBe(
      "x".repeat(20)
    )
    expect(fs.readFileSync(file, "utf8")).toMatch(/Z info new\n$/)
  })

  it("does not stop anything when it cannot be written", () => {
    // (a folder where the file would go)
    const file = path.join(folder, "updates.log")
    fs.mkdirSync(file)
    expect(() => logIn(file).warn("lost")).not.toThrow()
  })
})

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
  // what it wrote down
  const written: string[] = []
  const updates = new Updates({
    updater: fake.updater,
    onChange: (update) => told.push(update),
    log: {
      info: (message) => void written.push(String(message)),
      warn: (message) => void written.push(String(message)),
    },
  })
  return { ...fake, updates, told, written }
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

  describe("a download the server or the connection let down", () => {
    const AFTER = 5 * 1000
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout"] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })
    const downloads = (asked: string[]) =>
      asked.filter((what) => what === "download")

    it("is asked for once more, after a while", async () => {
      const { updates, emit, done, asked } = await found()
      updates.download()
      await done(answered(504))
      // on its way still, meanwhile
      expect(updates.get()).toMatchObject({ state: "downloading" })
      expect(downloads(asked)).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(AFTER)
      expect(downloads(asked)).toHaveLength(2)
      emit("update-downloaded", { version: "0.0.2" })
      await done()
      expect(updates.get()).toEqual({ state: "ready", version: "0.0.2" })
    })

    it("is said not to have come, let down twice", async () => {
      const { updates, done, asked } = await found()
      updates.download()
      await done(answered(504))
      await vi.advanceTimersByTimeAsync(AFTER)
      await done(new Error("net::ERR_CONNECTION_RESET"))
      expect(updates.get()).toEqual({
        state: "available",
        version: "0.0.2",
        failed: true,
      })
      await vi.advanceTimersByTimeAsync(10 * AFTER)
      expect(downloads(asked)).toHaveLength(2)
    })

    it("is not asked for again where it would only fail again", async () => {
      for (const error of [answered(404), new Error("ZIP file not provided")]) {
        const { updates, done, asked } = await found()
        updates.download()
        await done(error)
        expect(updates.get()).toMatchObject({ failed: true })
        await vi.advanceTimersByTimeAsync(AFTER)
        expect(downloads(asked)).toHaveLength(1)
      }
    })

    it("is not asked for again once it is here, and a Mac refuses it", async () => {
      const { updates, emit, done, asked } = await found()
      updates.download()
      emit("update-downloaded", { version: "0.0.2" })
      await done(new Error("net::ERR_FAILED"))
      expect(updates.get()).toMatchObject({ state: "available", failed: true })
      await vi.advanceTimersByTimeAsync(AFTER)
      expect(downloads(asked)).toHaveLength(1)
    })
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
    expect(await updates.restart()).toBe(false)
    updates.download()
    expect(await updates.restart()).toBe(false)
    expect(asked).not.toContain("install")

    emit("update-downloaded", { version: "0.0.2" })
    expect(await Promise.all([updates.restart(), updates.restart()])).toEqual([
      true,
      false,
    ])
    expect(asked.filter((what) => what === "install")).toHaveLength(1)
    expect(updates.get()).toEqual({ state: "restarting", version: "0.0.2" })
    updates.close()
  })

  it("offers the download again when what was fetched will not go in", async () => {
    const { updates, emit } = await found()
    updates.download()
    emit("update-downloaded", { version: "0.0.2" })
    await updates.restart()
    emit("error", new Error("code signature did not match"))
    expect(updates.get()).toEqual({
      state: "available",
      version: "0.0.2",
      failed: true,
    })
    updates.close()
  })

  describe("a restart", () => {
    const STALLED = 60 * 1000
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })
    async function ready() {
      const made = await found()
      made.updates.download()
      made.emit("update-downloaded", { version: "0.0.2" })
      return made
    }
    const installs = (asked: string[]) =>
      asked.filter((what) => what === "install")

    it("is said to be under way at once, and done once what is under way is over", async () => {
      const { updates, asked } = await ready()
      let over = () => {}
      const going = updates.restart(
        () => new Promise<void>((resolve) => (over = resolve))
      )
      expect(updates.get()).toEqual({ state: "restarting", version: "0.0.2" })
      await Promise.resolve()
      expect(installs(asked)).toHaveLength(0)
      over()
      expect(await going).toBe(true)
      expect(installs(asked)).toHaveLength(1)
    })

    it("goes ahead where seeing to what was under way went wrong", async () => {
      const { updates, asked, written } = await ready()
      expect(
        await updates.restart(() => Promise.reject(new Error("stuck")))
      ).toBe(true)
      expect(installs(asked)).toHaveLength(1)
      expect(written).toContainEqual(
        expect.stringMatching(/^Restarting all the same: Error: stuck/)
      )
    })

    it("does not go ahead with a version found wanting meanwhile", async () => {
      const { updates, emit, asked } = await ready()
      const going = updates.restart(async () => {
        emit("error", new Error("code signature did not match"))
      })
      expect(await going).toBe(false)
      expect(installs(asked)).toHaveLength(0)
      expect(updates.get()).toMatchObject({ state: "available", failed: true })
    })

    it("is offered again with the app still here a while after", async () => {
      const { updates, asked, written } = await ready()
      await updates.restart()
      await vi.advanceTimersByTimeAsync(STALLED - 1)
      expect(updates.get()).toMatchObject({ state: "restarting" })
      await vi.advanceTimersByTimeAsync(1)
      expect(updates.get()).toEqual({ state: "ready", version: "0.0.2" })
      expect(written.at(-2)).toMatch(/^Still here 60 s after restarting/)
      // and can be asked for again
      expect(await updates.restart()).toBe(true)
      expect(installs(asked)).toHaveLength(2)
      updates.close()
    })

    it("writes down where the update is as that changes, and each restart", async () => {
      const { updates, emit, written } = await found()
      updates.download()
      emit("download-progress", { percent: 50 })
      emit("update-downloaded", { version: "0.0.2" })
      await updates.restart()
      expect(written).toEqual([
        "Update available (0.0.2)",
        "Update downloading (0.0.2)",
        "Update ready (0.0.2)",
        "Update restarting (0.0.2)",
        "Restarting as 0.0.2",
      ])
      updates.close()
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
