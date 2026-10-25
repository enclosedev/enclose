import fs from "node:fs"

import { describe, expect, it, vi } from "vitest"

import { redrawn, type Run } from "./redrawn"

const heic = {
  name: "IMG_0042.HEIC",
  mimeType: "image/heic",
  data: new Uint8Array([1, 2, 3]).buffer,
}

/** sips, as it is asked: writes what it is asked to, where it is asked to. */
const sips = (made = "drawn") =>
  vi.fn<Run>(async (_, args) => {
    fs.writeFileSync(args[args.length - 1], made)
  })

describe("redrawn", () => {
  it("has a Mac draw a photo again as a JPEG, and anything else as a PNG", async () => {
    const run = sips()
    expect(await redrawn(heic, run, "darwin")).toEqual({
      mimeType: "image/jpeg",
      data: Buffer.from("drawn"),
    })
    expect(run.mock.calls[0][1]).toContain("jpeg")
    expect(
      (await redrawn({ ...heic, mimeType: "image/tiff" }, run, "darwin"))
        ?.mimeType
    ).toBe("image/png")
  })

  it("draws nothing elsewhere, nor what is no picture, nor what sips cannot", async () => {
    const run = sips()
    expect(await redrawn(heic, run, "linux")).toBeNull()
    expect(
      await redrawn({ ...heic, mimeType: "text/plain" }, run, "darwin")
    ).toBeNull()
    expect(run).not.toHaveBeenCalled()
    const failing = vi.fn<Run>(() => Promise.reject(new Error("no")))
    expect(await redrawn(heic, failing, "darwin")).toBeNull()
  })
})
