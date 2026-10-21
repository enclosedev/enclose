import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Projects } from "./projects"
import { appScenes, findReference, readScene } from "./reference"

let root: string
const write = (file: string, content: unknown) => {
  const full = path.join(root, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(
    full,
    typeof content === "string" ? content : JSON.stringify(content)
  )
}
const SCENE = { name: "Bench", parts: [{ id: "top", file: "top.glb" }] }

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "enclose-test-"))
  )
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe("readScene", () => {
  it("reads a manifest that names something to draw, and nothing else", () => {
    write("a.json", SCENE)
    write("b.json", { name: "Empty", parts: [] })
    write("c.json", "not json")
    expect(readScene(path.join(root, "a.json"))).toEqual(SCENE)
    expect(readScene(path.join(root, "b.json"))).toBeNull()
    expect(readScene(path.join(root, "c.json"))).toBeNull()
    expect(readScene(path.join(root, "none.json"))).toBeNull()
  })
})

describe("appScenes", () => {
  it("lists the scenes in a folder, from the one for the smallest things up", () => {
    write("room/reference/enclose.reference.json", {
      ...SCENE,
      name: "Room",
      suits: "a thing that stands on the floor",
    })
    write("table/reference/enclose.reference.json", {
      ...SCENE,
      name: "Table",
      suits: "a thing that stands on a desk",
      upTo: [1000, 600, 700],
    })
    write("hand/reference/enclose.reference.json", {
      parts: SCENE.parts,
      upTo: [150, 100, 100],
    })
    // not a scene: nothing built in it, and a name no address could have
    write("shed/reference.py", "")
    write("Bad Name/reference/enclose.reference.json", SCENE)
    const scenes = appScenes(root)
    expect(scenes.map((scene) => scene.id)).toEqual(["hand", "table", "room"])
    expect(scenes[1]).toMatchObject({
      name: "Table",
      suits: "a thing that stands on a desk",
      script: path.join(root, "table", "reference.py"),
      dir: path.join(root, "table", "reference"),
    })
    expect(scenes[0].name).toBe("hand")
    expect(appScenes(path.join(root, "nowhere"))).toEqual([])
  })

  it("has the scenes the app is kept with", () => {
    const scenes = appScenes(path.join(import.meta.dirname, "../../../kit/scenes"))
    // from the one for the smallest things to the one for the biggest
    expect(scenes.map((scene) => scene.id)).toEqual(["table", "room", "person"])
    for (const scene of scenes) {
      expect(scene.suits).not.toBe("")
      expect(fs.existsSync(scene.script)).toBe(true)
      const { parts } = scene.manifest as { parts: { file: string }[] }
      for (const part of parts)
        expect(fs.existsSync(path.join(scene.dir, part.file))).toBe(true)
    }
  })
})

describe("findReference", () => {
  it("finds a project's own scene where one is kept, or where it says", () => {
    expect(findReference(root)).toBeNull()
    write("reference/enclose.reference.json", SCENE)
    expect(findReference(root)).toBe(
      path.join(root, "reference", "enclose.reference.json")
    )
    write("scenes/bench.json", SCENE)
    write("enclose.json", { reference: "scenes/bench.json" })
    expect(findReference(root)).toBe(path.join(root, "scenes", "bench.json"))
    write("enclose.json", { reference: "scenes/gone.json" })
    expect(findReference(root)).toBe(
      path.join(root, "reference", "enclose.reference.json")
    )
  })
})

describe("a project's own scene", () => {
  it("is said of the project once it is there, and again when it is rewritten", async () => {
    const dir = path.join(root, "box")
    fs.mkdirSync(dir)
    let changed = 0
    const projects = new Projects(path.join(root, "projects.json"), () => {
      changed++
    })
    const id = projects.add(dir)
    const said = () => projects.list(() => [])[0].reference
    expect(said()).toBeNull()
    expect(projects.get(id)?.reference).toBeNull()

    write("box/reference/enclose.reference.json", SCENE)
    projects.refresh(id)
    const first = said()
    expect(first).not.toBeNull()
    expect(projects.get(id)?.reference).toBe(
      path.join(dir, "reference", "enclose.reference.json")
    )
    projects.refresh(id)
    expect(said()).toBe(first)

    // What watches a folder may not yet be watching the moment after it is set to: so it
    // is rewritten until that is seen, with time between for it to be taken as done.
    const before = changed
    await expect
      .poll(
        () => {
          write("box/reference/enclose.reference.json", {
            ...SCENE,
            name: "Vice",
          })
          return said()
        },
        { timeout: 8000, interval: 800 }
      )
      .toBeGreaterThan(first as number)
    expect(changed).toBeGreaterThan(before)

    fs.rmSync(path.join(dir, "reference"), { recursive: true })
    projects.refresh(id)
    expect(said()).toBeNull()
    projects.close()
  })
})
