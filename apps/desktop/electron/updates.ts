// Newer versions of the agents, and putting them in. Each is updated the way it was
// installed, which is told by where it is on disk: by its makers' own updater, by
// Homebrew, or by the npm whose folder it is in. Never by whichever npm comes first on the
// PATH: that one may belong to another Node, and put a copy of its own in front of the
// one there was, which is how a working Claude Code gives way to a broken one.
import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import type { ProviderId } from "../shared/api"

const run = promisify(execFile)

/** How long the newest version of something is taken to stay the newest, in ms. */
const NEWEST_FOR_MS = 60 * 60 * 1000
/** How long the npm registry, or an agent, is given to say what is newest. */
const ASKING_MS = 15_000
/** How long an update is given: a download, and Homebrew's own housekeeping. */
const UPDATING_MS = 10 * 60 * 1000

/** Each one's package on npm, which is where the newest of it is read for those on it. */
const PACKAGES: Partial<Record<ProviderId, string>> = {
  claude: "@anthropic-ai/claude-code",
  codex: "@openai/codex",
}

/** Codex's makers' installer, as they have it typed: run again, it updates what it put in. */
const CODEX_INSTALLER = "curl -fsSL https://chatgpt.com/codex/install.sh | sh"

/**
 * A command to run: what, with what, and as it would be typed. `first` is a folder put
 * before the rest of the PATH, for an npm to be run by the Node it belongs to.
 */
export type Command = {
  file: string
  args: string[]
  said: string
  first?: string
}

/**
 * How one was installed, and so how it is updated, with where its newest version is
 * read. `channel` is the npm release it follows: Homebrew's Claude Code is a week behind
 * the newest, on what npm calls stable.
 */
export type Way =
  | { kind: "own"; channel: "latest" }
  | { kind: "brew"; cask: string; channel: "latest" | "stable" }
  | { kind: "npm"; prefix: string; channel: "latest" }
  | { kind: "installer"; channel: "latest" }

const real = (file: string) => {
  try {
    return fs.realpathSync(file)
  } catch {
    return file
  }
}

/**
 * How an agent found at `file` was installed: null where that cannot be told, which is
 * one the user pointed the app at, or one put in some way the app does not know.
 */
export function wayOf(
  id: ProviderId,
  file: string,
  home = os.homedir()
): Way | null {
  const where = real(file).replaceAll("\\", "/")
  const cask = /\/Caskroom\/([^/]+)\//.exec(where)?.[1]
  if (cask)
    return {
      kind: "brew",
      cask,
      channel: id === "claude" && cask === "claude-code" ? "stable" : "latest",
    }
  const pkg = PACKAGES[id]
  if (pkg) {
    const at = where.indexOf(`/lib/node_modules/${pkg}/`)
    if (at > 0)
      return { kind: "npm", prefix: where.slice(0, at), channel: "latest" }
  }
  if (id === "grok") return { kind: "own", channel: "latest" }
  if (id === "claude" && where.startsWith(`${home}/.local/share/claude/`))
    return { kind: "own", channel: "latest" }
  if (
    id === "codex" &&
    (where.startsWith(`${home}/.codex/`) ||
      where === `${home}/.local/bin/codex`)
  )
    return { kind: "installer", channel: "latest" }
  return null
}

/**
 * What is run to update one installed that way: its own updater, Homebrew's, the npm of
 * the Node it was installed with, told where that keeps what it installs, or its makers'
 * installer again. Null where none would do.
 */
export function updateCommand(
  id: ProviderId,
  file: string,
  way: Way | null,
  brew: string | null
): Command | null {
  if (!way) return null
  if (way.kind === "own")
    return { file, args: ["update"], said: `${path.basename(file)} update` }
  if (way.kind === "brew")
    return brew
      ? {
          file: brew,
          args: ["upgrade", "--cask", way.cask],
          said: `brew upgrade --cask ${way.cask}`,
        }
      : null
  if (way.kind === "npm") {
    const npm = path.join(way.prefix, "bin", "npm")
    const pkg = PACKAGES[id]
    if (!pkg || !fs.existsSync(npm)) return null
    return {
      file: npm,
      args: ["install", "-g", "--prefix", way.prefix, `${pkg}@latest`],
      said: `npm install -g ${pkg}@latest`,
      first: path.dirname(npm),
    }
  }
  return {
    file: "/bin/sh",
    args: ["-c", CODEX_INSTALLER],
    said: CODEX_INSTALLER,
  }
}

/**
 * Whether `than` is a newer version than `of`. Versions are compared a number at a time;
 * one that is not yet released, `1.2.0-beta`, comes before the release it leads to.
 */
export function newer(of: string, than: string): boolean {
  const parts = (version: string) => {
    const [main, pre] = version.trim().replace(/^v/, "").split("-", 2)
    return { numbers: main.split(".").map((n) => Number(n) || 0), pre }
  }
  const a = parts(of)
  const b = parts(than)
  for (let at = 0; at < Math.max(a.numbers.length, b.numbers.length); at++) {
    const x = a.numbers[at] ?? 0
    const y = b.numbers[at] ?? 0
    if (x !== y) return y > x
  }
  return a.pre !== undefined && b.pre === undefined
}

/** What the npm registry has said is newest, by package and release, and when. */
const said = new Map<string, { version: string | null; at: number }>()

/** The newest of a package npm has, on a release; null if it would not say. */
async function fromNpm(
  pkg: string,
  channel: string,
  fresh: boolean
): Promise<string | null> {
  const key = `${pkg}@${channel}`
  const before = said.get(key)
  if (!fresh && before && Date.now() - before.at < NEWEST_FOR_MS)
    return before.version
  let version: string | null = null
  try {
    const answer = await fetch(
      `https://registry.npmjs.org/-/package/${pkg}/dist-tags`,
      { signal: AbortSignal.timeout(ASKING_MS) }
    )
    if (answer.ok) {
      const tags = (await answer.json()) as Record<string, unknown>
      version = typeof tags[channel] === "string" ? tags[channel] : null
    }
  } catch {
    // offline, or npm is: nothing is newer that is known of
  }
  said.set(key, { version, at: Date.now() })
  return version
}

/** The newest Grok there is, on the release it follows, as it says itself. */
async function fromGrok(
  file: string,
  env: Record<string, string | undefined>
): Promise<string | null> {
  try {
    const { stdout } = await run(file, ["update", "--check", "--json"], {
      env,
      timeout: ASKING_MS,
      cwd: os.tmpdir(),
    })
    const answer = JSON.parse(stdout) as { latestVersion?: unknown }
    return typeof answer.latestVersion === "string"
      ? answer.latestVersion
      : null
  } catch {
    return null
  }
}

/**
 * The newest version of one installed that way, from where its makers say it; null if
 * that is not known. What npm said is kept an hour, unless it is to be asked `fresh`.
 */
export function newestOf(
  id: ProviderId,
  file: string,
  way: Way,
  env: Record<string, string | undefined>,
  fresh: boolean
): Promise<string | null> {
  const pkg = PACKAGES[id]
  if (pkg) return fromNpm(pkg, way.channel, fresh)
  return fromGrok(file, env)
}

/** Run an update: whether it went through, and the last of what it printed. */
export async function runUpdate(
  command: Command,
  env: Record<string, string | undefined>
): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await run(command.file, command.args, {
      env: {
        ...env,
        ...(command.first
          ? {
              PATH: [command.first, env.PATH]
                .filter(Boolean)
                .join(path.delimiter),
            }
          : {}),
        // asked nothing, as there is nobody at a terminal to answer
        CODEX_NON_INTERACTIVE: "true",
      },
      timeout: UPDATING_MS,
      cwd: os.tmpdir(),
      maxBuffer: 16 * 1024 * 1024,
    })
    return { ok: true, output: `${stdout}\n${stderr}`.trim().slice(-2000) }
  } catch (error) {
    const {
      stdout = "",
      stderr = "",
      message,
    } = error as {
      stdout?: string
      stderr?: string
      message: string
    }
    return {
      ok: false,
      output: `${stdout}\n${stderr}`.trim().slice(-2000) || message,
    }
  }
}
