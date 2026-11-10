import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import type { CloudState } from "../shared/api"
import type { Git } from "./backup"
import { CloudBackup, FILE_LIMIT, type CloudDeps } from "./cloud"

const SERVER = "http://localhost:8787"

const git: Git = (args, cwd) =>
  new Promise((resolve) =>
    execFile("git", args, { cwd }, (error, stdout, stderr) =>
      resolve({ code: error ? 1 : 0, stdout, stderr })
    )
  )

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

/** A project's folder, with these files in it. */
function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-cloud-"))
  made.push(dir)
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), text)
  }
  return dir
}

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex")

/** Enclose Cloud as the app is answered by it, keeping what it is sent. */
function server(room = 5 * 1024 ** 3) {
  const files = new Map<string, number>()
  const snapshots: { project: { id: string }; files: { path: string }[] }[] = []
  const puts: string[] = []
  let down = false
  let full = false
  const get = (async (url: string | URL | Request, init: RequestInit = {}) => {
    if (down) throw new TypeError("fetch failed")
    const route = String(url).slice(SERVER.length)
    if (route === "/v1/backup/missing") {
      const { hashes } = JSON.parse(String(init.body))
      return Response.json({
        missing: hashes.filter((hash: string) => !files.has(hash)),
      })
    }
    const file = /^\/v1\/backup\/files\/(\w+)$/.exec(route)
    if (file) {
      const body = Buffer.from(init.body as Uint8Array)
      if (full)
        return Response.json(
          { code: "FULL", used: room, limit: room },
          { status: 413 }
        )
      expect(createHash("sha256").update(body).digest("hex")).toBe(file[1])
      puts.push(file[1])
      files.set(file[1], body.length)
      return Response.json({ size: body.length })
    }
    if (route === "/v1/backup/snapshots") {
      snapshots.push(JSON.parse(String(init.body)))
      return Response.json({ id: "s", new: true })
    }
    return new Response("{}", { status: 404 })
  }) as typeof fetch
  return {
    get,
    files,
    snapshots,
    puts,
    goDown: (is: boolean) => (down = is),
    fill: () => (full = true),
  }
}

function backup(
  projects: { id: string; name: string; path: string }[],
  site = server(),
  storage: { used: number; limit: number } | null = {
    used: 0,
    limit: 5 * 1024 ** 3,
  }
) {
  const states: CloudState[] = []
  const recorded: Record<string, unknown>[] = []
  let done = 0
  let clock = 0
  const deps: CloudDeps = {
    server: SERVER,
    token: () => "the-session",
    storage: () => storage,
    projects: () => projects,
    git,
    get: site.get,
    onChange: (state) => states.push(state),
    done: () => done++,
    record: (_, properties) => recorded.push(properties),
    // (each step a while after the last: every one of them told)
    now: () => (clock += 1000),
  }
  return {
    cloud: new CloudBackup(deps),
    site,
    states,
    recorded,
    done: () => done,
  }
}

describe("backing up on Enclose Cloud", () => {
  it("sends each file, then the project as it is", async () => {
    const dir = project({
      "model.py": "from enclose import *\n",
      "a/b.txt": "b",
    })
    const { cloud, site, states, recorded, done } = backup([
      { id: "p1", name: "Stool", path: dir },
    ])
    await cloud.backUp()
    expect(site.files.size).toBe(2)
    expect(site.snapshots).toHaveLength(1)
    expect(site.snapshots[0].files.map((one) => one.path).sort()).toEqual([
      "a/b.txt",
      "model.py",
    ])
    expect(states.map((state) => state.state)).toEqual([
      "preparing",
      "preparing",
      "preparing",
      "uploading",
      "uploading",
      "uploading",
      "idle",
    ])
    expect(states.at(-2)).toMatchObject({
      files: { done: 2, total: 2 },
      bytes: { total: 23 },
    })
    expect(done()).toBe(1)
    expect(recorded[0]).toMatchObject({
      outcome: "done",
      projects: 1,
      files: 2,
    })
  })

  it("sends nothing the server has, nor the same file twice", async () => {
    const dir = project({ "one.txt": "same", "two.txt": "same" })
    const { cloud, site } = backup([{ id: "p1", name: "Twins", path: dir }])
    await cloud.backUp()
    expect(site.puts).toEqual([hashOf("same")])
    await cloud.backUp()
    expect(site.puts).toHaveLength(1)
    expect(site.snapshots).toHaveLength(2)
  })

  it("leaves out what the project's repository leaves out", async () => {
    const dir = project({
      ".gitignore": "build/\n",
      "model.py": "x",
      "build/model.glb": "big",
    })
    await git(["init", "-q"], dir)
    const { cloud, site } = backup([{ id: "p1", name: "Kept", path: dir }])
    await cloud.backUp()
    expect(site.snapshots[0].files.map((one) => one.path).sort()).toEqual([
      ".gitignore",
      "model.py",
    ])
  })

  it("leaves out what is never wanted, of a folder that is no repository", async () => {
    const dir = project({
      "model.py": "x",
      "node_modules/a.js": "a",
      "build/model.glb": "b",
    })
    const { cloud, site } = backup([{ id: "p1", name: "Loose", path: dir }])
    await cloud.backUp()
    expect(site.snapshots[0].files.map((one) => one.path)).toEqual(["model.py"])
  })

  it("leaves out a file too big, and says how many", async () => {
    const dir = project({ "model.py": "x" })
    // (a file that big, without writing it all: the disk keeps nothing of its holes)
    fs.writeFileSync(path.join(dir, "huge.step"), "")
    fs.truncateSync(path.join(dir, "huge.step"), FILE_LIMIT + 1)
    const { cloud, site } = backup([{ id: "p1", name: "Huge", path: dir }])
    await cloud.backUp()
    expect(site.files.size).toBe(1)
    expect(cloud.state).toEqual({ state: "idle", tooBig: 1 })
  })

  it("sends nothing where the account has no room for it", async () => {
    const dir = project({ "model.py": "0123456789" })
    const { cloud, site } = backup(
      [{ id: "p1", name: "Full", path: dir }],
      server(),
      { used: 95, limit: 100 }
    )
    await cloud.backUp()
    expect(site.puts).toEqual([])
    expect(cloud.state).toEqual({
      state: "full",
      needed: 10,
      used: 95,
      limit: 100,
    })
  })

  it("says the server is full, where it says so", async () => {
    const dir = project({ "model.py": "x" })
    const site = server(100)
    site.fill()
    const { cloud } = backup([{ id: "p1", name: "Full", path: dir }], site)
    await cloud.backUp()
    expect(cloud.state).toMatchObject({ state: "full", limit: 100 })
  })

  it("waits for a connection, and goes on by itself", async () => {
    const dir = project({ "model.py": "x" })
    const site = server()
    site.goDown(true)
    const { cloud, recorded } = backup(
      [{ id: "p1", name: "Away", path: dir }],
      site
    )
    await cloud.backUp()
    expect(cloud.state.state).toBe("waiting")
    expect(cloud.busy).toBe(true)
    expect(recorded[0]).toMatchObject({ outcome: "offline" })
    cloud.stop()
    expect(cloud.busy).toBe(false)
    expect(cloud.state.state).toBe("idle")
  })

  it("stops, as it is asked, keeping what was sent", async () => {
    const dir = project({ "a.txt": "a", "b.txt": "b", "c.txt": "c" })
    const site = server()
    const { cloud, recorded } = backup(
      [{ id: "p1", name: "Cut", path: dir }],
      site
    )
    const going = cloud.backUp()
    cloud.stop()
    await going
    expect(cloud.state).toEqual({ state: "idle", tooBig: 0 })
    expect(recorded[0]).toMatchObject({ outcome: "stopped" })
    expect(site.snapshots).toHaveLength(0)
  })

  it("does nothing signed out", async () => {
    const dir = project({ "a.txt": "a" })
    const site = server()
    const { cloud } = backup([{ id: "p1", name: "Out", path: dir }], site)
    cloud.signedOut()
    // (no token: nothing asked of the server)
    const deps = (cloud as unknown as { deps: CloudDeps }).deps
    deps.token = () => null
    await cloud.backUp()
    expect(site.files.size).toBe(0)
  })
})
