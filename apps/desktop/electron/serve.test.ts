import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { markOf, serveFile } from "./serve"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-serve-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const asked = (headers: Record<string, string> = {}) =>
  new Request("cad-model://p1.model/lid.glb", { headers })

describe("serveFile", () => {
  it("sends a file as it is read, with what it is and how it stands", async () => {
    const file = path.join(dir, "lid.glb")
    const bytes = Buffer.alloc(300_000, 7)
    fs.writeFileSync(file, bytes)
    const answer = await serveFile(file, asked(), "model/gltf-binary")
    expect(answer.status).toBe(200)
    expect(answer.headers.get("content-type")).toBe("model/gltf-binary")
    expect(answer.headers.get("cache-control")).toBe("no-store")
    expect(answer.headers.get("access-control-allow-origin")).toBe("*")
    expect(answer.headers.get("etag")).toBe(markOf(fs.statSync(file)))
    expect(Buffer.from(await answer.arrayBuffer()).equals(bytes)).toBe(true)
  })

  it("says only that it stands the same, asked with the mark it had", async () => {
    const file = path.join(dir, "lid.glb")
    fs.writeFileSync(file, "LID")
    const mark = (await serveFile(file, asked(), "x")).headers.get("etag")!
    const again = await serveFile(file, asked({ "if-none-match": mark }), "x")
    expect(again.status).toBe(304)
    expect(await again.text()).toBe("")
    fs.writeFileSync(file, "LID, again")
    const since = await serveFile(file, asked({ "if-none-match": mark }), "x")
    expect(since.status).toBe(200)
    expect(await since.text()).toBe("LID, again")
  })

  it("has nothing for a file that is not there, or is a folder", async () => {
    expect((await serveFile(path.join(dir, "gone"), asked(), "x")).status).toBe(
      404
    )
    expect((await serveFile(dir, asked(), "x")).status).toBe(404)
  })
})
