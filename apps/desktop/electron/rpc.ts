// Talking to an agent that is not Claude Code. Codex, Grok and opencode are each run as
// a process that speaks JSON-RPC on its standard input and output, a message to a line:
// the app asks things of it, is told things by it, and is asked things in turn (may it
// run this command?). This is that line, with nothing in it of what any of them says.
import { spawn, type ChildProcess } from "node:child_process"
import readline from "node:readline"

/** What went wrong on the other side, as it said so. */
export class RpcError extends Error {
  readonly code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

/** The other side has no such method, as JSON-RPC numbers it. */
export const NO_SUCH_METHOD = -32601

export type Peer = {
  /** Ask it something, and wait for what it says. Rejects with what it said went wrong. */
  request<Result = unknown>(method: string, params?: unknown): Promise<Result>
  /** Tell it something it has nothing to say back to. */
  notify(method: string, params?: unknown): void
  /** Its last words to stderr, for when it goes without saying why. */
  stderr(): string
  /** Resolves once the process has gone. */
  readonly gone: Promise<void>
  /** End it: its input first, which lets it leave of itself, and then by force. */
  close(): void
}

export type PeerOptions = {
  cwd: string
  env: Record<string, string | undefined>
  /** whether each message says it is JSON-RPC 2.0, which Codex's leave out */
  versioned: boolean
  /** what it tells the app, with nothing wanted back */
  onNotification: (method: string, params: unknown) => void
  /**
   * What it asks of the app: what this resolves to is the answer. Rejecting with an
   * RpcError answers with that error.
   */
  onRequest: (method: string, params: unknown) => Promise<unknown>
}

type Incoming = {
  id?: number | string | null
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string }
}

/** How long a process is given to leave once its input is closed, before it is made to. */
const LEAVING_MS = 1500
/** How long what a process wrote as it left is waited for, once it has gone. */
const LAST_WORDS_MS = 300

/** The agents' processes still running, each until it has gone. */
const running = new Set<ChildProcess>()

/**
 * Stop every agent's process that is still running, as the app is quit: asked to now,
 * and made to as the app's own process goes, where it has not gone by then. (The time
 * one is otherwise given to leave by itself, LEAVING_MS, is more than an app that is
 * quitting has.)
 */
export function stopPeers() {
  for (const child of running) child.kill()
  process.once("exit", () => {
    for (const child of running)
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL")
  })
}

/** Start an agent's process and take up the line to it. */
export function startPeer(
  command: string,
  args: string[],
  options: PeerOptions
): Peer {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
    // what npm installs on Windows is a script, which only a shell can run
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
  })
  running.add(child)
  child.once("exit", () => running.delete(child))
  child.once("error", () => running.delete(child))
  let said = ""
  child.stderr.on("data", (data: Buffer) => {
    said = (said + data.toString("utf8")).slice(-2000)
  })

  let count = 0
  const waiting = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >()
  let over: Error | null = null
  const end = (error: Error) => {
    if (over) return
    over = error
    for (const { reject } of waiting.values()) reject(error)
    waiting.clear()
  }

  const write = (message: Record<string, unknown>) => {
    if (over || !child.stdin.writable) return
    child.stdin.write(
      `${JSON.stringify(options.versioned ? { jsonrpc: "2.0", ...message } : message)}\n`
    )
  }
  // a pipe that has closed under a write is the process having gone, which is heard of
  // by its exit
  child.stdin.on("error", () => {})

  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let message: Incoming
    try {
      message = JSON.parse(line) as Incoming
    } catch {
      // not one of its messages: something it printed
      return
    }
    if (typeof message !== "object" || message === null) return
    const { id, method } = message
    if (typeof method === "string") {
      if (id === undefined || id === null) {
        // (what it says that cannot be made sense of is no reason to stop listening)
        try {
          options.onNotification(method, message.params)
        } catch (error) {
          console.error("[rpc]", method, error)
        }
        return
      }
      Promise.resolve()
        .then(() => options.onRequest(method, message.params))
        .then(
          (result) => write({ id, result: result ?? {} }),
          (error: unknown) =>
            write({
              id,
              error: {
                code: error instanceof RpcError ? error.code : -32603,
                message: error instanceof Error ? error.message : String(error),
              },
            })
        )
      return
    }
    const asked = typeof id === "number" ? waiting.get(id) : undefined
    if (!asked || typeof id !== "number") return
    waiting.delete(id)
    if (message.error)
      asked.reject(
        new RpcError(
          message.error.code ?? -32603,
          message.error.message ?? "It reported an error."
        )
      )
    else asked.resolve(message.result)
  })

  const gone = new Promise<void>((resolve) => {
    child.once("error", (error) => {
      end(error)
      resolve()
    })
    child.once("exit", (code, signal) => {
      const left = () => {
        end(
          new Error(
            said.trim() ||
              (signal
                ? `It was stopped (${signal}).`
                : `It exited${code ? ` with code ${code}` : ""} before it had answered.`)
          )
        )
        resolve()
      }
      // its last words may still be on their way: they are waited for, but not for long
      const soon = setTimeout(left, LAST_WORDS_MS)
      child.once("close", () => {
        clearTimeout(soon)
        left()
      })
    })
  })

  return {
    request<Result>(method: string, params?: unknown) {
      return new Promise<Result>((resolve, reject) => {
        if (over) return reject(over)
        const id = ++count
        waiting.set(id, {
          resolve: resolve as (result: unknown) => void,
          reject,
        })
        write({ id, method, ...(params === undefined ? {} : { params }) })
      })
    },
    notify(method, params) {
      write({ method, ...(params === undefined ? {} : { params }) })
    },
    stderr: () => said.trim(),
    gone,
    close() {
      if (child.exitCode !== null || child.signalCode !== null) return
      child.stdin.end()
      const force = setTimeout(() => child.kill(), LEAVING_MS)
      void gone.then(() => clearTimeout(force))
    },
  }
}
