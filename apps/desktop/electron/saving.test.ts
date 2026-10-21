import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SaveFolder } from "./saving"

describe("SaveFolder", () => {
  let dir: string
  let kept: string
  let downloads: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-saving-"))
    kept = path.join(dir, "data", "save-folder")
    downloads = path.join(dir, "Downloads")
    fs.mkdirSync(downloads)
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("opens in Downloads until anything has been saved", () => {
    const saving = new SaveFolder(kept, () => downloads)
    expect(saving.folder()).toBe(downloads)
    expect(saving.offer("lid.step")).toBe(path.join(downloads, "lid.step"))
  })

  it("opens where the last thing was saved, the next time the app is opened too", () => {
    const parts = path.join(dir, "Parts")
    fs.mkdirSync(parts)
    new SaveFolder(kept, () => downloads).savedIn(parts)
    const again = new SaveFolder(kept, () => downloads)
    expect(again.folder()).toBe(parts)
    expect(again.offer("base.step")).toBe(path.join(parts, "base.step"))
  })

  it("goes back to Downloads once that folder is gone", () => {
    const parts = path.join(dir, "Parts")
    fs.mkdirSync(parts)
    const saving = new SaveFolder(kept, () => downloads)
    saving.savedIn(parts)
    fs.rmSync(parts, { recursive: true })
    expect(saving.folder()).toBe(downloads)
  })

  it("still opens where the last thing was saved when that cannot be kept", () => {
    const parts = path.join(dir, "Parts")
    fs.mkdirSync(parts)
    // where it would be kept is a file, which no folder can be made in
    const blocked = path.join(dir, "blocked")
    fs.writeFileSync(blocked, "")
    const saving = new SaveFolder(
      path.join(blocked, "save-folder"),
      () => downloads
    )
    expect(() => saving.savedIn(parts)).not.toThrow()
    expect(saving.folder()).toBe(parts)
    expect(
      new SaveFolder(
        path.join(blocked, "save-folder"),
        () => downloads
      ).folder()
    ).toBe(downloads)
  })

  it("opens in Downloads where what was kept says nothing", () => {
    fs.mkdirSync(path.dirname(kept), { recursive: true })
    fs.writeFileSync(kept, "\n")
    expect(new SaveFolder(kept, () => downloads).folder()).toBe(downloads)
  })
})
