import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { MOST_BYTES } from "../shared/pictures"
import { Pictures } from "./pictures"

let dir: string
let pictures: Pictures
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-pictures-"))
  pictures = new Pictures(dir)
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const png = (bytes = 4) => ({
  name: "speaker.png",
  mimeType: "image/png",
  data: new Uint8Array(bytes).fill(7).buffer,
})

describe("Pictures", () => {
  it("keeps a picture in its project's folder, and says what as", () => {
    const kept = pictures.add("p1", png())
    expect(kept).toMatchObject({
      name: "speaker.png",
      mimeType: "image/png",
      bytes: 4,
    })
    expect(kept?.id).toMatch(/^[0-9a-f]{16}\.png$/)
    expect(fs.readdirSync(pictures.folder("p1"))).toEqual([kept?.id])
  })

  it("keeps nothing that is no picture an agent takes, or is too big for one", () => {
    expect(pictures.add("p1", { ...png(), mimeType: "image/tiff" })).toBeNull()
    expect(pictures.add("p1", { ...png(), data: "AAAA" })).toBeNull()
    expect(pictures.add("p1", png(0))).toBeNull()
    expect(pictures.add("p1", png(MOST_BYTES + 1))).toBeNull()
    expect(pictures.add("p1", null)).toBeNull()
    expect(fs.existsSync(pictures.folder("p1"))).toBe(false)
  })

  it("hands a message its pictures in their order, with what is in each", () => {
    const one = pictures.add("p1", png())!
    const two = pictures.add("p1", { ...png(2), mimeType: "image/jpeg" })!
    const shown = pictures.read("p1", [
      { ...two, number: 2 },
      // what the window says of its kind and size is not gone by
      { ...one, number: 1, mimeType: "image/gif", bytes: 99, name: " a\nb " },
    ])
    expect(shown.map(({ id, number }) => [id, number])).toEqual([
      [one.id, 1],
      [two.id, 2],
    ])
    expect(shown[0]).toMatchObject({
      mimeType: "image/png",
      bytes: 4,
      name: "a b",
      data: "BwcHBw==",
    })
    expect(shown[1].mimeType).toBe("image/jpeg")
  })

  it("says where a picture's file is, while it is there, and only as a whole path", () => {
    const file = path.join(dir, "logo.svg")
    fs.writeFileSync(file, "<svg/>")
    const one = pictures.add("p1", { ...png(), path: file })!
    expect(one.path).toBe(file)
    expect(pictures.add("p1", { ...png(), path: "logo.svg" })!.path).toBe(
      undefined
    )
    expect(pictures.read("p1", [{ ...one, number: 1 }])[0].path).toBe(file)
    // what the window says of it is taken only where it is a whole path
    expect(
      pictures.read("p1", [{ ...one, path: "../logo.svg", number: 1 }])[0].path
    ).toBe(undefined)
    fs.rmSync(file)
    expect(pictures.read("p1", [{ ...one, number: 1 }])[0].path).toBe(undefined)
  })

  it("passes over what is not one of the project's pictures", () => {
    const one = pictures.add("p1", png())!
    fs.writeFileSync(path.join(dir, "secret.png"), "x")
    expect(
      pictures
        .read("p1", [
          { id: "../secret.png", name: "x", number: 1 },
          { id: "0123456789abcdef.png", name: "gone", number: 2 },
          { ...one, number: 0 },
          null,
          { ...one, number: 3 },
          // the same picture, or the same number, a second time
          { ...one, number: 4 },
        ])
        .map(({ id, number }) => [id, number])
    ).toEqual([[one.id, 3]])
    expect(pictures.read("p2", [{ ...one, number: 1 }])).toEqual([])
    expect(pictures.read("p1", "nothing")).toEqual([])
  })

  it("forgets one picture, and all of a project's", () => {
    const one = pictures.add("p1", png())!
    const two = pictures.add("p1", png())!
    pictures.drop("p1", one.id)
    pictures.drop("p1", "../" + path.basename(dir))
    expect(fs.readdirSync(pictures.folder("p1"))).toEqual([two.id])
    pictures.forget("p1")
    expect(fs.existsSync(pictures.folder("p1"))).toBe(false)
    expect(fs.existsSync(dir)).toBe(true)
  })
})
