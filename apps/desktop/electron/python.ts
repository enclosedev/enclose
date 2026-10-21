// The Python that models are built with. A model is built by a script that needs Python
// and build123d, which a machine seldom has both of: where the python3 a terminal would
// run has build123d, that is the one; where it has not, the app makes a Python of its own
// with build123d in it, once, in its own folder, and puts that first on the PATH of
// whatever it starts (see cleanEnv), so that `python3 model.py` finds it - in a build,
// and in what an agent runs. It is made with uv, which fetches the Python as well, so
// nothing need be installed for it: a uv of a version the app knows, fetched for it.
import { execFile, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

import { writeWhole } from "./atomic"

const run = promisify(execFile)

/** The Python that is made: one that build123d's wheels are built for. */
const VERSION = "3.12"

/**
 * The build123d put in it: the one the app's exporter and examples are known to work
 * with, and not whatever is newest the day it is made.
 */
export const BUILD123D = "build123d==0.11.1"

/** The uv fetched to make it, for each kind of Mac and of Linux, as its release names it. */
const UV_VERSION = "0.13.1"
const UV: Partial<Record<string, { name: string; sha256: string }>> = {
  "darwin-arm64": {
    name: "uv-aarch64-apple-darwin",
    sha256: "cfe454573412ff7380d15fc7dae5997ab53ffce72fce0a78e91ddbc84001acd2",
  },
  "darwin-x64": {
    name: "uv-x86_64-apple-darwin",
    sha256: "bb7b805bdcf3d0bc8c74ceb94569e6b3e8aa35bd492acdbb9d46bf46d9d4ff6b",
  },
  "linux-arm64": {
    name: "uv-aarch64-unknown-linux-gnu",
    sha256: "9041c73c99fdc5892cf128140beb354eca9231d502068cc36e6cb53a8e59ad14",
  },
  "linux-x64": {
    name: "uv-x86_64-unknown-linux-gnu",
    sha256: "eadd9d27c134ab5ac1ffd4473b97a741407f3ea238288f03121fc4deddf90220",
  },
}

/** How long build123d is given to be imported: the first time after it is put in is slow. */
const IMPORT_TIMEOUT_MS = 120_000
/** How long making it is given, on a slow connection: it is some 200 MB to fetch. */
const MAKING_TIMEOUT_MS = 30 * 60_000

/**
 * How the Python to build with stands. theirs: the one a terminal would run has
 * build123d. ours: the app made one of its own. making: it is making one, at this step.
 */
export type PythonStatus =
  | { state: "checking" | "theirs" | "ours" }
  | { state: "making"; step: string }
  | { state: "failed"; detail: string }

export type PythonDeps = {
  /** the app's own folder for it */
  dir: string
  /** what anything is run with, before this Python is put first on its PATH */
  env: () => Record<string, string | undefined>
  /** where a command is, on the PATH a terminal would have */
  locate: (command: string) => Promise<string | null>
  /** how it stands changed */
  onChange: () => void
  /** the uv to make it with: fetched, unless something stands in */
  uv?: (dir: string, signal?: AbortSignal) => Promise<string>
}

/** Whether a Python can import build123d. */
async function hasBuild123d(
  python: string,
  env: Record<string, string | undefined>
): Promise<boolean> {
  try {
    await run(python, ["-c", "import build123d"], {
      env,
      timeout: IMPORT_TIMEOUT_MS,
    })
    return true
  } catch {
    return false
  }
}

/** The last thing a command that failed said, as far as it says why. */
function why(error: unknown): string {
  const said = (error as { stderr?: unknown }).stderr
  const last =
    typeof said === "string"
      ? said
          .trim()
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .at(-1)
      : undefined
  return last ?? (error instanceof Error ? error.message : String(error))
}

/** Whether a process is still there to be signalled. */
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // (there, and somebody else's)
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Fetch the uv the app knows into a folder, and say where it is. */
export async function fetchUv(
  dir: string,
  signal?: AbortSignal
): Promise<string> {
  const known = UV[`${process.platform}-${process.arch}`]
  if (!known)
    throw new Error(
      "Enclose cannot set up Python on this kind of machine by itself."
    )
  const uv = path.join(dir, known.name, "uv")
  if (fs.existsSync(uv)) return uv
  const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${known.name}.tar.gz`
  const response = await fetch(url, { signal })
  if (!response.ok)
    throw new Error(`Could not download uv (${response.status}).`)
  const bytes = Buffer.from(await response.arrayBuffer())
  // what was fetched is run: it is to be the very file the app was made knowing
  if (createHash("sha256").update(bytes).digest("hex") !== known.sha256)
    throw new Error("The uv that was downloaded is not the one expected.")
  fs.mkdirSync(dir, { recursive: true })
  const archive = path.join(dir, `${known.name}.tar.gz`)
  fs.writeFileSync(archive, bytes)
  try {
    await run("tar", ["-xzf", archive, "-C", dir])
  } finally {
    fs.rmSync(archive, { force: true })
  }
  return uv
}

export class Python {
  private readonly deps: PythonDeps
  private status: PythonStatus = { state: "checking" }
  private looking: Promise<boolean> | null = null
  /** stops what is run to make it, or to look at it: the app is being quit */
  private readonly stopping = new AbortController()
  /** what is running to make it, by process id, while it is */
  private making = new Set<number>()

  constructor(deps: PythonDeps) {
    this.deps = deps
  }

  /** The app's own Python, in its folder. */
  private get env() {
    return path.join(this.deps.dir, "env")
  }

  /**
   * Where it says what is running to make it, while it is: an app quit in the middle of
   * it, without stopping that (it went down, say), finds there the next time it is
   * opened that something may still be writing into it.
   */
  private get marker() {
    return path.join(this.deps.dir, "making.json")
  }

  /** Something was started to make it: written down, for the next run of the app. */
  private started(child: ChildProcess | undefined) {
    if (child?.pid === undefined) return
    const { pid } = child
    this.making.add(pid)
    child.once("exit", () => this.making.delete(pid))
    try {
      fs.mkdirSync(this.deps.dir, { recursive: true })
      writeWhole(
        this.marker,
        JSON.stringify({ at: Date.now(), pids: [...this.making] })
      )
    } catch {
      // (it is not known then, the next time, that it may still be at it)
    }
  }

  /**
   * Whether what an earlier run of the app started to make it may still be writing into
   * it: one of the processes it wrote down is still there, and not long enough ago for
   * it to have been given up on. Nothing is stopped for it: a process of that number
   * may be somebody else's by now.
   */
  private stillMaking(): boolean {
    let left: { at?: unknown; pids?: unknown }
    try {
      left = JSON.parse(fs.readFileSync(this.marker, "utf8")) as typeof left
    } catch {
      return false
    }
    return (
      typeof left.at === "number" &&
      Date.now() - left.at < MAKING_TIMEOUT_MS &&
      Array.isArray(left.pids) &&
      left.pids.some(
        (pid) =>
          Number.isInteger(pid) &&
          pid > 0 &&
          pid !== process.pid &&
          !this.making.has(pid as number) &&
          alive(pid as number)
      )
    )
  }

  /** Run something to make it with, which is stopped if the app is quit. */
  private async running(
    command: string,
    args: string[],
    options: Parameters<typeof run>[2]
  ) {
    const going = run(command, args, {
      ...options,
      signal: this.stopping.signal,
    })
    this.started(going.child)
    return going
  }

  /** Stop whatever is being run to make it, as the app is quit. */
  close() {
    this.stopping.abort()
  }

  /** What to put first on the PATH: the app's own Python's folder, where that is in use. */
  bin(): string | null {
    return this.status.state === "ours" ? path.join(this.env, "bin") : null
  }

  /** How it stands, as the window has it. */
  get(): PythonStatus {
    return this.status
  }

  private set(status: PythonStatus) {
    this.status = status
    this.deps.onChange()
  }

  /**
   * Have a Python with build123d to build with: the app's own, where it made one; the
   * one a terminal would run, where that has it; or one made now. Resolves to whether
   * there is one. Asked again after it failed, it tries again.
   */
  ready(): Promise<boolean> {
    this.looking ??= this.look().then((found) => {
      if (!found) this.looking = null
      return found
    })
    return this.looking
  }

  private async look(): Promise<boolean> {
    const env = this.deps.env()
    const ours = path.join(this.env, "bin", "python3")
    if (fs.existsSync(ours) && (await hasBuild123d(ours, env))) {
      this.set({ state: "ours" })
      return true
    }
    const theirs = await this.deps.locate("python3")
    // (a Mac's own is too old for build123d, and one with no developer tools installed
    // asks for them, in a window, when it is run)
    if (
      theirs &&
      !(process.platform === "darwin" && theirs === "/usr/bin/python3") &&
      (await hasBuild123d(theirs, env))
    ) {
      this.set({ state: "theirs" })
      return true
    }
    return this.make(env)
  }

  /** Make the app's own Python, with build123d in it. */
  private async make(env: Record<string, string | undefined>) {
    const options = {
      env: {
        ...env,
        // the Python it is made from is the app's own too, kept beside it, and not one
        // that something else may take away
        UV_PYTHON_INSTALL_DIR: path.join(this.deps.dir, "runtimes"),
        UV_PYTHON_PREFERENCE: "only-managed",
      },
      timeout: MAKING_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    }
    // (one half made the last time is made again: but not while something may still be
    // writing it)
    if (this.stillMaking()) {
      this.set({
        state: "failed",
        detail:
          "Python was still being set up when Enclose last closed. Try again in a few minutes.",
      })
      return false
    }
    try {
      this.set({ state: "making", step: "Getting uv" })
      const uv = await (this.deps.uv ?? fetchUv)(
        path.join(this.deps.dir, "uv"),
        this.stopping.signal
      )
      this.set({ state: "making", step: "Getting Python" })
      fs.rmSync(this.env, { recursive: true, force: true })
      await this.running(
        uv,
        ["venv", "--seed", "--no-cache", "--python", VERSION, this.env],
        options
      )
      this.set({ state: "making", step: "Getting build123d" })
      await this.running(
        uv,
        [
          "pip",
          "install",
          "--no-cache",
          // (or the first model built would wait while Python compiles all of it)
          "--compile-bytecode",
          "--python",
          path.join(this.env, "bin", "python3"),
          BUILD123D,
        ],
        options
      )
      if (!(await hasBuild123d(path.join(this.env, "bin", "python3"), env)))
        throw new Error(
          "build123d was installed, but Python could not load it."
        )
      this.set({ state: "ours" })
      return true
    } catch (error) {
      console.error("[python]", error)
      this.set({ state: "failed", detail: why(error) })
      return false
    } finally {
      if (this.making.size === 0) fs.rmSync(this.marker, { force: true })
    }
  }
}
