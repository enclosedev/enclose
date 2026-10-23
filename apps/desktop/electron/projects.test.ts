import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  findModel,
  folderName,
  folderSize,
  Projects,
  readBranch,
  resolveInside,
} from "./projects"

let root: string
const write = (file: string, content: unknown) => {
  const full = path.join(root, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(
    full,
    typeof content === "string" ? content : JSON.stringify(content)
  )
}
const MANIFEST = { parts: [{ id: "a", file: "a.glb" }] }

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "enclose-test-"))
  )
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe("resolveInside", () => {
  it("resolves files under the root", () => {
    expect(resolveInside("/models/a", "/top.glb")).toBe("/models/a/top.glb")
    expect(resolveInside("/models/a", "step/top.step")).toBe(
      "/models/a/step/top.step"
    )
  })

  it("refuses anything that would land outside it", () => {
    expect(resolveInside("/models/a", "../b/secret")).toBeNull()
    expect(resolveInside("/models/a", "/../../etc/passwd")).toBeNull()
    expect(resolveInside("/models/a", "step/../../a-sibling/x")).toBeNull()
  })

  it("refuses a link in the folder that leads out of it", () => {
    write("model/top.glb", "mesh")
    write("secret/key", "hush")
    fs.symlinkSync(path.join(root, "secret"), path.join(root, "model", "out"))
    fs.symlinkSync(
      path.join(root, "secret", "key"),
      path.join(root, "model", "key.glb")
    )
    fs.symlinkSync(
      path.join(root, "secret", "gone"),
      path.join(root, "model", "nowhere")
    )
    const model = path.join(root, "model")
    expect(resolveInside(model, "top.glb")).toBe(path.join(model, "top.glb"))
    expect(resolveInside(model, "new/part.step")).toBe(
      path.join(model, "new", "part.step")
    )
    expect(resolveInside(model, "out/key")).toBeNull()
    expect(resolveInside(model, "key.glb")).toBeNull()
    expect(resolveInside(model, "out/new/file")).toBeNull()
    expect(resolveInside(model, "nowhere")).toBeNull()
  })

  it("goes by where the folder really is, whatever way to it it is given by", () => {
    write("model/top.glb", "mesh")
    fs.symlinkSync(path.join(root, "model"), path.join(root, "linked"))
    const linked = path.join(root, "linked")
    expect(resolveInside(linked, "top.glb")).toBe(path.join(linked, "top.glb"))
  })
})

describe("findModel", () => {
  it("finds nothing in a folder without a manifest", () => {
    write("README.md", "hello")
    expect(findModel(root)).toEqual({ manifest: null, build: null })
  })

  it("finds the nearest manifest, searching level by level", () => {
    write("a/b/c/report.json", MANIFEST)
    write("viewer/model.json", MANIFEST)
    expect(findModel(root).manifest).toBe(path.join(root, "viewer/model.json"))
  })

  it("passes over files that share the name but are not manifests", () => {
    write("report.json", { coverage: 0.9 })
    write("out/report.json", MANIFEST)
    expect(findModel(root).manifest).toBe(path.join(root, "out/report.json"))
  })

  it("does not look inside dependencies or hidden folders", () => {
    write("node_modules/pkg/model.json", MANIFEST)
    write(".cache/model.json", MANIFEST)
    expect(findModel(root).manifest).toBeNull()
  })

  it("takes the project's word for where the model is and how it is built", () => {
    write("near/model.json", MANIFEST)
    write("deep/down/here/custom.json", MANIFEST)
    write("enclose.json", {
      model: "deep/down/here/custom.json",
      build: "python3 make.py",
    })
    expect(findModel(root)).toEqual({
      manifest: path.join(root, "deep/down/here/custom.json"),
      build: "python3 make.py",
    })
  })

  it("reads a manifest again only once it has been written to", () => {
    write("model.json", MANIFEST)
    const manifest = path.join(root, "model.json")
    const read = vi.spyOn(fs, "readFileSync")
    const reads = () =>
      read.mock.calls.filter(([file]) => file === manifest).length
    try {
      expect(findModel(root).manifest).toBe(manifest)
      expect(findModel(root).manifest).toBe(manifest)
      expect(reads()).toBe(1)
      write("model.json", { parts: [] })
      expect(findModel(root).manifest).toBeNull()
      expect(reads()).toBe(2)
    } finally {
      read.mockRestore()
    }
  })
})

describe("readBranch", () => {
  it("reads the branch of the repository a folder is in", () => {
    write(".git/HEAD", "ref: refs/heads/feature/thing\n")
    write("hardware/enclosure/x.txt", "")
    expect(readBranch(path.join(root, "hardware/enclosure"))).toBe(
      "feature/thing"
    )
  })

  it("shows the start of the commit when no branch is checked out", () => {
    write(".git/HEAD", "0123456789abcdef0123456789abcdef01234567\n")
    expect(readBranch(root)).toBe("0123456")
  })

  it("follows a worktree's .git file to the real directory", () => {
    write("main/.git/worktrees/wt/HEAD", "ref: refs/heads/side\n")
    write("wt/.git", `gitdir: ${path.join(root, "main/.git/worktrees/wt")}\n`)
    expect(readBranch(path.join(root, "wt"))).toBe("side")
  })
})

describe("Projects", () => {
  const idle = () => []

  it("forgets a project taken off the list, so adding its folder again is a new one", () => {
    write("thing/model.json", MANIFEST)
    const file = path.join(root, "state/projects.json")
    const projects = new Projects(file, () => {})
    const id = projects.add(path.join(root, "thing"), { name: "The Thing" })
    expect(projects.list(idle).map((p) => [p.id, p.name])).toEqual([
      [id, "The Thing"],
    ])
    expect(projects.add(path.join(root, "thing"))).toBe(id)
    expect(new Projects(file, () => {}).list(idle)[0]).toMatchObject({ id })

    projects.remove(id)
    expect(projects.list(idle)).toEqual([])
    expect(projects.get(id)).toBeNull()
    expect(new Projects(file, () => {}).list(idle)).toEqual([])
    expect(fs.existsSync(path.join(root, "thing/model.json"))).toBe(true)

    const again = projects.add(path.join(root, "thing"))
    expect(again).not.toBe(id)
    expect(projects.list(idle)).toMatchObject([
      { id: again, name: "thing", manifest: "model.json" },
    ])
    projects.close()
  })

  it("keeps the colours given by hand in the folder, and takes up others written there", () => {
    write("thing/model.json", MANIFEST)
    write("thing/enclose.colors.json", { a: "blue", b: "#123456" })
    const projects = new Projects(
      path.join(root, "state/projects.json"),
      () => {}
    )
    const id = projects.add(path.join(root, "thing"))
    const colours = () => projects.list(idle)[0].colours
    const found = colours()
    expect(found.parts).toEqual({ a: "blue" })

    // what the window gives is written, and is no news to it
    expect(projects.saveColours(id, { a: "red", c: "grey" })).toBe(true)
    expect(colours()).toEqual({
      revision: found.revision,
      parts: { a: "red", c: "grey" },
    })
    expect(
      fs.readFileSync(path.join(root, "thing/enclose.colors.json"), "utf8")
    ).toBe('{\n  "a": "red",\n  "c": "grey"\n}\n')
    expect(projects.saveColours(id, { c: "grey", a: "red" })).toBe(false)
    projects.refresh(id)
    expect(colours().revision).toBe(found.revision)

    // written by something else, it is news
    write("thing/enclose.colors.json", { a: "green" })
    projects.refresh(id)
    expect(colours()).toEqual({
      revision: found.revision + 1,
      parts: { a: "green" },
    })

    expect(projects.saveColours(id, {})).toBe(true)
    expect(fs.existsSync(path.join(root, "thing/enclose.colors.json"))).toBe(
      false
    )
    expect(projects.hasColours(id)).toBe(false)
    projects.close()
  })

  it("lists the project added last first, and so it does after a restart", () => {
    const file = path.join(root, "state/projects.json")
    const projects = new Projects(file, () => {})
    const ids = ["first", "second", "third"].map((name) => {
      fs.mkdirSync(path.join(root, name))
      return projects.add(path.join(root, name))
    })
    const newestFirst = [...ids].reverse()
    expect(projects.list(idle).map((p) => p.id)).toEqual(newestFirst)
    expect(new Projects(file, () => {}).list(idle).map((p) => p.id)).toEqual(
      newestFirst
    )
    projects.close()
  })

  it("lists the pinned first, the one pinned last at the top, and so after a restart", () => {
    const file = path.join(root, "state/projects.json")
    const projects = new Projects(file, () => {})
    const [first, second, third, fourth] = ["a", "b", "c", "d"].map((name) => {
      fs.mkdirSync(path.join(root, name))
      return projects.add(path.join(root, name))
    })
    projects.pin(second, true, 1)
    projects.pin(first, true, 2)
    const order = [first, second, fourth, third]
    expect(projects.list(idle).map((p) => p.id)).toEqual(order)
    expect(projects.list(idle).map((p) => p.pinned)).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(new Projects(file, () => {}).list(idle).map((p) => p.id)).toEqual(
      order
    )
    // let go, it is back where it was among the rest
    projects.pin(first, false)
    expect(projects.list(idle).map((p) => p.id)).toEqual([
      second,
      fourth,
      third,
      first,
    ])
    projects.close()
  })

  it("tells of a pin only where it changes anything", () => {
    fs.mkdirSync(path.join(root, "a"))
    const file = path.join(root, "state/projects.json")
    let told = 0
    const projects = new Projects(file, () => void told++)
    const id = projects.add(path.join(root, "a"))
    told = 0
    projects.pin(id, false)
    projects.pin("nothing", true)
    expect(told).toBe(0)
    projects.pin(id, true)
    projects.pin(id, true)
    expect(told).toBe(1)
    projects.close()
  })

  it("takes a project kept as pinned at no time it can tell for one not pinned", () => {
    write("odd/model.json", MANIFEST)
    write("state/projects.json", {
      projects: [
        { id: "odd", path: path.join(root, "odd"), addedAt: 1, pinned: "x" },
      ],
    })
    const projects = new Projects(
      path.join(root, "state/projects.json"),
      () => {}
    )
    expect(projects.list(idle)[0]).toMatchObject({ id: "odd", pinned: false })
    projects.close()
  })

  it("forgets the projects that an earlier version only closed", () => {
    write("open/model.json", MANIFEST)
    write("shut/model.json", MANIFEST)
    const file = path.join(root, "state/projects.json")
    const saved = (name: string, extra: object) => ({
      id: name,
      path: path.join(root, name),
      addedAt: 1,
      ...extra,
    })
    write("state/projects.json", {
      projects: [
        saved("open", { sessionId: "session-1" }),
        saved("shut", { closed: true, sessionId: "session-2" }),
      ],
    })
    const projects = new Projects(file, () => {})
    expect(projects.list(idle).map((p) => p.id)).toEqual(["open"])
    expect(projects.add(path.join(root, "shut"))).not.toBe("shut")
    projects.close()
  })

  it("keeps a project whose folder is missing on the list, and has it back when the folder is", () => {
    write("thing/model.json", MANIFEST)
    write("other/model.json", MANIFEST)
    const file = path.join(root, "state/projects.json")
    const first = new Projects(file, () => {})
    const id = first.add(path.join(root, "thing"), { name: "The Thing" })
    const other = first.add(path.join(root, "other"))
    first.close()
    // the app is opened with the folder gone (a drive that is not plugged in, say)
    fs.renameSync(path.join(root, "thing"), path.join(root, "thing-away"))
    const projects = new Projects(file, () => {})
    expect(projects.list(idle).map((p) => [p.id, p.missing ?? false])).toEqual([
      [other, false],
      [id, true],
    ])
    expect(projects.list(idle)[1]).toMatchObject({
      name: "The Thing",
      manifest: null,
    })
    expect(projects.get(id)).toBeNull()
    expect(projects.listed(id)).toMatchObject({
      name: "The Thing",
      missing: true,
    })
    // and it is kept as it was, whatever else is written meanwhile
    projects.rename(other, "Another")
    expect(new Projects(file, () => {}).listed(id)).toMatchObject({
      name: "The Thing",
    })
    fs.renameSync(path.join(root, "thing-away"), path.join(root, "thing"))
    expect(projects.refreshAll()).toBe(true)
    expect(projects.get(id)?.manifest).toBe(path.join(root, "thing/model.json"))
    expect(projects.list(idle)[1]).toMatchObject({ id, manifest: "model.json" })
    expect(projects.list(idle)[1].missing).toBeUndefined()
    expect(projects.refreshAll()).toBe(false)
    fs.renameSync(path.join(root, "thing"), path.join(root, "thing-away"))
    expect(projects.refreshAll()).toBe(true)
    expect(projects.get(id)).toBeNull()
    projects.close()
  })

  it("has a missing folder back on looking for the folders alone, model and all", () => {
    write("thing/model.json", MANIFEST)
    const file = path.join(root, "state/projects.json")
    const id = new Projects(file, () => {}).add(path.join(root, "thing"))
    fs.renameSync(path.join(root, "thing"), path.join(root, "thing-away"))
    const projects = new Projects(file, () => {})
    expect(projects.lookForFolders()).toBe(false)
    fs.renameSync(path.join(root, "thing-away"), path.join(root, "thing"))
    expect(projects.lookForFolders()).toBe(true)
    expect(projects.get(id)?.manifest).toBe(path.join(root, "thing/model.json"))
    expect(projects.ids()).toEqual([id])
    projects.close()
  })

  it("says, on looking again, whether anything of a project's is not as it was", () => {
    write("thing/model.json", MANIFEST)
    const projects = new Projects(
      path.join(root, "state/projects.json"),
      () => {}
    )
    const id = projects.add(path.join(root, "thing"))
    expect(projects.refresh(id)).toBe(false)
    write("thing/model.json", { parts: [] })
    write("thing/out/model.json", MANIFEST)
    expect(projects.refresh(id)).toBe(true)
    expect(projects.refresh(id)).toBe(false)
    write("thing/tools/clock.js", "export default {}")
    expect(projects.refresh(id)).toBe(true)
    expect(projects.refresh(id)).toBe(false)
    expect(projects.refresh("nobody")).toBe(false)
    projects.close()
  })

  it("looks into the folders later, where it is told to, and then into each once", () => {
    write("thing/model.json", MANIFEST)
    const file = path.join(root, "state/projects.json")
    const id = new Projects(file, () => {}).add(path.join(root, "thing"))
    const projects = new Projects(file, () => {}, undefined, { later: true })
    expect(projects.knows(path.join(root, "thing"))).toBe(true)
    expect(projects.get(id)?.manifest).toBeNull()
    projects.locateAll()
    expect(projects.get(id)?.manifest).toBe(path.join(root, "thing/model.json"))
    const revision = projects.list(idle)[0].revision
    projects.locateAll()
    expect(projects.list(idle)[0].revision).toBe(revision)
    projects.close()
  })

  it("takes a missing project's folder, opened again, for that project", () => {
    write("thing/model.json", MANIFEST)
    const file = path.join(root, "state/projects.json")
    const id = new Projects(file, () => {}).add(path.join(root, "thing"))
    fs.renameSync(path.join(root, "thing"), path.join(root, "thing-away"))
    const projects = new Projects(file, () => {})
    fs.renameSync(path.join(root, "thing-away"), path.join(root, "thing"))
    expect(projects.knows(path.join(root, "thing"))).toBe(true)
    expect(projects.add(path.join(root, "thing"))).toBe(id)
    expect(projects.get(id)?.manifest).toBe(path.join(root, "thing/model.json"))
    projects.close()
  })

  it("takes a missing project off the list when asked", () => {
    const file = path.join(root, "state/projects.json")
    fs.mkdirSync(path.join(root, "thing"))
    const id = new Projects(file, () => {}).add(path.join(root, "thing"))
    fs.rmSync(path.join(root, "thing"), { recursive: true })
    const projects = new Projects(file, () => {})
    projects.remove(id)
    expect(projects.listed(id)).toBeNull()
    expect(new Projects(file, () => {}).list(idle)).toEqual([])
  })

  it("moves a list it cannot read aside, and writes nothing over it", () => {
    const file = path.join(root, "state/projects.json")
    write("state/projects.json", '{"projects":[{"id":"a1","path":"/x"')
    const projects = new Projects(file, () => {})
    expect(projects.list(idle)).toEqual([])
    expect(projects.aside).toMatch(/projects\.json\.corrupt-\d+$/)
    fs.mkdirSync(path.join(root, "thing"))
    projects.add(path.join(root, "thing"))
    expect(fs.readFileSync(projects.aside!, "utf8")).toBe(
      '{"projects":[{"id":"a1","path":"/x"'
    )
    // and a first run has nothing to move
    expect(
      new Projects(path.join(root, "none.json"), () => {}).aside
    ).toBeNull()
    projects.close()
  })

  it("keeps the history of the repositories it set up before it kept that itself, once", () => {
    const file = path.join(root, "state/projects.json")
    const marked = "[core]\n\tbare = false\n[enclose]\n\tmanaged = true\n"
    write("old/.git/config", marked)
    write("theirs/.git/config", "[core]\n\tbare = false\n")
    write("state/projects.json", {
      projects: ["old", "theirs"].map((id) => ({
        id,
        path: path.join(root, id),
        addedAt: 1,
      })),
    })
    const projects = new Projects(file, () => {})
    expect(projects.get("old")?.kept).toBe(true)
    expect(projects.get("theirs")?.kept).toBeUndefined()
    // a folder opened after that says the same of itself is not taken at its word
    write("received/.git/config", marked)
    const received = projects.add(path.join(root, "received"))
    projects.close()
    const again = new Projects(file, () => {})
    expect(again.get(received)?.kept).toBeUndefined()
    expect(again.get("old")?.kept).toBe(true)
    again.keep(received)
    expect(new Projects(file, () => {}).get(received)?.kept).toBe(true)
    again.close()
  })

  it("goes by a folder's own settings for Claude Code only once the user trusts them", () => {
    const file = path.join(root, "state/projects.json")
    write("opened/.claude/settings.json", { hooks: {} })
    write("plain/model.py", "")
    write("made/.claude/settings.json", { hooks: {} })
    const projects = new Projects(file, () => {})
    const opened = projects.add(path.join(root, "opened"))
    const plain = projects.add(path.join(root, "plain"))
    const made = projects.add(path.join(root, "made"), { name: "Made" })
    const asking = () =>
      projects
        .list(idle)
        .filter((p) => p.settingsToTrust)
        .map((p) => p.id)
    expect(asking()).toEqual([opened])
    expect(projects.goesByOwnSettings(opened)).toBe(false)
    expect(projects.goesByOwnSettings(plain)).toBe(true)
    expect(projects.goesByOwnSettings(made)).toBe(true)
    write("plain/.mcp.json", { mcpServers: {} })
    expect(projects.goesByOwnSettings(plain)).toBe(false)
    projects.trust(opened, true)
    projects.trust(plain, false)
    expect(asking()).toEqual([])
    const again = new Projects(file, () => {})
    expect(again.goesByOwnSettings(opened)).toBe(true)
    expect(again.goesByOwnSettings(plain)).toBe(false)
    projects.close()
    again.close()
  })

  it("hands over the session of the one conversation a project used to have, once", () => {
    write("thing/model.json", MANIFEST)
    const file = path.join(root, "state/projects.json")
    write("state/projects.json", {
      projects: [
        {
          id: "thing",
          path: path.join(root, "thing"),
          addedAt: 1,
          sessionId: "session-1",
        },
      ],
    })
    const projects = new Projects(file, () => {})
    expect(projects.takeSession("thing")).toBe("session-1")
    expect(projects.takeSession("thing")).toBeNull()
    expect(new Projects(file, () => {}).takeSession("thing")).toBeNull()
    expect(projects.takeSession("no-such-project")).toBeNull()
    projects.close()
  })

  it("clears away a project that came to nothing, and only that", () => {
    const file = path.join(root, "state/projects.json")
    const projects = new Projects(file, () => {})
    const dir = (name: string) => {
      fs.mkdirSync(path.join(root, name), { recursive: true })
      return path.join(root, name)
    }

    // made here and nothing put in it: the folder goes with the project
    const blank = projects.add(dir("made-blank"), { name: "Blank" })
    fs.writeFileSync(path.join(root, "made-blank/.DS_Store"), "")
    projects.remove(blank)
    expect(fs.existsSync(path.join(root, "made-blank"))).toBe(false)

    // made here, and something is in it: kept
    const filled = projects.add(dir("made-filled"), { name: "Filled" })
    write("made-filled/model.py", "")
    projects.remove(filled)
    expect(fs.existsSync(path.join(root, "made-filled/model.py"))).toBe(true)

    // an empty folder of the user's own is never deleted
    const theirs = projects.add(dir("their-empty"))
    projects.remove(theirs)
    expect(fs.existsSync(path.join(root, "their-empty"))).toBe(true)
    expect(projects.list(idle)).toEqual([])
    projects.close()
  })

  it("names a stand-in project after its model, and its folder to match", () => {
    const projects = new Projects(
      path.join(root, "state/projects.json"),
      () => {}
    )
    const start = path.join(root, "2026-10-05-2306-quiet-heron")
    fs.mkdirSync(start)
    const id = projects.add(start, { name: "Quiet heron", standIn: true })
    const moves: string[][] = []
    const christen = () =>
      projects.christen(id, (from, to) => moves.push([from, to]))
    const now = () => projects.list(idle).find((p) => p.id === id)!

    christen()
    expect(now().name).toBe("Quiet heron")

    write("2026-10-05-2306-quiet-heron/build/enclose.model.json", {
      ...MANIFEST,
      title: "  Pill   box ",
    })
    projects.refresh(id)
    const revision = now().revision
    christen()
    expect(now().name).toBe("Pill box")
    expect(path.basename(now().path)).toMatch(
      /^\d{4}-\d\d-\d\d-\d{4}-pill-box$/
    )
    expect(fs.existsSync(start)).toBe(false)
    expect(
      fs.existsSync(path.join(now().path, "build/enclose.model.json"))
    ).toBe(true)
    // the model is the same one, in the same place within the folder: not reloaded
    expect(now().manifest).toBe("build/enclose.model.json")
    expect(now().revision).toBe(revision)
    expect(moves).toEqual([
      [fs.realpathSync(root) + "/2026-10-05-2306-quiet-heron", now().path],
    ])

    write(
      path.relative(root, path.join(now().path, "build/enclose.model.json")),
      {
        ...MANIFEST,
        title: "Something else",
      }
    )
    christen()
    expect(now().name).toBe("Pill box")
    expect(moves).toHaveLength(1)
    projects.close()
  })

  it("never renames a folder the app did not name", () => {
    const projects = new Projects(
      path.join(root, "state/projects.json"),
      () => {}
    )
    write("theirs/model.json", { ...MANIFEST, title: "A title" })
    const id = projects.add(path.join(root, "theirs"))
    projects.christen(id, () => {
      throw new Error("renamed")
    })
    expect(projects.list(idle)[0]).toMatchObject({ name: "theirs" })
    expect(fs.existsSync(path.join(root, "theirs/model.json"))).toBe(true)
    projects.close()
  })

  it("calls a project what the user says, and leaves its folder as it is called", () => {
    const file = path.join(root, "state/projects.json")
    let said = 0
    const projects = new Projects(file, () => said++)
    write("theirs/model.json", MANIFEST)
    const id = projects.add(path.join(root, "theirs"))
    const now = () => projects.list(idle).find((p) => p.id === id)!
    const before = said
    projects.rename(id, "  Travel   case ")
    expect(now().name).toBe("Travel case")
    expect(now().path).toBe(path.join(root, "theirs"))
    expect(said).toBe(before + 1)
    projects.rename(id, "   ")
    projects.rename(id, "Travel case")
    expect(now().name).toBe("Travel case")
    expect(said).toBe(before + 1)
    projects.rename(id, "a".repeat(200))
    expect(now().name).toHaveLength(80)
    projects.close()
    const again = new Projects(file, () => {})
    expect(again.list(idle)[0]).toMatchObject({ name: "a".repeat(80) })
    again.close()
  })

  it("keeps the name the user gave a project that went by a stand-in", () => {
    const projects = new Projects(
      path.join(root, "state/projects.json"),
      () => {}
    )
    const start = path.join(root, "2026-10-05-2306-quiet-heron")
    fs.mkdirSync(start)
    const id = projects.add(start, { name: "Quiet heron", standIn: true })
    projects.rename(id, "Travel case")
    expect(projects.get(id)).toMatchObject({ name: "Travel case" })
    expect(projects.get(id)?.standIn).toBeUndefined()
    write("2026-10-05-2306-quiet-heron/build/enclose.model.json", {
      ...MANIFEST,
      title: "Pill box",
    })
    projects.refresh(id)
    projects.christen(id, () => {
      throw new Error("renamed")
    })
    expect(projects.list(idle)[0]).toMatchObject({
      name: "Travel case",
      path: start,
    })
    projects.close()
  })

  it("renames a stand-in project's folder to the name the user gives it, where it may", () => {
    const projects = new Projects(
      path.join(root, "state/projects.json"),
      () => {}
    )
    const start = path.join(root, "2026-10-05-2306-quiet-heron")
    fs.mkdirSync(start)
    const id = projects.add(start, { name: "Quiet heron", standIn: true })
    const moves: string[][] = []
    projects.rename(id, "Travel case", (from, to) => moves.push([from, to]))
    const now = projects.get(id)!
    expect(now.name).toBe("Travel case")
    expect(path.basename(now.path)).toMatch(
      /^\d{4}-\d\d-\d\d-\d{4}-travel-case$/
    )
    expect(fs.existsSync(start)).toBe(false)
    expect(fs.existsSync(now.path)).toBe(true)
    expect(moves).toEqual([
      [fs.realpathSync(root) + "/2026-10-05-2306-quiet-heron", now.path],
    ])

    projects.rename(id, "Pill box", () => {
      throw new Error("renamed")
    })
    expect(projects.get(id)).toMatchObject({ name: "Pill box", path: now.path })

    // and with something at work in it (nobody to hear of a move), it is left too
    const busy = path.join(root, "2026-10-05-2307-calm-otter")
    fs.mkdirSync(busy)
    const other = projects.add(busy, { name: "Calm otter", standIn: true })
    projects.rename(other, "Desk lamp")
    expect(projects.get(other)).toMatchObject({ name: "Desk lamp", path: busy })
    projects.close()
  })

  it("does not take a folder for its own making because it was given a name", () => {
    const projects = new Projects(
      path.join(root, "state/projects.json"),
      () => {}
    )
    fs.mkdirSync(path.join(root, "theirs"))
    const id = projects.add(path.join(root, "theirs"))
    projects.rename(id, "Mine")
    projects.remove(id)
    expect(fs.existsSync(path.join(root, "theirs"))).toBe(true)
    projects.close()
  })
})

describe("folderSize", () => {
  it("adds up every file, however deep", async () => {
    write("a.txt", "12345")
    write("one/b.txt", "123")
    write("one/two/c.txt", "12")
    expect(await folderSize(root)).toBe(10)
  })

  it("counts a link as itself, not as what it points at", async () => {
    write("big.txt", "x".repeat(1000))
    fs.symlinkSync(path.join(root, "big.txt"), path.join(root, "link"))
    const link = fs.lstatSync(path.join(root, "link")).size
    expect(await folderSize(root)).toBe(1000 + link)
  })

  it("is nothing for a folder that is empty, or not there", async () => {
    expect(await folderSize(root)).toBe(0)
    expect(await folderSize(path.join(root, "nowhere"))).toBe(0)
  })
})

describe("folderName", () => {
  const made = new Date(2026, 9, 5, 23, 6)

  it("puts when it was made first, then the name in lower case with dashes", () => {
    expect(folderName("Pill box", made)).toBe("2026-10-05-2306-pill-box")
    expect(folderName("  Desk   Clamp v2!  ", made)).toBe(
      "2026-10-05-2306-desk-clamp-v2"
    )
  })

  it("keeps nothing a folder name should not have", () => {
    expect(folderName("../odd:name/", made)).toBe("2026-10-05-2306-odd-name")
    expect(folderName("Café holder №2", made)).toBe(
      "2026-10-05-2306-cafe-holder-no2"
    )
  })

  it("keeps letters of other scripts, and has a name when given none", () => {
    expect(folderName("箱 1", made)).toBe("2026-10-05-2306-箱-1")
    expect(folderName("", made)).toBe("2026-10-05-2306-untitled")
    expect(folderName("!!!", made)).toBe("2026-10-05-2306-untitled")
  })
})

describe("Projects, of files being made a model of", () => {
  it("lists a project as being read from the first, then as what came of it", () => {
    let told = 0
    const projects = new Projects(path.join(root, "state.json"), () => told++)
    const dir = path.join(root, "made")
    fs.mkdirSync(dir)
    const id = projects.add(dir, { name: "Made", reading: true })
    const now = () => projects.list(() => []).find((p) => p.id === id)!
    expect(now().bringingIn).toEqual({ state: "working", done: 0, total: null })

    projects.report(id, { state: "working", done: 3, total: 7 })
    expect(now().bringingIn).toEqual({ state: "working", done: 3, total: 7 })

    // the build is through: its model is found without being looked for again
    write("made/build/enclose.model.json", MANIFEST)
    const before = told
    projects.report(id, null)
    expect(now()).toMatchObject({
      bringingIn: null,
      manifest: path.join("build", "enclose.model.json"),
    })
    expect(told).toBe(before + 1)
    projects.close()
  })
})

describe("Projects, of a model Claude is to look over", () => {
  const written = { title: "Made", files: ["source/made.step"] }

  it("waits to be looked over only once there is a model, and until it has been", () => {
    const file = path.join(root, "state.json")
    const projects = new Projects(file, () => {})
    const dir = path.join(root, "made")
    fs.mkdirSync(dir)
    const id = projects.add(dir, {
      name: "Made",
      reading: true,
      lookOver: written,
    })
    const now = () => projects.list(() => []).find((p) => p.id === id)!
    expect(now().lookOver).toBeNull()
    write("made/build/enclose.model.json", MANIFEST)
    projects.report(id, null)
    expect(now().lookOver).toBe("wanted")
    projects.close()

    const again = new Projects(file, () => {})
    expect(again.list(() => [])[0].lookOver).toBe("wanted")
    expect(again.get(id)?.lookOver).toEqual(written)

    let told = 0
    const last = new Projects(file, () => told++)
    expect(last.lookedOver(id)).toEqual(written)
    expect(told).toBe(1)
    expect(last.list(() => [])[0].lookOver).toBeNull()
    expect(last.lookedOver(id)).toBeNull()
    expect(told).toBe(1)
    expect(new Projects(file, () => {}).get(id)?.lookOver).toBeUndefined()
    again.close()
    last.close()
  })

  it("asks it of no project that was not made of files", () => {
    const projects = new Projects(path.join(root, "state.json"), () => {})
    write("theirs/enclose.model.json", MANIFEST)
    const id = projects.add(path.join(root, "theirs"))
    expect(projects.list(() => [])[0].lookOver).toBeNull()
    expect(projects.lookedOver(id)).toBeNull()
    projects.close()
  })
})

describe("standInName", () => {
  it("is two plain words", async () => {
    const { standInName } = await import("./names")
    for (let i = 0; i < 50; i++)
      expect(standInName()).toMatch(/^[A-Z][a-z]+ [a-z]+$/)
  })
})
