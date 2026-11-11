import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Backups, type Backed, type BackupsDeps } from "./backups"
import { git } from "./git"
import { Locks } from "./locks"

let root: string
let project: Backed
let versioned: boolean

const write = (file: string, content: string) => {
  const full = path.join(project.path, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}
const show = async (repo: string, ...args: string[]) =>
  (await git(args, repo)).stdout.trim()

const backups = (more: Partial<BackupsDeps> = {}) =>
  new Backups({
    git,
    projects: () => [project],
    keep: () => {
      project = { ...project, kept: true }
    },
    fits: async () => true,
    versioned: () => versioned,
    ...more,
  })

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "enclose-backups-"))
  )
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
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe("Backups", () => {
  it("keeps a new project's history, by the app", async () => {
    write("model.py", "a = 1")
    await backups().prepare("p1", "Started in Enclose")
    expect(await show(project.path, "log", "--format=%an|%s")).toBe(
      "Enclose|Started in Enclose"
    )
  })

  it("commits each turn on the branch of the conversation it was in", async () => {
    write("model.py", "a = 1")
    const kept = backups()
    await kept.prepare("p1", "Started in Enclose")
    write("model.py", "a = 2")
    await kept.record("p1", {
      what: "Thicker lid",
      conversation: "Lid",
      conversationId: "c1",
    })
    expect(await show(project.path, "log", "--format=%s", "main")).toBe(
      "Thicker lid\nStarted in Enclose"
    )
    write("model.py", "a = 3")
    await kept.record("p1", {
      what: "Round corners",
      conversation: null,
      conversationId: "c2xxxx",
    })
    expect(
      await show(project.path, "branch", "--format=%(refname:short)")
    ).toBe("main\nversion/round-corners-c2xxxx")
  })

  it("commits on main alone where there are no versions", async () => {
    versioned = false
    write("model.py", "a = 1")
    const kept = backups()
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
    const kept = backups({ on: () => on })
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
    expect(
      await show(project.path, "branch", "--format=%(refname:short)")
    ).toBe("main")
  })

  it("makes a version main, and back", async () => {
    let on = "c1"
    const kept = backups({ on: () => on })
    const titles: Record<string, string> = { c1: "Version 1", c2: "Version 2" }
    const titleOf = (id: string) => titles[id]
    write("model.py", "a = 1")
    await kept.prepare("p1", "Started in Enclose")
    write("model.py", "a = 2")
    await kept.record("p1", {
      what: "One",
      conversation: null,
      conversationId: "c1",
    })
    on = "c2xxxx"
    titles.c2xxxx = "Version 2"
    write("model.py", "a = 3")
    await kept.record("p1", {
      what: "Two",
      conversation: null,
      conversationId: "c2xxxx",
    })

    await kept.madeMain("p1", { conversationId: "c2xxxx", was: "c1", titleOf })
    const branches = () =>
      show(project.path, "branch", "--format=%(refname:short)")
    expect(await branches()).toBe(
      "main\nversion/two-c2xxxx\nversion/version-1-c1"
    )
    expect(await show(project.path, "show", "main:model.py")).toBe("a = 3")
    expect(await show(project.path, "log", "--format=%s", "-1", "main")).toBe(
      "Made “Version 2” the main version"
    )
    expect(
      await show(
        project.path,
        "log",
        "--format=%s",
        "version/version-1-c1",
        "-1"
      )
    ).toBe("One")
    expect(await show(project.path, "symbolic-ref", "--short", "HEAD")).toBe(
      "main"
    )

    // each goes on committing where it now is
    write("model.py", "a = 4")
    await kept.record("p1", {
      what: "Three",
      conversation: null,
      conversationId: "c2xxxx",
    })
    expect(await show(project.path, "log", "--format=%s", "-1", "main")).toBe(
      "Three"
    )
    on = "c1"
    write("model.py", "a = 5")
    await kept.record("p1", {
      what: "Four",
      conversation: null,
      conversationId: "c1",
    })
    expect(
      await show(
        project.path,
        "log",
        "--format=%s",
        "-1",
        "version/version-1-c1"
      )
    ).toBe("Four")

    // and back: the other goes to the branch it had before it was main
    await kept.madeMain("p1", { conversationId: "c1", was: "c2xxxx", titleOf })
    expect(await branches()).toBe(
      "main\nversion/two-c2xxxx\nversion/version-1-c1"
    )
    expect(await show(project.path, "show", "main:model.py")).toBe("a = 5")
    expect(
      await show(project.path, "show", "version/two-c2xxxx:model.py")
    ).toBe("a = 4")
    expect(await show(project.path, "symbolic-ref", "--short", "HEAD")).toBe(
      "main"
    )
  })

  it("commits once nothing else is being done in the folder, and says when it has", async () => {
    const locks = new Locks()
    const kept = backups({
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

  it("commits again once what git left of a run cut short is old enough", async () => {
    const kept = backups()
    write("model.py", "a = 1")
    await kept.prepare("p1", "Started in Enclose")
    // what a git cut short a moment ago leaves: every commit fails while it is there
    const lock = path.join(project.path, ".git", "index.lock")
    fs.writeFileSync(lock, "")
    write("model.py", "a = 2")
    await kept.record("p1", {
      what: "One",
      conversation: null,
      conversationId: null,
    })
    expect(await show(project.path, "log", "--format=%s", "-1")).toBe(
      "Started in Enclose"
    )
    // left there long enough, it is taken for one left behind, and the next commit goes in
    const old = (Date.now() - 11 * 60_000) / 1000
    fs.utimesSync(lock, old, old)
    await kept.record("p1", {
      what: "Two",
      conversation: null,
      conversationId: null,
    })
    expect(await show(project.path, "log", "--format=%s", "-1")).toBe("Two")
  })

  it("leaves a repository that was somebody's own alone", async () => {
    project = { ...project, made: false }
    await git(["init", "--quiet"], project.path)
    write("model.py", "a = 1")
    await backups().prepare("p1", "Opened in Enclose")
    expect((await git(["rev-parse", "HEAD"], project.path)).code).not.toBe(0)
  })

  it("takes no repository's word that the app set it up", async () => {
    // a folder from somebody else's Enclose, opened here: its config says it is managed
    project = { ...project, made: false }
    await git(["init", "--quiet"], project.path)
    await git(["config", "enclose.managed", "true"], project.path)
    write("model.py", "a = 1")
    const kept = backups()
    await kept.prepare("p1", "Opened in Enclose")
    await kept.record("p1", {
      what: "Thicker",
      conversation: null,
      conversationId: null,
    })
    expect((await git(["rev-parse", "HEAD"], project.path)).code).not.toBe(0)
  })

  it("makes no repository in a folder of a repository of somebody's own", async () => {
    await git(["init", "--quiet"], root)
    project = { ...project, made: false }
    write("model.py", "a = 1")
    await backups().prepare("p1", "Opened in Enclose")
    expect(fs.existsSync(path.join(project.path, ".git"))).toBe(false)
    expect(project.kept).toBe(false)
  })
})
