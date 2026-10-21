import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BIG } from "./backup"
import { Backups, type Backed, type BackupsDeps } from "./backups"
import { git } from "./git"
import type { GitHub } from "./github"
import { Locks } from "./locks"

let root: string
let project: Backed
/** where "GitHub" keeps the repositories it makes: bare ones, in a folder */
let remote: string
let versioned: boolean
let made: string[]

const write = (file: string, content: string) => {
  const full = path.join(project.path, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}
const show = async (repo: string, ...args: string[]) =>
  (await git(args, repo)).stdout.trim()

/** GitHub as a folder of bare repositories. */
const github = {
  createRepository: async (name: string) => {
    const url = path.join(remote, `${name}.git`)
    await git(["init", "--quiet", "--bare", url], root)
    made.push(name)
    return { full: `ada/${name}`, url }
  },
  changeRepository: async (_: string, change: { name?: string }) => ({
    full: `ada/${change.name}`,
    url: path.join(remote, `${change.name}.git`),
  }),
  pushing: async () => ({}),
} as unknown as GitHub

const backups = (connected: boolean, more: Partial<BackupsDeps> = {}) =>
  new Backups({
    git,
    projects: () => [project],
    keep: () => {
      project = { ...project, kept: true }
    },
    fits: async () => true,
    versioned: () => versioned,
    github: () =>
      connected
        ? { client: github, account: { id: 7, login: "ada", name: "Ada" } }
        : null,
    signedOut: () => {},
    onProgress: () => {},
    ...more,
  })

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "enclose-backups-"))
  )
  remote = path.join(root, "github")
  fs.mkdirSync(remote)
  project = {
    id: "p1",
    path: path.join(root, "Lid"),
    name: "Lid",
    manifest: path.join(root, "Lid", "build", "enclose.model.json"),
    build: "python3 model.py",
    made: true,
    kept: false,
  }
  fs.mkdirSync(project.path)
  versioned = true
  made = []
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe("Backups", () => {
  it("keeps a new project's history where nothing is connected, and pushes none of it", async () => {
    write("model.py", "a = 1")
    await backups(false).prepare("p1", "Started in Enclose")
    expect(await show(project.path, "log", "--format=%an|%s")).toBe(
      "Enclose|Started in Enclose"
    )
    expect(made).toEqual([])
  })

  it("makes a project's repository the first time, and pushes each turn to it, by the user", async () => {
    write("model.py", "a = 1")
    const kept = backups(true)
    await kept.prepare("p1", "Started in Enclose")
    expect(made).toEqual(["enclose-lid"])
    write("model.py", "a = 2")
    await kept.record("p1", {
      what: "Thicker lid",
      conversation: "Lid",
      conversationId: "c1",
    })
    const bare = path.join(remote, "enclose-lid.git")
    expect(await show(bare, "log", "--format=%an <%ae>|%s", "main")).toBe(
      "Ada <7+ada@users.noreply.github.com>|Thicker lid\nAda <7+ada@users.noreply.github.com>|Started in Enclose"
    )
    write("model.py", "a = 3")
    await kept.record("p1", {
      what: "Round corners",
      conversation: null,
      conversationId: "c2xxxx",
    })
    expect(await show(bare, "branch", "--format=%(refname:short)")).toBe(
      "main\nversion/round-corners-c2xxxx"
    )
    expect(made).toEqual(["enclose-lid"])
  })

  it("makes no repository for a project with no model yet, and makes it with the model", async () => {
    project = { ...project, manifest: null, build: null }
    write("notes.txt", "a lid")
    const kept = backups(true)
    await kept.prepare("p1", "Started in Enclose")
    expect(made).toEqual([])
    project = {
      ...project,
      manifest: path.join(project.path, "build", "enclose.model.json"),
    }
    await kept.record("p1", {
      what: "Built the model",
      conversation: null,
      conversationId: null,
    })
    expect(made).toEqual(["enclose-lid"])
  })

  it("commits on main alone where there are no versions", async () => {
    versioned = false
    write("model.py", "a = 1")
    const kept = backups(false)
    await kept.prepare("p1", "Started in Enclose")
    write("model.py", "a = 2")
    await kept.record("p1", {
      what: "One",
      conversation: null,
      conversationId: "c1",
    })
    write("model.py", "a = 3")
    await kept.record("p1", {
      what: "Two",
      conversation: null,
      conversationId: "c2",
    })
    expect(
      await show(project.path, "branch", "--format=%(refname:short)")
    ).toBe("main")
  })

  it("commits a conversation's turn only while the folder is still that conversation's", async () => {
    let on = "c1"
    const kept = backups(false, { on: () => on })
    write("model.py", "a = 1")
    await kept.prepare("p1", "Started in Enclose")
    write("model.py", "a = 2")
    await kept.record("p1", {
      what: "One",
      conversation: null,
      conversationId: "c1",
    })
    // the folder became another's before the commit asked for got to it: what it holds
    // is that one's, and is not put on the first one's branch
    on = "c2xxxx"
    write("model.py", "a = 3")
    await kept.record("p1", {
      what: "Two",
      conversation: null,
      conversationId: "c1",
    })
    expect(await show(project.path, "log", "--format=%s", "main")).toBe(
      "One\nStarted in Enclose"
    )
    await kept.all(false)
    expect(
      await show(project.path, "branch", "--format=%(refname:short)")
    ).toBe("main\nversion/backed-up-by-enclose-c2xxxx")
    expect(
      await show(
        project.path,
        "log",
        "--format=%s",
        "version/backed-up-by-enclose-c2xxxx",
        "-1"
      )
    ).toBe("Backed up by Enclose")
    expect(await show(project.path, "log", "--format=%s", "main", "-1")).toBe(
      "One"
    )
  })

  it("commits once nothing else is being done in the folder, and says when it has", async () => {
    const locks = new Locks()
    const kept = backups(false, {
      hold: (id, work) => locks.hold(id, work),
    })
    write("model.py", "a = 1")
    await kept.prepare("p1", "Started in Enclose")
    let release = () => {}
    // the folder being put another way, say
    const busy = locks.hold(
      "p1",
      () => new Promise<void>((resolve) => (release = resolve))
    )
    write("model.py", "a = 2")
    const recorded = kept.record("p1", {
      what: "One",
      conversation: null,
      conversationId: null,
    })
    let committed = false
    void kept.committed("p1").then(() => (committed = true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(committed).toBe(false)
    expect(await show(project.path, "log", "--format=%s")).toBe(
      "Started in Enclose"
    )
    release()
    await busy
    await recorded
    expect(committed).toBe(true)
    expect(await show(project.path, "log", "--format=%s", "-1")).toBe("One")
  })

  it("says when a project's history could not be kept, until it can be again", async () => {
    let told = 0
    const kept = backups(false, { onFailures: () => told++ })
    write("model.py", "a = 1")
    await kept.prepare("p1", "Started in Enclose")
    expect(kept.failures()).toEqual([])
    // what a git cut short a moment ago leaves: every commit fails while it is there
    const lock = path.join(project.path, ".git", "index.lock")
    fs.writeFileSync(lock, "")
    write("model.py", "a = 2")
    await kept.record("p1", {
      what: "One",
      conversation: null,
      conversationId: null,
    })
    expect(kept.failures()).toEqual([
      {
        id: "p1",
        why: expect.stringContaining("index.lock"),
        at: expect.any(Number),
      },
    ])
    expect(told).toBe(1)
    // left there long enough, it is taken for one left behind, and the next commit goes in
    const old = (Date.now() - 11 * 60_000) / 1000
    fs.utimesSync(lock, old, old)
    await kept.record("p1", {
      what: "Two",
      conversation: null,
      conversationId: null,
    })
    expect(kept.failures()).toEqual([])
    expect(told).toBe(2)
    expect(await show(project.path, "log", "--format=%s", "-1")).toBe("Two")
  })

  it("backs up projects made before GitHub was connected, and renames a repository with its project", async () => {
    write("model.py", "a = 1")
    await backups(false).prepare("p1", "Started in Enclose")
    const kept = backups(true)
    await kept.all(false)
    expect(made).toEqual(["enclose-lid"])
    project = { ...project, name: "Pill box" }
    await kept.renamed("p1")
    expect(
      await show(project.path, "config", "--get", "enclose.repository")
    ).toBe("ada/enclose-pill-box")
  })

  it("leaves a repository that was somebody's own alone", async () => {
    project = { ...project, made: false }
    await git(["init", "--quiet"], project.path)
    write("model.py", "a = 1")
    const kept = backups(true)
    await kept.prepare("p1", "Opened in Enclose")
    await kept.all(false)
    expect(made).toEqual([])
    expect((await git(["rev-parse", "HEAD"], project.path)).code).not.toBe(0)
  })

  it("sends what Git LFS keeps itself, with no hook to send it", async () => {
    write("model.py", "a = 1")
    write("scan.stl", "x".repeat(BIG))
    await backups(true).prepare("p1", "Started in Enclose")
    const bare = path.join(remote, "enclose-lid.git")
    expect(await show(bare, "log", "--format=%s", "main")).toBe(
      "Started in Enclose"
    )
    expect(fs.existsSync(path.join(bare, "lfs", "objects"))).toBe(true)
  }, 30_000)

  it("takes no repository's word that the app set it up", async () => {
    // a folder from somebody else's Enclose, opened here: its config says it is managed
    project = { ...project, made: false }
    await git(["init", "--quiet"], project.path)
    await git(["config", "enclose.managed", "true"], project.path)
    write("model.py", "a = 1")
    const kept = backups(true)
    await kept.prepare("p1", "Opened in Enclose")
    await kept.record("p1", {
      what: "Thicker",
      conversation: null,
      conversationId: null,
    })
    await kept.all(false)
    expect(made).toEqual([])
    expect((await git(["rev-parse", "HEAD"], project.path)).code).not.toBe(0)
  })

  it("makes no repository in a folder of a repository of somebody's own", async () => {
    await git(["init", "--quiet"], root)
    project = { ...project, made: false }
    write("model.py", "a = 1")
    await backups(false).prepare("p1", "Opened in Enclose")
    expect(fs.existsSync(path.join(project.path, ".git"))).toBe(false)
    expect(project.kept).toBe(false)
  })
})
