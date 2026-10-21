import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Changes, eachOf, tookOf } from "./changes"

let dir: string
let folder: string
let kept: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-changes-"))
  folder = path.join(dir, "project")
  kept = path.join(dir, "kept")
  fs.mkdirSync(folder)
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Write a file of the project's, as a turn would: later than whatever was there. */
let clock = 1_700_000_000
function write(file: string, text: string) {
  const at = path.join(folder, file)
  fs.mkdirSync(path.dirname(at), { recursive: true })
  fs.writeFileSync(at, text)
  clock += 10
  fs.utimesSync(at, clock, clock)
}
const read = (file: string) => {
  try {
    return fs.readFileSync(path.join(folder, file), "utf8")
  } catch {
    return null
  }
}
const about = (what: string, conversationId = "c1") => ({
  conversationId,
  what,
})

/** A turn: the folder copied aside, something done in it, and what came of that kept. */
async function turn(changes: Changes, what: string, work: () => void) {
  const pending = await changes.before("p1", folder)
  if (!pending) throw new Error("not copied aside")
  work()
  return changes.after(pending, folder, about(what))
}

describe("Changes", () => {
  beforeEach(() => {
    write("model.py", "box(10)")
    write("build/model.json", '{"parts":["lid"]}')
    write("build/lid.glb", "LID")
    write("notes.txt", "keep me")
  })

  it("keeps what a turn wrote to, made and took away, and nothing it left alone", async () => {
    const changes = new Changes(kept)
    const change = await turn(changes, "Make it taller", () => {
      write("model.py", "box(20)")
      write("build/lid.glb", "TALLER LID")
      write("build/base.glb", "BASE")
      // written again by the build, with what was in it already
      write("build/model.json", '{"parts":["lid"]}')
      fs.rmSync(path.join(folder, "notes.txt"))
    })
    expect(change?.what).toBe("Make it taller")
    expect(change?.files.map((file) => file.path).sort()).toEqual([
      path.join("build", "base.glb"),
      path.join("build", "lid.glb"),
      "model.py",
      "notes.txt",
    ])
    expect(changes.last("p1").undo?.id).toBe(change?.id)
    expect(changes.last("p1").redo).toBeNull()
  })

  it("knows how long the turn took, from the folder being put aside to the end", async () => {
    const changes = new Changes(kept)
    const pending = await changes.before("p1", folder)
    vi.useFakeTimers({ now: Date.now() + 90_000, toFake: ["Date"] })
    try {
      write("model.py", "box(20)")
      const change = await changes.after(pending!, folder, about("Taller"))
      expect(tookOf(change!)).toBeGreaterThanOrEqual(90_000)
      expect(tookOf(change!)).toBeLessThan(100_000)
    } finally {
      vi.useRealTimers()
    }
    // and of one kept before it was, it does not know
    expect(tookOf({ ...changes.last("p1").undo!, since: undefined })).toBeNull()
  })

  it("takes a change back, and puts it back again", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Make it taller", () => {
      write("model.py", "box(20)")
      write("build/lid.glb", "TALLER LID")
      write("build/extra/base.glb", "BASE")
      fs.rmSync(path.join(folder, "notes.txt"))
    })

    const undone = await changes.undo("p1", folder)
    expect(undone.ok).toBe(true)
    expect(read("model.py")).toBe("box(10)")
    expect(read("build/lid.glb")).toBe("LID")
    expect(read("notes.txt")).toBe("keep me")
    expect(read("build/extra/base.glb")).toBeNull()
    expect(fs.existsSync(path.join(folder, "build", "extra"))).toBe(false)
    expect(changes.last("p1").undo).toBeNull()
    expect(changes.last("p1").redo?.what).toBe("Make it taller")

    const redone = await changes.redo("p1", folder)
    expect(redone.ok).toBe(true)
    expect(read("model.py")).toBe("box(20)")
    expect(read("build/lid.glb")).toBe("TALLER LID")
    expect(read("build/extra/base.glb")).toBe("BASE")
    expect(read("notes.txt")).toBeNull()
    expect(changes.last("p1").undo?.what).toBe("Make it taller")
  })

  it("takes changes back one at a time, the latest first", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => write("model.py", "box(20)"))
    await turn(changes, "Wider", () => write("model.py", "box(20, 30)"))
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(20)")
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(10)")
    expect(await changes.undo("p1", folder)).toEqual({
      ok: false,
      why: "nothing",
      files: [],
    })
    expect((await changes.redo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(20)")
    expect((await changes.redo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(20, 30)")
  })

  it("keeps nothing of a turn that changed nothing", async () => {
    const changes = new Changes(kept)
    expect(await turn(changes, "What is this?", () => {})).toBeNull()
    expect(changes.last("p1").undo).toBeNull()
    expect(
      fs.readdirSync(path.join(kept, "p1")).filter((n) => n !== "index.json")
    ).toEqual([])
  })

  it("does not write over a file that has been changed since the turn", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => {
      write("model.py", "box(20)")
      write("build/lid.glb", "TALLER LID")
    })
    write("model.py", "box(20)  # and a note of my own")
    expect(await changes.undo("p1", folder)).toEqual({
      ok: false,
      why: "changed",
      files: ["model.py"],
    })
    expect(read("model.py")).toBe("box(20)  # and a note of my own")
    expect(read("build/lid.glb")).toBe("TALLER LID")
    expect(changes.last("p1").undo?.what).toBe("Taller")
  })

  it("does not put a change back over something done since it was taken back", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => write("model.py", "box(20)"))
    await changes.undo("p1", folder)
    write("model.py", "box(12)")
    expect(await changes.redo("p1", folder)).toEqual({
      ok: false,
      why: "changed",
      files: ["model.py"],
    })
    expect(read("model.py")).toBe("box(12)")
  })

  it("lets go of what was taken back once a turn has changed something since", async () => {
    const changes = new Changes(kept)
    const first = await turn(changes, "Taller", () =>
      write("model.py", "box(20)")
    )
    await changes.undo("p1", folder)
    await turn(changes, "Wider", () => write("model.py", "box(10, 30)"))
    expect(changes.last("p1").redo).toBeNull()
    expect(changes.last("p1").undo?.what).toBe("Wider")
    expect(fs.existsSync(path.join(kept, "p1", first!.id))).toBe(false)
  })

  it("leaves alone what is not the project's own, and does not copy it", async () => {
    write(".git/HEAD", "ref: main")
    write("node_modules/three/index.js", "three")
    write("env/pyvenv.cfg", "home = /usr/bin")
    write("env/lib/site.py", "site")
    const changes = new Changes(kept)
    const change = await turn(changes, "Taller", () => {
      write("model.py", "box(20)")
      write(".git/HEAD", "ref: other")
      write("env/lib/site.py", "changed")
    })
    expect(change?.files.map((file) => file.path)).toEqual(["model.py"])
    await changes.undo("p1", folder)
    expect(read(".git/HEAD")).toBe("ref: other")
    expect(read("env/lib/site.py")).toBe("changed")
  })

  it("leaves the inspiration board alone at the top of the folder, and only there", async () => {
    write("inspiration/board.json", "{}")
    write("parts/inspiration/notes.txt", "a")
    const changes = new Changes(kept)
    const change = await turn(changes, "Taller", () => {
      write("model.py", "box(20)")
      write("inspiration/board.json", '{"images": []}')
      write("parts/inspiration/notes.txt", "b")
    })
    expect(change?.files.map((file) => file.path).sort()).toEqual([
      "model.py",
      path.join("parts", "inspiration", "notes.txt"),
    ])
    await changes.undo("p1", folder)
    expect(read("inspiration/board.json")).toBe('{"images": []}')
    expect(read("parts/inspiration/notes.txt")).toBe("a")
  })

  it("takes back and puts back a file that became a folder, and a folder that became a file", async () => {
    const changes = new Changes(kept)
    write("parts/lid.py", "lid()")
    await turn(changes, "Folders to files", () => {
      fs.rmSync(path.join(folder, "parts"), { recursive: true })
      write("parts", "lid() and base()")
      fs.rmSync(path.join(folder, "notes.txt"))
      write("notes.txt/today.txt", "keep me, in a folder")
    })
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect(read("parts/lid.py")).toBe("lid()")
    expect(read("notes.txt")).toBe("keep me")
    expect((await changes.redo("p1", folder)).ok).toBe(true)
    expect(read("parts")).toBe("lid() and base()")
    expect(read("notes.txt/today.txt")).toBe("keep me, in a folder")
  })

  it("keeps what was done from one run of the app to the next", async () => {
    await turn(new Changes(kept), "Taller", () => write("model.py", "box(20)"))
    const again = new Changes(kept)
    expect(again.last("p1").undo?.what).toBe("Taller")
    expect((await again.undo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(10)")
    expect(new Changes(kept).last("p1").redo?.what).toBe("Taller")
  })

  it("keeps only so many, and lets the oldest go", async () => {
    const changes = new Changes(kept)
    for (let n = 0; n < 14; n++)
      await turn(changes, `Change ${n}`, () => write("model.py", `box(${n})`))
    let taken = 0
    while ((await changes.undo("p1", folder)).ok) taken++
    expect(taken).toBe(12)
    expect(read("model.py")).toBe("box(1)")
  })

  it("says what Claude is to be told, once, and what has been put back since", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => write("model.py", "box(20)"))
    expect(changes.toTell("p1", "c1")).toEqual({ undone: [], redone: [] })
    await changes.undo("p1", folder)
    // not in a conversation the turn was no part of
    expect(changes.toTell("p1", "c2")).toEqual({ undone: [], redone: [] })
    expect(changes.toTell("p1", "c1")).toEqual({
      undone: ["Taller"],
      redone: [],
    })
    expect(changes.toTell("p1", "c1")).toEqual({ undone: [], redone: [] })
    await changes.redo("p1", folder)
    expect(changes.toTell("p1", "c1")).toEqual({
      undone: [],
      redone: ["Taller"],
    })
    expect(changes.toTell("p1", "c1")).toEqual({ undone: [], redone: [] })
  })

  it("has nothing to tell of a change taken back and put back before anything was said", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => write("model.py", "box(20)"))
    await changes.undo("p1", folder)
    await changes.redo("p1", folder)
    expect(changes.toTell("p1", "c1")).toEqual({ undone: [], redone: [] })
  })

  it("sees to the file it is told to last", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => {
      write("build/model.json", '{"parts":["lid","base"]}')
      write("build/lid.glb", "TALLER LID")
      write("model.py", "box(20)")
    })
    await changes.undo("p1", folder, path.join("build", "model.json"))
    const written = (file: string) =>
      fs.statSync(path.join(folder, file)).mtimeMs
    expect(written("build/model.json")).toBeGreaterThanOrEqual(
      written("build/lid.glb")
    )
    expect(written("build/model.json")).toBeGreaterThanOrEqual(
      written("model.py")
    )
  })

  it("lets go of a copy put aside for a turn the app was quit in the middle of", async () => {
    const first = new Changes(kept)
    await turn(first, "Taller", () => write("model.py", "box(20)"))
    const left = await first.before("p1", folder)
    expect(fs.existsSync(path.join(kept, "p1", left!.id))).toBe(true)
    // the app comes up again, with that turn never having come to an end
    const again = new Changes(kept)
    expect(again.last("p1").undo?.what).toBe("Taller")
    expect(fs.existsSync(path.join(kept, "p1", left!.id))).toBe(false)
    expect((await again.undo("p1", folder)).ok).toBe(true)
  })

  it("lets go of none of the copies where what says which is which cannot be read", async () => {
    const first = new Changes(kept)
    await turn(first, "Taller", () => write("model.py", "box(20)"))
    const [id] = fs
      .readdirSync(path.join(kept, "p1"))
      .filter((name) => name !== "index.json")
    // cut short, as by the machine going off while it was written
    fs.writeFileSync(path.join(kept, "p1", "index.json"), '{"done":[{"id"')
    const again = new Changes(kept)
    expect(again.last("p1").undo).toBeNull()
    const [aside] = fs
      .readdirSync(kept)
      .filter((name) => name.startsWith("p1.corrupt-"))
    expect(fs.existsSync(path.join(kept, aside, id))).toBe(true)
    expect(fs.readFileSync(path.join(kept, aside, "index.json"), "utf8")).toBe(
      '{"done":[{"id"'
    )
    await turn(again, "Wider", () => write("model.py", "box(30)"))
    expect(new Changes(kept).last("p1").undo?.what).toBe("Wider")
  })

  it("writes what it keeps whole, leaving nothing beside it", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => write("model.py", "box(20)"))
    expect(
      fs
        .readdirSync(path.join(kept, "p1"))
        .filter((name) => name.includes(".tmp-"))
    ).toEqual([])
  })

  it("does not take the copy for a turn under way for one left behind", async () => {
    const changes = new Changes(kept)
    const pending = await changes.before("p1", folder)
    // the project is looked at for the first time while the turn is going on
    expect(changes.last("p1").undo).toBeNull()
    write("model.py", "box(20)")
    expect((await changes.after(pending!, folder, about("Taller")))?.what).toBe(
      "Taller"
    )
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(10)")
  })

  it("takes back only a conversation's own turns, where the folder is that conversation's alone", async () => {
    const changes = new Changes(kept)
    const turnOf = async (id: string, what: string, work: () => void) => {
      const pending = await changes.before("p1", folder)
      work()
      return changes.after(pending!, folder, about(what, id), id)
    }
    await turnOf("c1", "Taller", () => write("model.py", "box(20)"))
    await turnOf("c2", "A note", () => write("notes.txt", "other"))
    expect(changes.last("p1").undo?.what).toBe("A note")
    expect(changes.last("p1", "c1").undo?.what).toBe("Taller")

    expect((await changes.undo("p1", folder, null, "c1")).ok).toBe(true)
    expect(read("model.py")).toBe("box(10)")
    expect(read("notes.txt")).toBe("other")
    expect(changes.last("p1", "c1").undo).toBeNull()
    expect(changes.last("p1", "c1").redo?.what).toBe("Taller")
    expect(changes.last("p1", "c2").undo?.what).toBe("A note")
    expect(changes.last("p1", "c2").redo).toBeNull()

    // what another does since is not something it cannot be put back over
    await turnOf("c2", "More", () => write("notes.txt", "more"))
    expect(changes.last("p1", "c1").redo?.what).toBe("Taller")
    expect((await changes.redo("p1", folder, null, "c1")).ok).toBe(true)
    expect(read("model.py")).toBe("box(20)")
    expect(read("notes.txt")).toBe("more")
  })

  it("keeps as many turns for each conversation, where the folder is each one's alone", async () => {
    const changes = new Changes(kept)
    const turnOf = async (id: string, n: number) => {
      const pending = await changes.before("p1", folder)
      write("model.py", `box(${id}, ${n})`)
      return changes.after(pending!, folder, about(`${id} ${n}`, id), id)
    }
    await turnOf("c1", 0)
    for (let n = 0; n < 14; n++) await turnOf("c2", n)
    expect(changes.last("p1", "c1").undo?.what).toBe("c1 0")
    let taken = 0
    while ((await changes.undo("p1", folder, null, "c2")).ok) taken++
    expect(taken).toBe(12)
  })

  it("forgets a project that is taken off the list", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => write("model.py", "box(20)"))
    changes.forget("p1")
    expect(changes.last("p1").undo).toBeNull()
    expect(fs.existsSync(path.join(kept, "p1"))).toBe(false)
    expect(fs.existsSync(path.join(kept, "p1.latest"))).toBe(false)
  })

  it("copies aside before a turn only what was written to since the last, and links to the rest", async () => {
    const changes = new Changes(kept)
    await turn(changes, "Taller", () => write("model.py", "box(20)"))
    // written to by hand in between
    write("notes.txt", "and me")
    const pending = await changes.before("p1", folder)
    const inode = (at: string) => fs.statSync(at).ino
    const aside = (file: string) =>
      path.join(kept, "p1", pending!.id, "before", file)
    const latest = (file: string) =>
      path.join(kept, "p1.latest", "folder", file)
    // the same file as the one kept as the last turn left it, where it stands the same
    expect(inode(aside("build/lid.glb"))).toBe(inode(latest("build/lid.glb")))
    expect(inode(aside("model.py"))).toBe(inode(latest("model.py")))
    // and a copy of its own where it was written to since
    expect(inode(aside("notes.txt"))).not.toBe(inode(latest("notes.txt")))
    expect(fs.readFileSync(aside("notes.txt"), "utf8")).toBe("and me")
    expect(fs.readFileSync(aside("model.py"), "utf8")).toBe("box(20)")
    write("model.py", "box(30)")
    write("notes.txt", "and you")
    await changes.after(pending!, folder, about("Wider"))
    // taken back, it is as it was before that turn, hand and all
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(20)")
    expect(read("notes.txt")).toBe("and me")
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(10)")
  })

  it("takes back turn after turn as each left it, with what each linked to kept apart", async () => {
    const changes = new Changes(kept)
    await turn(changes, "One", () => write("model.py", "box(20)"))
    await turn(changes, "Two", () => {
      write("build/lid.glb", "LID 2")
      fs.rmSync(path.join(folder, "notes.txt"))
    })
    await turn(changes, "Three", () => {
      write("model.py", "box(30)")
      write("build/base.glb", "BASE")
    })
    expect(
      fs.readdirSync(path.join(kept, "p1", changes.last("p1").undo!.id)).sort()
    ).toEqual(["after", "before"])
    expect(read("model.py")).toBe("box(30)")
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect([read("model.py"), read("build/base.glb")]).toEqual([
      "box(20)",
      null,
    ])
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect([read("build/lid.glb"), read("notes.txt")]).toEqual([
      "LID",
      "keep me",
    ])
    expect((await changes.undo("p1", folder)).ok).toBe(true)
    expect(read("model.py")).toBe("box(10)")
    for (let n = 0; n < 3; n++)
      expect((await changes.redo("p1", folder)).ok).toBe(true)
    expect([
      read("model.py"),
      read("build/lid.glb"),
      read("build/base.glb"),
      read("notes.txt"),
    ]).toEqual(["box(30)", "LID 2", "BASE", null])
  })
})

describe("eachOf", () => {
  it("does each, no more than so many at once", async () => {
    let now = 0
    let most = 0
    const done: number[] = []
    await eachOf(
      [1, 2, 3, 4, 5, 6, 7],
      async (n) => {
        most = Math.max(most, ++now)
        await new Promise((resolve) => setTimeout(resolve, 2))
        done.push(n)
        now--
      },
      3
    )
    expect(most).toBe(3)
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("begins nothing more once something went wrong, and says what, once the rest is over", async () => {
    const begun: number[] = []
    let over = 0
    const going = eachOf(
      [1, 2, 3, 4, 5],
      async (n) => {
        begun.push(n)
        await new Promise((resolve) => setTimeout(resolve, n === 1 ? 1 : 5))
        over++
        if (n === 1) throw new Error("no room")
      },
      2
    )
    await expect(going).rejects.toThrow("no room")
    expect(begun).toEqual([1, 2])
    expect(over).toBe(2)
  })
})
