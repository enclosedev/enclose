import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { findTools, readTools } from "./custom-tools"
import { Projects } from "./projects"
import { MOST_TOOL_BYTES } from "../shared/tool-format"

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

describe("findTools", () => {
  it("finds none in a folder that has no tools/", () => {
    write("model.py", "")
    expect(findTools(root)).toEqual([])
    expect(readTools(root)).toEqual([])
  })

  it("takes the JavaScript files in tools/, in the order of their names", () => {
    write("tools/lid.js", "export default {}")
    write("tools/clock.js", "export default { name: 'Clock' }")
    write("tools/robot-arm.mjs", "export default {}")
    // none of these is a tool: not JavaScript, not plainly named, not at the top
    write("tools/notes.md", "")
    write("tools/My Tool.js", "")
    write("tools/.hidden.js", "")
    write("tools/lib/helper.js", "")
    expect(findTools(root)).toEqual(["clock.js", "lid.js", "robot-arm.mjs"])
    expect(readTools(root)).toEqual([
      {
        id: "clock",
        file: "tools/clock.js",
        source: "export default { name: 'Clock' }",
      },
      { id: "lid", file: "tools/lid.js", source: "export default {}" },
      {
        id: "robot-arm",
        file: "tools/robot-arm.mjs",
        source: "export default {}",
      },
    ])
  })

  it("leaves out a file too long to be a tool", () => {
    write("tools/big.js", "/".repeat(MOST_TOOL_BYTES + 1))
    write("tools/small.js", "export default {}")
    expect(readTools(root).map((tool) => tool.id)).toEqual(["small"])
  })
})

describe("a project's tools", () => {
  const idle = () => []
  const toolsOf = (projects: Projects) => projects.list(idle)[0].tools

  it("has none until one is written, and counts each writing of them", () => {
    const projects = new Projects(path.join(root, "state.json"), () => {})
    const dir = path.join(root, "thing")
    fs.mkdirSync(dir)
    const id = projects.add(dir)
    expect(toolsOf(projects)).toBeNull()

    write("thing/tools/clock.js", "export default {}")
    projects.refresh(id)
    const first = toolsOf(projects)
    expect(first).toBeTypeOf("number")
    projects.refresh(id)
    expect(toolsOf(projects)).toBe(first)

    write("thing/tools/clock.js", "export default { name: 'Clock' }")
    projects.refresh(id)
    expect(toolsOf(projects)).toBeGreaterThan(first!)

    fs.rmSync(path.join(dir, "tools"), { recursive: true })
    projects.refresh(id)
    expect(toolsOf(projects)).toBeNull()
    projects.close()
  })

  it("hears of a tool being written without being told to look", async () => {
    let heard = 0
    const projects = new Projects(path.join(root, "state.json"), () => heard++)
    const dir = path.join(root, "thing")
    fs.mkdirSync(dir)
    projects.add(dir)
    const before = heard
    // (a folder only just watched is not yet heard from: nobody writes a tool that soon)
    await new Promise((resolve) => setTimeout(resolve, 200))
    write("thing/tools/clock.js", "export default {}")
    await expect
      .poll(() => toolsOf(projects), { timeout: 3000 })
      .toBeTypeOf("number")
    expect(heard).toBeGreaterThan(before)
    // and of its being written again, now that there is a tools/ to watch. (What
    // watches the new folder may not yet be watching the moment after it is set to: so
    // it is rewritten until that is seen, with time between for it to be taken as done.)
    const first = toolsOf(projects)!
    let names = ""
    await expect
      .poll(
        () => {
          names += "!"
          write(
            "thing/tools/clock.js",
            `export default { name: 'Clock${names}' }`
          )
          return toolsOf(projects)
        },
        { timeout: 8000, interval: 800 }
      )
      .toBeGreaterThan(first)
    projects.close()
  }, 15_000)
})
