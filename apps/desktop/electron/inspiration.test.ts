import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  INSPIRATION_FILE,
  INSPIRATION_FOLDER,
  readInspiration,
  type InspirationBoard,
  type InspirationImage,
  type InspirationState,
} from "../shared/inspiration-format"
import { MOST_BYTES } from "../shared/pictures"
import { until } from "./testing"
import {
  digestOf,
  fileStemOf,
  Inspiration,
  tidyOverview,
  type Looked,
} from "./inspiration"

let dir: string
let looked: {
  picture: Looked
  signal: AbortSignal
  model: string | null
  say: (said: string | null) => void
}[]
let trashed: string[]
let told: InspirationState[]
let inspiration: Inspiration

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-inspiration-"))
  looked = []
  trashed = []
  told = []
  inspiration = new Inspiration({
    folderOf: (id) => (id === "p1" ? dir : null),
    look: (picture, signal, model) =>
      new Promise((resolve) =>
        looked.push({ picture, signal, model, say: resolve })
      ),
    trash: async (file) => {
      trashed.push(path.basename(file))
      fs.rmSync(file)
    },
    onChange: (_, state) => told.push(state),
  })
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const png = (name = "Rams T3.png", bytes = 4) => ({
  name,
  mimeType: "image/png",
  data: new Uint8Array(bytes).fill(7).buffer,
})

const onBoard = (
  id: string,
  file: string,
  more: Partial<InspirationImage> = {}
): InspirationImage => ({
  id,
  file,
  name: file,
  pixels: [100, 50],
  at: [0, 0],
  width: 300,
  group: null,
  notes: [],
  overview: null,
  added: 1,
  ...more,
})

const written = (): InspirationBoard =>
  readInspiration(
    JSON.parse(
      fs.readFileSync(
        path.join(dir, INSPIRATION_FOLDER, INSPIRATION_FILE),
        "utf8"
      )
    )
  )

/** Give what was begun time to go further, where it is not to. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe("fileStemOf", () => {
  it("names a picture's file after what it was called, plainly, and apart from the others", () => {
    expect(fileStemOf("Dieter Rams — T3 Radio.JPG")).toMatch(
      /^dieter-rams-t3-radio-[0-9a-f]{4}$/
    )
    expect(fileStemOf("Café.png")).toMatch(/^cafe-[0-9a-f]{4}$/)
    expect(fileStemOf("…")).toMatch(/^picture-[0-9a-f]{4}$/)
    expect(fileStemOf("x".repeat(90))).toHaveLength(45)
  })
})

describe("Inspiration", () => {
  it("puts a picture's file in the board's folder", () => {
    const kept = inspiration.add("p1", png())
    expect(kept?.file).toMatch(/^rams-t3-[0-9a-f]{4}\.png$/)
    expect(kept?.id).toBe(kept?.file.replace(/\.png$/, ""))
    expect(fs.readdirSync(path.join(dir, INSPIRATION_FOLDER))).toEqual([
      kept?.file,
    ])
  })

  it("keeps nothing that is no PNG or JPEG, or of a project with no folder", () => {
    expect(
      inspiration.add("p1", { ...png(), mimeType: "image/tiff" })
    ).toBeNull()
    expect(
      inspiration.add("p1", { ...png(), mimeType: "image/webp" })
    ).toBeNull()
    expect(inspiration.add("p1", png("big.png", MOST_BYTES + 1))).toBeNull()
    expect(inspiration.add("p1", png("none.png", 0))).toBeNull()
    expect(inspiration.add("p2", png())).toBeNull()
    expect(fs.existsSync(path.join(dir, INSPIRATION_FOLDER))).toBe(false)
  })

  it("writes the board, and has the agent look at what it has not seen", async () => {
    const one = inspiration.add("p1", png())!
    inspiration.save("p1", {
      updated: 3,
      images: [onBoard(one.id, one.file)],
      groups: [],
    })
    expect(written().images.map((image) => image.id)).toEqual([one.id])
    await until(() => looked.length === 1)
    expect(looked[0].picture).toMatchObject({
      name: one.file,
      mimeType: "image/png",
      data: Buffer.from(new Uint8Array(4).fill(7)).toString("base64"),
    })
    expect(told.at(-1)?.analysing).toEqual([one.id])

    looked[0].say("What: a radio")
    await until(() => told.at(-1)?.analysing.length === 0)
    expect(written().images[0].overview).toBe("What: a radio")
    expect(told.at(-1)).toMatchObject({
      analysing: [],
      board: { images: [{ overview: "What: a radio" }] },
    })
  })

  it("keeps what the agent said of a picture, whatever the window says of it", async () => {
    const one = inspiration.add("p1", png())!
    inspiration.save("p1", { images: [onBoard(one.id, one.file)] })
    await until(() => looked.length === 1)
    looked[0].say("What: a radio")
    await until(() => written().images[0].overview !== null)
    inspiration.save("p1", {
      images: [onBoard(one.id, one.file, { at: [5, 5], overview: "made up" })],
    })
    expect(written().images[0]).toMatchObject({
      at: [5, 5],
      overview: "What: a radio",
    })
    // and nothing is looked at twice
    await settle()
    expect(looked).toHaveLength(1)
  })

  it("puts the files of pictures taken off the board in the bin, and no others", async () => {
    const one = inspiration.add("p1", png("one.png"))!
    const two = inspiration.add("p1", png("two.png"))!
    fs.writeFileSync(path.join(dir, INSPIRATION_FOLDER, "mine.png"), "x")
    inspiration.save("p1", {
      images: [onBoard(one.id, one.file), onBoard(two.id, two.file)],
    })
    await until(() => looked.length === 2)
    inspiration.save("p1", { images: [onBoard(two.id, two.file)] })
    await until(() => trashed.length > 0)
    expect(trashed).toEqual([one.file])
    // the one being looked at is looked at no longer
    expect(looked[0].signal.aborted).toBe(true)
    expect(fs.readdirSync(path.join(dir, INSPIRATION_FOLDER)).sort()).toEqual(
      [INSPIRATION_FILE, "mine.png", two.file].sort()
    )
  })

  it("leaves off a picture whose file is not there", () => {
    inspiration.save("p1", { images: [onBoard("gone-0000", "gone-0000.png")] })
    expect(written().images).toEqual([])
  })

  it("looks at two at a time, and the rest after", async () => {
    const files = ["a", "b", "c"].map((name) =>
      inspiration.add("p1", png(`${name}.png`))!
    )
    inspiration.save("p1", {
      images: files.map((one) => onBoard(one.id, one.file)),
    })
    await until(() => looked.length === 2)
    await settle()
    expect(looked).toHaveLength(2)
    looked[0].say("What: one")
    await until(() => looked.length === 3)
  })

  it("stops when it is told to, until more is put on the board", async () => {
    const files = ["a", "b", "c"].map((name) =>
      inspiration.add("p1", png(`${name}.png`))!
    )
    inspiration.save("p1", {
      images: files.map((one) => onBoard(one.id, one.file)),
    })
    await until(() => looked.length === 2)
    inspiration.stop("p1")
    expect(looked.every((one) => one.signal.aborted)).toBe(true)
    for (const one of looked) one.say("What: too late")
    await until(() => told.at(-1)?.analysing.length === 0)
    expect(written().images.every((image) => image.overview === null)).toBe(
      true
    )
    expect(inspiration.read("p1").analysing).toEqual([])
    await settle()
    expect(looked).toHaveLength(2)

    // another picture brings them all back
    const more = inspiration.add("p1", png("d.png"))!
    inspiration.save("p1", {
      images: [...files, more].map((one) => onBoard(one.id, one.file)),
    })
    await until(() => looked.length === 4)
  })

  it("has Codex look with the model the window last said it runs", async () => {
    const one = inspiration.add("p1", png("one.png"))!
    inspiration.save("p1", { images: [onBoard(one.id, one.file)] }, "gpt-luna")
    await until(() => looked.length === 1)
    expect(looked[0].model).toBe("gpt-luna")
    // (where the window says nothing of it, it is as it was)
    const two = inspiration.add("p1", png("two.png"))!
    inspiration.save("p1", {
      images: [onBoard(one.id, one.file), onBoard(two.id, two.file)],
    })
    await until(() => looked.length === 2)
    expect(looked[1].model).toBe("gpt-luna")
  })

  it("tries again what the agent said nothing of only once more is put on the board", async () => {
    const one = inspiration.add("p1", png())!
    inspiration.save("p1", { images: [onBoard(one.id, one.file)] })
    await until(() => looked.length === 1)
    looked[0].say(null)
    await until(() => told.at(-1)?.analysing.length === 0)
    inspiration.read("p1")
    await settle()
    expect(looked).toHaveLength(1)
    inspiration.add("p1", png("two.png"))
    inspiration.read("p1")
    await until(() => looked.length === 2)
  })
})

describe("digestOf", () => {
  it("says nothing of a board with no pictures", () => {
    expect(digestOf({ updated: null, images: [], groups: [] })).toBeNull()
  })

  it("tells of each group by its title, then the pictures in none, with what is known of each", () => {
    const digest = digestOf({
      updated: 1,
      images: [
        onBoard("desk-1111", "desk-1111.jpg", {
          name: 'my "walnut" desk.jpg',
          group: "g1",
          overview: "What: a walnut desk\nTake: the joinery",
          notes: [
            { id: "n1", at: [0.42, 0.305], text: "This joint", added: 1 },
          ],
        }),
        onBoard("room-2222", "room-2222.jpg"),
      ],
      groups: [
        { id: "g1", title: "Wood", at: [0, 0] },
        { id: "g2", title: "Empty", at: [0, 0] },
      ],
    })
    expect(digest).toBe(
      [
        '<inspiration-board pictures="2" groups="1">',
        '<group title="Wood" pictures="1">',
        `<picture file="inspiration/desk-1111.jpg" name="my 'walnut' desk.jpg">`,
        "What: a walnut desk",
        "Take: the joinery",
        '<note at="42% across, 31% down">This joint</note>',
        "</picture>",
        "</group>",
        '<picture file="inspiration/room-2222.jpg" name="room-2222.jpg">',
        "Not looked at yet: open its file to see it.",
        "</picture>",
        "</inspiration-board>",
      ].join("\n")
    )
  })
})

describe("tidyOverview", () => {
  it("keeps the lines of the answer that are its lines, plain", () => {
    expect(
      tidyOverview(
        "Here you go:\n**What:** a radio\n- Form: a slab\n\nTake: its grille\nThanks"
      )
    ).toBe("What: a radio\nForm: a slab\nTake: its grille")
  })

  it("keeps the whole of an answer that kept to none of them, and nothing of an empty one", () => {
    expect(tidyOverview("A radio, in white plastic.")).toBe(
      "A radio, in white plastic."
    )
    expect(tidyOverview("  \n ")).toBeNull()
  })
})

// (the agent itself is never started here)
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: vi.fn() }))
