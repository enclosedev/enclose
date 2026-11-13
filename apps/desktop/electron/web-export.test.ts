import { describe, expect, it } from "vitest"

import { toolMaker, webPage, webScript } from "./web-export"

const made = (source: string) =>
  (new Function(`return (${toolMaker(source)})`)() as () => unknown)()

describe("toolMaker", () => {
  it("gives what a tool's file exports by default, with what is above and below it", () => {
    const tool = made(`const SPEED = 2
function twice(n) { return n * SPEED }
export default {
  name: "Clock",
  frame() { return twice(LATER) },
}
const LATER = 3`) as { name: string; frame(): number }
    expect(tool.name).toBe("Clock")
    expect(tool.frame()).toBe(6)
  })

  it("keeps each tool's state its own", () => {
    const source = `let count = 0
export default { next: () => ++count }`
    const a = made(source) as { next(): number }
    const b = made(source) as { next(): number }
    a.next()
    expect(a.next()).toBe(2)
    expect(b.next()).toBe(1)
  })

  it("takes what else the file exports as its own", () => {
    const tool = made(`export const NAME = "Lid"
export function name() { return NAME }
export default { name: name() }`) as { name: string }
    expect(tool.name).toBe("Lid")
  })
})

describe("webScript", () => {
  it("is a module that hands the GLB's scene to the runtime with the tools and the parts", () => {
    const script = webScript(
      "clock",
      "var EncloseRuntime = (() => ({ enclose: () => null }))();",
      [
        {
          id: "hands",
          file: "tools/hands.js",
          source: "export default { name: 'Hands' }",
        },
      ],
      { parts: [], palette: {} }
    )
    expect(script).toContain('import { enclose } from "./clock.js"')
    expect(script).toContain('{ id: "hands", load: () => {')
    expect(script).toMatch(
      /export function enclose\(root\) {\n {2}return EncloseRuntime\.enclose\(root, data, tools\)/
    )
  })
})

describe("webPage", () => {
  it("loads the model and its script from beside it, and three from the web at the app's version", () => {
    const page = webPage("clock", { title: "Table <clock>", three: "0.186" })
    expect(page).toContain("<title>Table &lt;clock&gt;</title>")
    expect(page).toContain('import { enclose } from "./clock.js"')
    expect(page).toContain('loadAsync("./clock.glb")')
    expect(page).toContain(
      "https://cdn.jsdelivr.net/npm/three@0.186/build/three.module.js"
    )
  })
})
