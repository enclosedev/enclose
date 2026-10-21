import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  fileGuide,
  findGuides,
  guideOf,
  guidesIn,
  removeGuide,
} from "./assembly"
import { Projects } from "./projects"

let root: string
const write = (file: string, content: string) => {
  const full = path.join(root, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "enclose-test-"))
  )
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const MODEL = ["base", "weight", "cover", "screws"]
const lamp = (text = "Lay it down.") => ({
  title: "Desk lamp",
  steps: [
    { title: "Start with the base", text, parts: ["base"] },
    { title: "Drop in the weight", text: "Flat side up.", parts: ["weight"] },
    {
      title: "Fix the cover",
      text: "Three screws.",
      parts: ["cover", "screws"],
    },
  ],
})

describe("findGuides", () => {
  it("finds none in a folder that has no assembly/", () => {
    write("model.py", "")
    expect(findGuides(root)).toEqual([])
    expect(guidesIn(root)).toEqual([])
  })

  it("takes the JSON files in assembly/ that are plainly named", () => {
    write("assembly/desk-lamp-v1.json", "{}")
    write("assembly/notes.md", "")
    write("assembly/My Guide.json", "{}")
    write("assembly/old/desk-lamp-v0.json", "{}")
    expect(findGuides(root)).toEqual(["desk-lamp-v1.json"])
  })
})

describe("fileGuide", () => {
  it("files a guide as the first writing of the guide to that thing", () => {
    const filed = fileGuide(root, lamp(), MODEL, null, Date.UTC(2026, 9, 12))
    expect(filed.id).toBe("desk-lamp-v1")
    expect(filed.said).toContain("assembly/desk-lamp-v1.json")
    expect(filed.said).toContain("3 steps, 4 parts, version 1")
    expect(guideOf(root, "desk-lamp-v1")).toMatchObject({
      title: "Desk lamp",
      version: 1,
      made: Date.UTC(2026, 9, 12),
    })
    // its cover is of all of the thing, from where a model is first looked at
    expect(guidesIn(root)[0].cover).toEqual({ view: null, parts: [] })
  })

  it("keeps how the cover is drawn, where the guide says", () => {
    fileGuide(
      root,
      { ...lamp(), cover: { view: [-1, -1, 1], parts: ["cover", "base"] } },
      MODEL,
      null,
      1000
    )
    expect(guidesIn(root)[0].cover).toEqual({
      view: [-1, -1, 1],
      parts: ["cover", "base"],
    })
  })

  it("files the next as the next version, and keeps the one before", () => {
    fileGuide(root, lamp(), MODEL, null, 1000)
    const next = fileGuide(root, lamp("Felt side down."), MODEL, null, 2000)
    expect(next.id).toBe("desk-lamp-v2")
    expect(findGuides(root)).toEqual(["desk-lamp-v1.json", "desk-lamp-v2.json"])
    const other = fileGuide(
      root,
      { ...lamp(), title: "Shade" },
      MODEL,
      null,
      3000
    )
    expect(other.id).toBe("shade-v1")
    expect(guidesIn(root).map((guide) => [guide.id, guide.version])).toEqual([
      ["shade-v1", 1],
      ["desk-lamp-v2", 2],
      ["desk-lamp-v1", 1],
    ])
  })

  it("has a guide given again in the same turn take the place of the first", () => {
    const first = fileGuide(root, lamp(), MODEL, null, 1000)
    const again = fileGuide(
      root,
      lamp("Felt side down."),
      MODEL,
      first.id,
      2000
    )
    expect(again.id).toBe("desk-lamp-v1")
    expect(findGuides(root)).toEqual(["desk-lamp-v1.json"])
    expect(guideOf(root, again.id)?.steps[0].text).toBe("Felt side down.")
  })

  it("writes nothing of a guide that cannot be shown, and says why", () => {
    expect(() =>
      fileGuide(
        root,
        {
          title: "Desk lamp",
          steps: [{ title: "Fit", text: "It.", parts: ["base", "shade"] }],
        },
        MODEL,
        null,
        1000
      )
    ).toThrow(/was not written[\s\S]*no part with the id shade/)
    expect(findGuides(root)).toEqual([])
  })

  it("says which parts of the model a guide leaves out", () => {
    const { said } = fileGuide(
      root,
      { title: "Base", steps: lamp().steps.slice(0, 2) },
      MODEL,
      null,
      1000
    )
    expect(said).toContain(
      "2 parts of the model are in no step and will not be shown: cover, screws."
    )
  })

  it("says which steps put on parts of more than one kind, by what the parts are called", () => {
    const called = new Map([
      ["cover", "Base cover"],
      ["screws", "Cover screws, M3 × 10"],
    ])
    const { said } = fileGuide(root, lamp(), MODEL, null, 1000, called)
    expect(said).toContain("One step puts on parts of more than one kind")
    expect(said).toContain(
      '- step 3, "Fix the cover": Base cover, Cover screws, M3 × 10'
    )
    expect(said).toContain('make it a sub-assembly ("sub", then "fits")')
    const apart = fileGuide(
      root,
      {
        title: "Desk lamp",
        steps: [
          ...lamp().steps.slice(0, 2),
          { title: "Set the cover on", text: "Slot back.", parts: ["cover"] },
          { title: "Screw it down", text: "Three.", parts: ["screws"] },
        ],
      },
      MODEL,
      null,
      2000,
      called
    )
    expect(apart.said).not.toContain("more than one kind")
  })

  it("files what is made up apart, and will not file it left on the table", () => {
    const steps = [
      { title: "Start with the base", text: "Lay it.", parts: ["base"] },
      { sub: "Cover", title: "Lay the cover", text: "Down.", parts: ["cover"] },
      {
        sub: "Cover",
        title: "Start the screws",
        text: "In.",
        parts: ["screws"],
      },
    ]
    expect(() =>
      fileGuide(root, { title: "Desk lamp", steps }, MODEL, null, 1000)
    ).toThrow(/was not written[\s\S]*"Cover" is made up in steps 2 and 3/)
    const { id } = fileGuide(
      root,
      {
        title: "Desk lamp",
        steps: [
          ...steps,
          { title: "Fit the cover", text: "On.", parts: [], fits: ["cover"] },
        ],
      },
      MODEL,
      null,
      1000
    )
    expect(guideOf(root, id)?.steps.at(-1)).toMatchObject({
      sub: null,
      fits: ["Cover"],
    })
  })
})

describe("removeGuide", () => {
  /** Stands in for the system's bin: what is put away is kept, to be had back. */
  const bin = () => {
    const kept: string[] = []
    return {
      kept,
      away: async (file: string) => {
        kept.push(path.relative(root, file))
        fs.renameSync(file, `${file}.away`)
      },
    }
  }

  it("puts the one guide away, and leaves the rest", async () => {
    fileGuide(root, lamp(), MODEL, null, 1000)
    fileGuide(root, lamp("Felt side down."), MODEL, null, 2000)
    const { kept, away } = bin()
    expect(await removeGuide(root, "desk-lamp-v1", away)).toBe(true)
    expect(kept).toEqual([path.join("assembly", "desk-lamp-v1.json")])
    expect(findGuides(root)).toEqual(["desk-lamp-v2.json"])
  })

  it("puts away one that does not read as a guide, all the same", async () => {
    write("assembly/desk-lamp-v1.json", "{ not a guide")
    const { kept, away } = bin()
    expect(await removeGuide(root, "desk-lamp-v1", away)).toBe(true)
    expect(kept).toHaveLength(1)
  })

  it("touches nothing that is no guide of the folder's", async () => {
    write("model.py", "")
    write("assembly/notes.md", "")
    const { kept, away } = bin()
    for (const id of ["desk-lamp-v9", "notes", "../model", "../../etc/hosts"])
      expect(await removeGuide(root, id, away)).toBe(false)
    expect(kept).toEqual([])
  })
})

describe("guidesIn", () => {
  it("says of a file that is no guide why it is not, and still lists it", () => {
    write("assembly/desk-lamp-v1.json", '{ "title": "Desk lamp" }')
    expect(guidesIn(root)).toMatchObject([
      {
        id: "desk-lamp-v1",
        title: "desk-lamp-v1",
        steps: 0,
        parts: [],
        trouble: 'A guide needs "steps": at least one.',
      },
    ])
    expect(guideOf(root, "desk-lamp-v1")).toBeNull()
  })
})

describe("a project's guides", () => {
  it("are known of from the first, and counted again when one is written", () => {
    write("model.py", "")
    const projects = new Projects(path.join(root, "projects.json"), () => {})
    const id = projects.add(root)
    const assembly = () => projects.list(() => [])[0].assembly
    expect(assembly()).toBeNull()
    fileGuide(root, lamp(), MODEL, null, 1000)
    projects.refresh(id)
    const first = assembly()
    expect(first).not.toBeNull()
    projects.refresh(id)
    expect(assembly()).toBe(first)
    fileGuide(root, lamp(), MODEL, null, 2000)
    projects.refresh(id)
    expect(assembly()).toBe(first! + 1)
    projects.close()
  })
})
