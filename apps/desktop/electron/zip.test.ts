import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { zipOf } from "./zip"

/** What is in an archive, read back the way a zip is: from the list at its end. */
function unzipped(archive: Buffer): { name: string; data: Buffer }[] {
  const end = archive.length - 22
  expect(archive.readUInt32LE(end)).toBe(0x06054b50)
  const count = archive.readUInt16LE(end + 10)
  let at = archive.readUInt32LE(end + 16)
  const files = []
  for (let n = 0; n < count; n++) {
    expect(archive.readUInt32LE(at)).toBe(0x02014b50)
    const how = archive.readUInt16LE(at + 10)
    const sum = archive.readUInt32LE(at + 16)
    const stored = archive.readUInt32LE(at + 20)
    const size = archive.readUInt32LE(at + 24)
    const named = archive.readUInt16LE(at + 28)
    const where = archive.readUInt32LE(at + 42)
    const name = archive.toString("utf8", at + 46, at + 46 + named)
    // the file itself, behind a header of its own that says the same
    expect(archive.readUInt32LE(where)).toBe(0x04034b50)
    const from =
      where +
      30 +
      archive.readUInt16LE(where + 26) +
      archive.readUInt16LE(where + 28)
    const kept = archive.subarray(from, from + stored)
    const data = how === 8 ? zlib.inflateRawSync(kept) : Buffer.from(kept)
    expect(data.length).toBe(size)
    expect(zlib.crc32(data)).toBe(sum)
    files.push({ name, data })
    at += 46 + named
  }
  return files
}

describe("zipOf", () => {
  const step = Buffer.from("ISO-10303-21;\n".repeat(400))

  it("keeps each file as it was, under its name, in the order given", () => {
    const files = [
      { name: "body.step", data: step },
      { name: "lid.step", data: Buffer.from("a lid") },
      { name: "nothing.step", data: Buffer.alloc(0) },
    ]
    const back = unzipped(zipOf(files))
    expect(back.map((file) => file.name)).toEqual(
      files.map((file) => file.name)
    )
    back.forEach((file, index) =>
      expect(file.data.equals(files[index].data)).toBe(true)
    )
  })

  it("squeezes what can be squeezed", () => {
    expect(zipOf([{ name: "body.step", data: step }]).length).toBeLessThan(
      step.length / 10
    )
  })

  it("gives two files of one name a name each", () => {
    const names = unzipped(
      zipOf([
        { name: "screw.step", data: Buffer.from("one") },
        { name: "Screw.step", data: Buffer.from("two") },
        { name: "screw.step", data: Buffer.from("three") },
      ])
    ).map((file) => file.name)
    expect(names).toEqual(["screw.step", "Screw-2.step", "screw-3.step"])
  })

  it("keeps a name that is not all plain letters", () => {
    const [file] = unzipped(
      zipOf([{ name: "Écrou M2,5 × 8.step", data: Buffer.from("x") }])
    )
    expect(file.name).toBe("Écrou M2,5 × 8.step")
  })

  describe("as a file", () => {
    let dir: string
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-zip-"))
    })
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

    const unzip = ["/usr/bin/unzip", "/bin/unzip"].find((file) =>
      fs.existsSync(file)
    )
    it.skipIf(!unzip)(
      "is one the system's own unzip takes, and finds whole",
      () => {
        const archive = path.join(dir, "parts.zip")
        fs.writeFileSync(
          archive,
          zipOf([
            { name: "body.step", data: step },
            { name: "back cover.step", data: Buffer.from("a cover") },
          ])
        )
        execFileSync(unzip!, ["-q", archive, "-d", path.join(dir, "out")])
        expect(
          fs.readFileSync(path.join(dir, "out/body.step")).equals(step)
        ).toBe(true)
        expect(
          fs.readFileSync(path.join(dir, "out/back cover.step"), "utf8")
        ).toBe("a cover")
      }
    )
  })
})
