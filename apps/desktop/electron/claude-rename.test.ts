import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { followRename } from "./claude"

/** Where Claude Code keeps what it knows of a folder, in a home of its own. */
const storeOf = (home: string, dir: string) =>
  path.join(home, "projects", dir.replace(/[^a-zA-Z0-9]/g, "-"))

describe("followRename", () => {
  let home: string
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-claude-home-"))
  })
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }))

  const note = (dir: string, text: string) => {
    const store = storeOf(home, dir)
    fs.mkdirSync(path.join(store, "memory"), { recursive: true })
    fs.writeFileSync(path.join(store, "memory", "MEMORY.md"), text)
  }
  const noted = (dir: string) =>
    fs.readFileSync(
      path.join(storeOf(home, dir), "memory", "MEMORY.md"),
      "utf8"
    )

  it("takes the notes along to the folder's new name", () => {
    note("/Users/me/Projects/clock", "the clock's notes")
    followRename(
      "/Users/me/Projects/clock",
      "/Users/me/Projects/wall clock",
      home
    )
    expect(noted("/Users/me/Projects/wall clock")).toBe("the clock's notes")
    expect(fs.existsSync(storeOf(home, "/Users/me/Projects/clock"))).toBe(false)
  })

  it("never writes over notes kept under the new name already", () => {
    note("/Users/me/Projects/clock", "the clock's notes")
    note("/Users/me/Projects/lamp", "the lamp's notes")
    followRename("/Users/me/Projects/clock", "/Users/me/Projects/lamp", home)
    expect(noted("/Users/me/Projects/lamp")).toBe("the lamp's notes")
    expect(noted("/Users/me/Projects/clock")).toBe("the clock's notes")
  })

  it("does nothing where nothing was kept of the folder", () => {
    expect(() =>
      followRename("/Users/me/Projects/clock", "/Users/me/Projects/lamp", home)
    ).not.toThrow()
    expect(fs.existsSync(storeOf(home, "/Users/me/Projects/lamp"))).toBe(false)
  })
})
