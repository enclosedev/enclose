import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { Example } from "../shared/examples"
import { boardsIn } from "./boards"
import { fetched, ownExporter, startFrom } from "./examples"

let root: string
const write = (file: string, content = "") => {
  const full = path.join(root, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  return full
}
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

const SCRIPT = [
  "import os",
  "import sys",
  "",
  "# the app's exporter",
  "sys.dont_write_bytecode = True",
  'sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "kit"))',
  "from enclose import Model  # noqa: E402",
  "",
].join("\n")

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "enclose-test-"))
  )
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe("ownExporter", () => {
  it("takes out the line that points at the app's exporter", () => {
    const own = ownExporter(SCRIPT)
    expect(own).not.toContain("sys.path")
    expect(own).toContain("sys.dont_write_bytecode = True\nfrom enclose import")
  })

  it("leaves a script that has no such line as it is", () => {
    const plain = "from enclose import Model\n"
    expect(ownExporter(plain)).toBe(plain)
  })
})

describe("startFrom", () => {
  const made = new Date(2026, 9, 9, 12, 30)
  const start = () =>
    startFrom(
      path.join(root, "app/examples/clock"),
      "Table clock",
      path.join(root, "projects"),
      path.join(root, "app/kit/enclose.py"),
      made
    )

  beforeEach(() => {
    write("app/kit/enclose.py", "# exporter\n")
    write("app/examples/clock/model.py", SCRIPT)
    write("app/examples/clock/enclose.json", "{}")
    write("app/examples/clock/tools/clock.js", "// tool\n")
    write("app/examples/clock/build/enclose.model.json", "{}")
    write("app/examples/clock/build/step/base.step", "step")
    write("app/examples/clock/__pycache__/model.pyc", "x")
    write("app/examples/clock/.DS_Store", "x")
  })

  it("copies the example into a new project's folder, exporter and all", () => {
    const dir = start()
    expect(dir).toBe(path.join(root, "projects/2026-10-09-1230-table-clock"))
    const at = path.relative(root, dir)
    expect(read(`${at}/tools/clock.js`)).toBe("// tool\n")
    expect(read(`${at}/build/step/base.step`)).toBe("step")
    expect(read(`${at}/enclose.py`)).toBe("# exporter\n")
    expect(read(`${at}/model.py`)).not.toContain("sys.path")
    expect(fs.existsSync(path.join(dir, "__pycache__"))).toBe(false)
    expect(fs.existsSync(path.join(dir, ".DS_Store"))).toBe(false)
  })

  it("gives the copy the app's screws as well, where its model is made with them", () => {
    expect(fs.existsSync(path.join(start(), "screws.py"))).toBe(false)
    write("app/kit/screws.py", "# screws\n")
    write(
      "app/examples/clock/model.py",
      SCRIPT + "from screws import Screw  # noqa: E402\n"
    )
    expect(read(`${path.relative(root, start())}/screws.py`)).toBe("# screws\n")
  })

  it("leaves the example as it was", () => {
    start()
    expect(read("app/examples/clock/model.py")).toBe(SCRIPT)
    expect(
      fs.existsSync(path.join(root, "app/examples/clock/enclose.py"))
    ).toBe(false)
  })

  it("leaves out what it is told to, wherever it is in the folder", () => {
    write("app/examples/clock/.git/HEAD", "ref")
    write("app/examples/clock/pcb/.git/HEAD", "ref")
    const dir = startFrom(
      path.join(root, "app/examples/clock"),
      "Table clock",
      path.join(root, "projects"),
      path.join(root, "app/kit/enclose.py"),
      made,
      new Set([".git"])
    )
    expect(fs.existsSync(path.join(dir, ".git"))).toBe(false)
    expect(fs.existsSync(path.join(dir, "pcb/.git"))).toBe(false)
    expect(read(`${path.relative(root, dir)}/model.py`)).not.toContain(
      "sys.path"
    )
  })

  it("makes another project the second time", () => {
    expect(start()).not.toBe(start())
  })

  it("leaves no folder behind when the example is not there", () => {
    fs.rmSync(path.join(root, "app/examples"), { recursive: true })
    expect(start).toThrow()
    expect(fs.readdirSync(path.join(root, "projects"))).toEqual([])
  })

  describe("of an example that was fetched", () => {
    const unpacked = (files: Record<string, string>) =>
      startFrom(
        Object.entries(files).map(([file, content]) => ({
          path: file,
          data: Buffer.from(content),
        })),
        "Table clock",
        path.join(root, "projects"),
        path.join(root, "app/kit/enclose.py"),
        made
      )

    it("writes its files into a new project's folder, exporter and all", () => {
      const dir = unpacked({
        "model.py": SCRIPT,
        "build/step/base.step": "step",
      })
      const at = path.relative(root, dir)
      expect(at).toBe("projects/2026-10-09-1230-table-clock")
      expect(read(`${at}/build/step/base.step`)).toBe("step")
      expect(read(`${at}/enclose.py`)).toBe("# exporter\n")
      expect(read(`${at}/model.py`)).not.toContain("sys.path")
    })

    it("has its boards come built, though each was written after its build", () => {
      const dir = unpacked({
        "model.py": SCRIPT,
        "pcb/build/main.circuit.json": "[]",
        "pcb/build/main.preview.json": "[]",
        "pcb/main.board.json": '{ "name": "Clock board", "finished": true }',
        "pcb/main.circuit.tsx": "// the board\n",
      })
      const [board] = boardsIn(dir)
      expect(board.outdated).toBe(false)
      expect(board.preview).toBeNull()
    })

    it("leaves no folder behind when a file would land outside it", () => {
      expect(() => unpacked({ "../outside": "x" })).toThrow(/not a place/)
      expect(fs.readdirSync(path.join(root, "projects"))).toEqual([])
      expect(fs.existsSync(path.join(root, "outside"))).toBe(false)
    })
  })
})

describe("fetched", () => {
  const archive = Buffer.from("an archive, as far as this goes")
  const example: Example = {
    id: "clock",
    name: "Table clock",
    bytes: archive.length,
    sha256: createHash("sha256").update(archive).digest("hex"),
  }
  /** What answers in place of the network: the bytes, a few at a time. */
  const answering =
    (bytes: Buffer, status = 200): typeof fetch =>
    () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              for (let at = 0; at < bytes.length; at += 10)
                controller.enqueue(bytes.subarray(at, at + 10))
              controller.close()
            },
          }),
          { status }
        )
      )

  it("gives the archive, saying how much of it has come as it comes", async () => {
    const came: number[] = []
    const got = await fetched(
      "https://somewhere/clock.tar.br",
      example,
      (received) => came.push(received),
      answering(archive)
    )
    expect(got.equals(archive)).toBe(true)
    expect(came).toEqual([0, 10, 20, 30, archive.length])
  })

  it("asks where it is told to", async () => {
    let asked = ""
    await fetched(
      "https://somewhere/clock.tar.br",
      example,
      () => {},
      (url) => {
        asked = String(url)
        return answering(archive)(url)
      }
    )
    expect(asked).toBe("https://somewhere/clock.tar.br")
  })

  it.each([
    ["other bytes of the same number", Buffer.from(archive).fill(1, 0, 4)],
    ["fewer bytes", archive.subarray(0, 12)],
    ["more bytes", Buffer.concat([archive, archive])],
  ])("will not take %s for the example", async (_, sent) => {
    await expect(
      fetched("https://somewhere/x", example, () => {}, answering(sent))
    ).rejects.toThrow(/not the example/)
  })

  it("says what was answered when it is not the archive", async () => {
    await expect(
      fetched("https://somewhere/x", example, () => {}, answering(archive, 404))
    ).rejects.toThrow(/404/)
  })

  it("gives up on an archive that stops coming", async () => {
    const stuck: typeof fetch = (_, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        )
      })
    await expect(
      fetched("https://somewhere/x", example, () => {}, stuck, 20)
    ).rejects.toThrow(/stopped coming/)
  })
})
