import { describe, expect, it } from "vitest"

import {
  EMPTY_BOARD,
  inspirationFile,
  isPictureFile,
  pastedLink,
  readInspiration,
  TITLE_LONGEST,
} from "./inspiration-format"

const image = (file: string, more: Record<string, unknown> = {}) => ({
  file,
  name: `${file} from the web`,
  pixels: [1200, 800],
  at: [10, -20],
  width: 320,
  group: null,
  notes: [],
  overview: null,
  added: 5,
  ...more,
})

describe("isPictureFile", () => {
  it("takes the files a board keeps its pictures in, and no others", () => {
    expect(isPictureFile("rams-t3-4f1a.jpg")).toBe(true)
    expect(isPictureFile("a.webp")).toBe(true)
    expect(isPictureFile("board.json")).toBe(false)
    expect(isPictureFile("../model.png")).toBe(false)
    expect(isPictureFile("Rams.png")).toBe(false)
    expect(isPictureFile("scan.tiff")).toBe(false)
  })
})

describe("readInspiration", () => {
  it("reads a board as it was written", () => {
    const board = {
      updated: 99,
      images: [
        image("walnut-1a2b.jpg", {
          group: "g1",
          overview: "What: a walnut desk",
          notes: [{ id: "n1", at: [0.4, 0.25], text: "This joint", added: 7 }],
        }),
        image("speaker-3c4d.png"),
      ],
      groups: [{ id: "g1", title: "Materials", at: [0, 0] }],
    }
    const read = readInspiration(board)
    expect(read.updated).toBe(99)
    expect(read.groups).toEqual(board.groups)
    expect(read.images.map((one) => one.id)).toEqual([
      "walnut-1a2b",
      "speaker-3c4d",
    ])
    expect(read.images[0]).toMatchObject({
      group: "g1",
      overview: "What: a walnut desk",
      notes: [{ id: "n1", at: [0.4, 0.25], text: "This joint", added: 7 }],
    })
  })

  it("leaves out what is no picture of its own, and each picture after its first", () => {
    const read = readInspiration({
      images: [
        image("one-1111.jpg"),
        image("one-1111.jpg", { at: [99, 99] }),
        image("../out.jpg"),
        image("flat-2222.png", { pixels: [0, 10] }),
        image("where-3333.png", { at: "here" }),
        "nothing",
      ],
    })
    expect(read.images.map((one) => one.id)).toEqual(["one-1111"])
    expect(read.images[0].at).toEqual([10, -20])
  })

  it("keeps notes on the picture, and to what can be said", () => {
    const [read] = readInspiration({
      images: [
        image("one-1111.jpg", {
          notes: [
            { id: "n1", at: [1.4, -0.2], text: "  the\r\nedge  " },
            { id: "n1", at: [0.5, 0.5], text: "again" },
            { id: "n2", at: [0.5, 0.5], text: "   " },
            { id: "n 3", at: [0.5, 0.5], text: "no such id" },
          ],
        }),
      ],
    }).images
    expect(read.notes).toEqual([
      { id: "n1", at: [1, 0], text: "the\nedge", added: 0 },
    ])
  })

  it("keeps groups that have pictures, and takes pictures out of groups there are none of", () => {
    const read = readInspiration({
      images: [
        image("one-1111.jpg", { group: "g1" }),
        image("two-2222.jpg", { group: "gone" }),
      ],
      groups: [
        { id: "g1", title: "x".repeat(80), at: [1, 2] },
        { id: "g2", title: "Empty", at: [0, 0] },
        { id: "g3", title: "  ", at: [0, 0] },
      ],
    })
    expect(read.groups.map((group) => group.id)).toEqual(["g1"])
    expect(read.groups[0].title).toHaveLength(TITLE_LONGEST)
    expect(read.images.map((one) => one.group)).toEqual(["g1", null])
  })

  it("writes a board to be read back as it was", () => {
    const board = readInspiration({
      updated: 4,
      images: [image("one-1111.jpg", { group: "g1" }), image("two-2222.jpg")],
      groups: [{ id: "g1", title: "Wood", at: [3, 4] }],
    })
    expect(readInspiration(JSON.parse(inspirationFile(board)))).toEqual(board)
  })

  it("reads nothing from what is no board", () => {
    expect(readInspiration(null)).toEqual(EMPTY_BOARD)
    expect(readInspiration([image("one-1111.jpg")])).toEqual(EMPTY_BOARD)
    expect(readInspiration("board")).toEqual(EMPTY_BOARD)
  })
})

describe("pastedLink", () => {
  it("is a web link pasted by itself", () => {
    expect(pastedLink("  https://a.example/chair.jpg\n")).toBe(
      "https://a.example/chair.jpg"
    )
    expect(pastedLink("http://a.example")).toBe("http://a.example/")
  })

  it("is null for words, other links, or a link among words", () => {
    expect(pastedLink("a chair")).toBeNull()
    expect(pastedLink("file:///Users/me/chair.jpg")).toBeNull()
    expect(pastedLink("see https://a.example/chair.jpg")).toBeNull()
  })
})
