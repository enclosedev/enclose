import { afterEach, describe, expect, it, vi } from "vitest"

import type { FromRunner, ToRunner } from "./types"

/**
 * A worker for the runner to be run in: it has its ways out on its kind, as a browser's
 * does, and hears what the runner says back. With `stuck`, its kind's `fetch` is not to
 * be taken away.
 */
function worker(stuck = false) {
  class Scope {
    fetch() {
      return "out"
    }
    importScripts() {
      return "out"
    }
  }
  if (stuck)
    Object.defineProperty(Scope.prototype, "fetch", {
      value: () => "out",
      writable: false,
      configurable: false,
    })
  const said: FromRunner[] = []
  const scope = Object.assign(new Scope(), {
    WebSocket: class {},
    onmessage: null as ((event: { data: ToRunner }) => void) | null,
    postMessage: (message: FromRunner) => void said.push(message),
  })
  return { scope, said }
}

/** Load the runner into a worker of its own, as the window does for each tool. */
async function runIn(scope: object) {
  vi.resetModules()
  vi.stubGlobal("self", scope)
  await import("./runner")
}

const START: ToRunner = {
  type: "start",
  id: "lid",
  source: "export default { name: 'Lid' }",
  parts: [],
  values: {},
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the runner", () => {
  it("runs no tool in a worker it could not shut in, and says why", async () => {
    const { scope, said } = worker(true)
    const read = vi.spyOn(URL, "createObjectURL")
    await runIn(scope)
    scope.onmessage!({ data: START })
    await vi.waitFor(() => expect(said).toHaveLength(1))
    expect(said[0]).toEqual({
      type: "failed",
      message: expect.stringContaining("fetch") as string,
    })
    expect(read).not.toHaveBeenCalled()
  })

  it("goes on to read the tool once it is shut in", async () => {
    const { scope, said } = worker()
    // (read from where this process can load it from: a worker's own blob is not)
    const read = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue(
        `data:text/javascript,${encodeURIComponent(START.source)}`
      )
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    await runIn(scope)
    scope.onmessage!({ data: START })
    await vi.waitFor(() => expect(said).toHaveLength(1))
    expect(read).toHaveBeenCalledOnce()
    expect(said[0]).toMatchObject({ type: "ready", name: "Lid" })
    expect((scope as { fetch?: unknown }).fetch).toBeUndefined()
  })
})
