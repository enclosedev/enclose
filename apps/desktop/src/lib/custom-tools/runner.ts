// Where a project's tool runs: a worker of its own, which has none of the window in it.
// A tool is code that came with a project's folder, written by an agent or by anyone,
// and is run without being read: so it is given the model's parts, by name and size,
// and can say where they go, and that is all. It has no way to the app, the files or
// the network from here, and one that never comes back from a frame holds up nothing
// but itself.
//
// Two things keep it from the network. What a worker is given to reach it with is taken
// away (shut-in.ts). And the window's policy (shared/content-policy.ts), which a worker
// made by the window has too, lets nothing be fetched from anywhere else, and no script
// in: so a tool cannot `import` from an address, nor make code up to run, which no list
// of names could stop. (`npm run sandbox` runs a tool that tries all of it, in the app.)
import { declared } from "./declare"
import { Running } from "./running"
import { shutIn } from "./shut-in"
import type { FromRunner, ToRunner } from "./types"

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ToRunner>) => void) | null
  postMessage(message: FromRunner, transfer?: Transferable[]): void
}

/** What went wrong, with the line of the tool's file it went wrong on where that is known. */
function wordsOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const line = /blob:[^\s)]+?:(\d+):\d+/.exec(error.stack ?? "")?.[1]
  const kind = error.name && error.name !== "Error" ? `${error.name}: ` : ""
  return `${kind}${error.message}${line ? ` (line ${line})` : ""}`
}

let running: Running | null = null
/** how many things done to its controls it has heard of */
let count = 0

async function start(message: Extract<ToRunner, { type: "start" }>) {
  const left = shutIn(self)
  if (left.length > 0)
    throw new Error(
      `It was not run: its way out by ${left.join(", ")} could not be taken away.`
    )
  const url = URL.createObjectURL(
    new Blob([message.source], { type: "text/javascript" })
  )
  try {
    const module = (await import(/* @vite-ignore */ url)) as {
      default?: unknown
    }
    running = new Running(
      declared(module.default, message.id, message.values),
      message.parts
    )
    scope.postMessage({
      type: "ready",
      name: running.name,
      controls: running.standing(),
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

scope.onmessage = ({ data }) => {
  const failed = (error: unknown) => {
    running = null
    scope.postMessage({ type: "failed", message: wordsOf(error) })
  }
  try {
    if (data.type === "start") return void start(data).catch(failed)
    if (!running) return
    if (data.type === "tick") {
      const frame = running.tick(data.now, count)
      scope.postMessage(frame, frame.poses ? [frame.poses.matrices.buffer] : [])
    } else {
      count = data.count
      if (data.type === "set") running.set(data.control, data.value, true)
      else running.press(data.control, data.option)
    }
  } catch (error) {
    failed(error)
  }
}
