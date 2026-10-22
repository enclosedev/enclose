// For the tests of the agents' own runners: a turn that keeps what is done with it, and
// a stand-in for an agent's command, which is a script that speaks its protocol.
import fs from "node:fs"
import path from "node:path"

import type { ContextUse, PermissionAnswer, ThreadItem } from "../shared/api"
import { viewportTools } from "./tools"
import type { Asked, Turn } from "./turn"

/** A turn, and what came of it: the items as they stand, and what was said besides. */
export function fakeTurn(given: Partial<Turn> & Pick<Turn, "launch" | "cwd">) {
  const items = new Map<string, ThreadItem>()
  const notices: string[] = []
  const sessions: string[] = []
  const asked: Asked[] = []
  const contexts: ContextUse[] = []
  const abort = new AbortController()
  let count = 0
  const turn: Turn = {
    manner: { provider: "codex", model: null, effort: null, access: "full" },
    content: "Make a lid",
    guide: "You are running inside Enclose.",
    guideChanged: false,
    sessionId: null,
    session: (id) => sessions.push(id),
    signal: abort.signal,
    put: (item) => items.set(item.id, item),
    notice: (tone, text) => notices.push(`${tone}: ${text}`),
    doing: () => {},
    context: (use) => contexts.push(use),
    ask: async (wanted): Promise<PermissionAnswer> => {
      asked.push(wanted)
      return "allow"
    },
    touched: () => {},
    tools: { viewport: viewportTools(async () => null) },
    served: { viewport: "http://127.0.0.1:1/key/viewport" },
    lookOver: false,
    describe: (name, input) => ({
      name,
      detail: JSON.stringify(input ?? null),
    }),
    id: (kind) => `${kind}-${++count}`,
    ...given,
  }
  return {
    turn,
    abort,
    notices,
    sessions,
    asked,
    /** how full the context window was said to be, each time it was */
    contexts,
    /** the items in the order they were first put, each as it last stood */
    items: () => [...items.values()],
  }
}

/**
 * A command that is a Node script: `body` is run with `on(method, handler)` to answer
 * what it is asked, `tell(method, params)` and `ask(method, params)` to say and ask
 * things itself, and `argv`, what it was started with. Returns where the command is.
 */
export function fakeAgent(dir: string, versioned: boolean, body: string) {
  const file = path.join(
    dir,
    `agent-${Math.random().toString(36).slice(2)}.mjs`
  )
  fs.writeFileSync(
    file,
    `#!/usr/bin/env node
import readline from "node:readline"
const versioned = ${JSON.stringify(versioned)}
const send = (message) =>
  process.stdout.write(JSON.stringify(versioned ? { jsonrpc: "2.0", ...message } : message) + "\\n")
const handlers = new Map()
const waiting = new Map()
let count = 0
const on = (method, handler) => handlers.set(method, handler)
const tell = (method, params) => send({ method, params })
const ask = (method, params) =>
  new Promise((resolve) => {
    const id = "ask-" + ++count
    waiting.set(id, resolve)
    send({ id, method, params })
  })
const argv = process.argv.slice(2)
readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  const message = JSON.parse(line)
  if (message.method === undefined) {
    waiting.get(message.id)?.(message.result ?? message.error)
    waiting.delete(message.id)
    return
  }
  const handler = handlers.get(message.method)
  if (message.id === undefined) return void handler?.(message.params)
  if (!handler)
    return send({ id: message.id, error: { code: -32601, message: "Method not found: " + message.method } })
  try {
    const result = await handler(message.params)
    // (a handler that returns nothing is one that never answers)
    if (result !== undefined) send({ id: message.id, result })
  } catch (error) {
    send({ id: message.id, error: { code: -32000, message: String(error.message ?? error) } })
  }
})
process.stdin.on("end", () => process.exit(0))
${body}
`,
    { mode: 0o755 }
  )
  return file
}

/** Wait until something is so, looking often: for what a process does in its own time. */
export async function until(so: () => boolean, ms = 10_000) {
  const end = Date.now() + ms
  while (!so()) {
    if (Date.now() > end) throw new Error("It never came to be so.")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
