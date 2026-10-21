import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Changes } from "./changes"
import { Locks } from "./locks"
import { Versions } from "./versions"

let dir: string
let folder: string
let kept: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-versions-"))
  folder = path.join(dir, "project")
  kept = path.join(dir, "kept")
  fs.mkdirSync(folder)
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

let clock = 1_700_000_000
/** Write a file of the project's, as a turn would: later than whatever was there. */
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

describe("Versions", () => {
  beforeEach(() => {
    write("model.py", "box(10)")
    write("build/model.json", '{"parts":["lid"]}')
    write("build/lid.glb", "LID")
  })

  it("is nobody's to begin with, and the first conversation's as it stands", async () => {
    const versions = new Versions(kept)
    expect(versions.on("p1")).toBeNull()
    expect(await versions.turnTo("p1", "a", folder)).toEqual({
      from: null,
      to: "a",
      restored: false,
    })
    expect(versions.on("p1")).toBe("a")
    expect(read("model.py")).toBe("box(10)")
    expect(await versions.turnTo("p1", "a", folder)).toBeNull()
  })

  it("begins a new conversation from where the one before had got to", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    write("model.py", "box(20)")
    expect(await versions.turnTo("p1", "b", folder)).toEqual({
      from: "a",
      to: "b",
      restored: false,
    })
    expect(read("model.py")).toBe("box(20)")
  })

  it("puts the folder as each conversation left it", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    write("model.py", "sphere(5)")
    write("build/ball.glb", "BALL")
    fs.rmSync(path.join(folder, "build/lid.glb"))

    expect(await versions.turnTo("p1", "a", folder)).toEqual({
      from: "b",
      to: "a",
      restored: true,
    })
    expect(read("model.py")).toBe("box(10)")
    expect(read("build/lid.glb")).toBe("LID")
    expect(read("build/ball.glb")).toBeNull()

    write("notes/idea.txt", "taller")
    await versions.turnTo("p1", "b", folder)
    expect(read("model.py")).toBe("sphere(5)")
    expect(read("build/lid.glb")).toBeNull()
    expect(read("build/ball.glb")).toBe("BALL")
    expect(read("notes/idea.txt")).toBeNull()
    expect(fs.existsSync(path.join(folder, "notes"))).toBe(false)

    await versions.turnTo("p1", "a", folder)
    expect(read("notes/idea.txt")).toBe("taller")
  })

  it("leaves alone what is not the project's own", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    write(".git/HEAD", "ref: refs/heads/main")
    write("node_modules/thing/index.js", "thing")
    await versions.turnTo("p1", "a", folder)
    expect(read(".git/HEAD")).toBe("ref: refs/heads/main")
    expect(read("node_modules/thing/index.js")).toBe("thing")
  })

  it("does not write a file that is as it was left", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    write("model.py", "sphere(5)")
    const lid = path.join(folder, "build/lid.glb")
    const before = fs.statSync(lid)
    await versions.turnTo("p1", "a", folder)
    const after = fs.statSync(lid)
    expect(after.ino).toBe(before.ino)
    expect(after.mtimeMs).toBe(before.mtimeMs)
  })

  it("writes the file it was told to see to last after all the others", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    write("build/model.json", '{"parts":["ball"]}')
    write("build/zz.glb", "ZZ")
    write("model.py", "sphere(5)")
    await versions.turnTo("p1", "a", folder)
    write("build/model.json", '{"parts":["lid","base"]}')
    write("model.py", "box(30)")
    await versions.turnTo("p1", "b", folder, {
      kept: true,
      last: "build/model.json",
    })
    const written = (file: string) =>
      fs.statSync(path.join(folder, file), { bigint: true }).ctimeNs
    expect(written("build/model.json") >= written("model.py")).toBe(true)
    expect(written("build/model.json") >= written("build/zz.glb")).toBe(true)
  })

  it("copies nothing where versions are not kept, and follows the conversation shown", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    write("model.py", "sphere(5)")
    expect(await versions.turnTo("p1", "a", folder, { kept: false })).toEqual({
      from: "b",
      to: "a",
      restored: false,
    })
    expect(read("model.py")).toBe("sphere(5)")
    write("model.py", "sphere(6)")
    await versions.turnTo("p1", "c", folder, { kept: false })
    expect(read("model.py")).toBe("sphere(6)")
    // switched on again: the folder is the one shown's, and the copy made of another
    // before is as it was made
    write("model.py", "sphere(7)")
    await versions.turnTo("p1", "a", folder)
    expect(read("model.py")).toBe("box(10)")
    await versions.turnTo("p1", "c", folder)
    expect(read("model.py")).toBe("sphere(7)")
  })

  it("remembers whose the folder is the next time the app is opened", async () => {
    const first = new Versions(kept)
    await first.turnTo("p1", "a", folder)
    await first.turnTo("p1", "b", folder)
    write("model.py", "sphere(5)")
    const second = new Versions(kept)
    expect(second.on("p1")).toBe("b")
    await second.turnTo("p1", "a", folder)
    expect(read("model.py")).toBe("box(10)")
  })

  it("sees through a turning the app was quit in the middle of, and copies nothing of the half of it", async () => {
    const first = new Versions(kept)
    await first.turnTo("p1", "a", folder)
    await first.turnTo("p1", "b", folder)
    write("model.py", "sphere(5)")
    await first.turnTo("p1", "a", folder)
    // quit while the folder was being put as the second has it: one file was, one not
    fs.writeFileSync(
      path.join(kept, "p1", "index.json"),
      JSON.stringify({ on: "a", turning: "b" })
    )
    write("model.py", "sphere(5)")
    write("build/half.glb", "HALF")

    const second = new Versions(kept)
    expect(await second.turnTo("p1", "b", folder)).toEqual({
      from: "a",
      to: "b",
      restored: true,
    })
    expect(read("model.py")).toBe("sphere(5)")
    expect(read("build/half.glb")).toBeNull()
    await second.turnTo("p1", "a", folder)
    expect(read("model.py")).toBe("box(10)")
    expect(read("build/half.glb")).toBeNull()
  })

  it("does not take a folder it cannot read for an empty one, and stays the conversation's it was", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    write("model.py", "sphere(5)")
    // the folder is not there for a while (a drive that is not plugged in, say)
    const away = `${folder}-away`
    fs.renameSync(folder, away)
    await expect(versions.turnTo("p1", "a", folder)).rejects.toThrow(
      /could not be copied aside/
    )
    expect(versions.on("p1")).toBe("b")
    fs.renameSync(away, folder)
    expect(read("model.py")).toBe("sphere(5)")
    await versions.turnTo("p1", "a", folder)
    expect(read("model.py")).toBe("box(10)")
    await versions.turnTo("p1", "b", folder)
    expect(read("model.py")).toBe("sphere(5)")
  })

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "says when a folder could not be put as a conversation left it, and puts it so the next time",
    async () => {
      const versions = new Versions(kept)
      await versions.turnTo("p1", "a", folder)
      await versions.turnTo("p1", "b", folder)
      write("build/lid.glb", "ROUND LID")
      write("build/ball.glb", "BALL")
      fs.chmodSync(path.join(folder, "build"), 0o555)
      try {
        await expect(versions.turnTo("p1", "a", folder)).rejects.toThrow(
          /could not be put as this conversation left it/
        )
        expect(versions.on("p1")).toBe("b")
      } finally {
        fs.chmodSync(path.join(folder, "build"), 0o755)
      }
      expect(await versions.turnTo("p1", "a", folder)).toEqual({
        from: "b",
        to: "a",
        restored: true,
      })
      expect(read("build/lid.glb")).toBe("LID")
      expect(read("build/ball.glb")).toBeNull()
      await versions.turnTo("p1", "b", folder)
      expect(read("build/lid.glb")).toBe("ROUND LID")
      expect(read("build/ball.glb")).toBe("BALL")
    }
  )

  it("does not empty a folder for a copy with nothing in it that does not say it was made so", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    // a copy as an earlier version could make it, of a folder it could not read
    const copied = path.join(kept, "p1", "a")
    fs.rmSync(copied, { recursive: true })
    fs.mkdirSync(path.join(copied, "files"), { recursive: true })
    fs.writeFileSync(path.join(copied, "stood.json"), "{}")
    expect(await versions.turnTo("p1", "a", folder)).toEqual({
      from: "b",
      to: "a",
      restored: false,
    })
    expect(read("model.py")).toBe("box(10)")
    expect(versions.on("p1")).toBe("a")
  })

  it("empties a folder for a conversation that left it with nothing in it", async () => {
    fs.rmSync(folder, { recursive: true })
    fs.mkdirSync(folder)
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    write("model.py", "box(10)")
    await versions.turnTo("p1", "a", folder)
    expect(read("model.py")).toBeNull()
  })

  it("waits for a change being taken back in the folder, holding the same lock", async () => {
    const locks = new Locks()
    const versions = new Versions(kept, locks)
    const changes = new Changes(path.join(dir, "changes"), locks)
    await versions.turnTo("p1", "a", folder)
    const pending = await changes.before("p1", folder)
    write("model.py", "box(20)")
    await changes.after(pending!, folder, {
      conversationId: "a",
      what: "Taller",
    })
    const done: string[] = []
    const undoing = changes.undo("p1", folder, null, "a").then((outcome) => {
      done.push("undone")
      return outcome
    })
    const turning = versions.turnTo("p1", "b", folder).then(() => {
      done.push("turned")
    })
    await Promise.all([undoing, turning])
    expect(done).toEqual(["undone", "turned"])
    // the change was taken back in a's version, which b began from
    expect(read("model.py")).toBe("box(10)")
  })

  it("is busy for as long as a folder is being put another way", async () => {
    const versions = new Versions(kept)
    const turning = versions.turnTo("p1", "a", folder)
    expect(versions.busy("p1")).toBe(true)
    await turning
    expect(versions.busy("p1")).toBe(false)
  })

  it("takes nothing that could lead out of where the copies are kept for a conversation", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    expect(await versions.turnTo("p1", "../elsewhere", folder)).toBeNull()
    expect(versions.on("p1")).toBe("a")
  })

  it("keeps nothing of a project that is taken off the list", async () => {
    const versions = new Versions(kept)
    await versions.turnTo("p1", "a", folder)
    await versions.turnTo("p1", "b", folder)
    versions.forget("p1")
    expect(fs.existsSync(path.join(kept, "p1"))).toBe(false)
    expect(versions.on("p1")).toBeNull()
  })
})
