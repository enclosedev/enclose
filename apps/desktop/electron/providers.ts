// The agents the app can put a message to: Claude Code, Codex, Grok, opencode. Each is
// its maker's command-line agent, already installed on this machine and signed in
// there. This finds them, keeps what the user has chosen about each, and says what
// each is started with.
import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import {
  PROVIDERS,
  type ModelChoice,
  type Provider,
  type ProviderId,
  type ProviderSettings,
  type ProviderStatus,
  type ProviderUpdated,
} from "../shared/api"
import type { SettingsStore } from "./settings"
import {
  newer,
  newestOf,
  runUpdate,
  updateCommand,
  wayOf,
  type Command,
} from "./updates"

const run = promisify(execFile)

/** An agent as it is run: what to start, and with what around it. */
export type Launch = {
  path: string
  /** more to start it with, from what the user chose */
  args: string[]
  env: Record<string, string | undefined>
}

/** What an agent says of itself when it is asked. */
export type Looked = {
  /** where it says so itself, in place of what `--version` printed */
  version?: string | null
  signedIn: boolean | null
  account: string | null
  trouble: string | null
  models: ModelChoice[]
}

/** What each is called on a command line, and what it reads where its home is from. */
const CLI: Record<ProviderId, { command: string; home: string | null }> = {
  claude: { command: "claude", home: "CLAUDE_CONFIG_DIR" },
  codex: { command: "codex", home: "CODEX_HOME" },
  grok: { command: "grok", home: null },
  opencode: { command: "opencode", home: null },
}

// What a Claude Code session sets for the processes it starts. If this app is launched
// from inside one (a terminal in an editor, say), the agents it starts must not inherit
// them, or Claude Code would take itself for a child of that session.
const PARENT_SESSION = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_AGENT_SDK_VERSION",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
]

/** A folder to put first on the PATH of anything started: the app's own Python's, say. */
let first: () => string | null = () => null

/** Have a folder put first on the PATH of anything started, while it says one. */
export function putFirstOnPath(folder: () => string | null) {
  first = folder
}

/**
 * The environment to start anything with: ours, minus what belongs to a parent session,
 * with the app's own Python first on the PATH where it has one.
 */
export function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const key of PARENT_SESSION) delete env[key]
  delete env.VITE_DEV_SERVER_URL
  const folder = first()
  if (folder) env.PATH = [folder, env.PATH].filter(Boolean).join(path.delimiter)
  return env
}

/** A path as it was typed, with the home folder written out. */
export const expandHome = (given: string) =>
  given === "~" || given.startsWith("~/") || given.startsWith("~\\")
    ? path.join(os.homedir(), given.slice(2))
    : given

/**
 * What is typed after a command's name, as the words a shell would make of it: split at
 * the spaces, but for what is in quotation marks, which is one word without them.
 */
export function splitArgs(typed: string): string[] {
  const words: string[] = []
  let word: string | null = null
  let quote: string | null = null
  for (let at = 0; at < typed.length; at++) {
    const char = typed[at]
    if (quote) {
      if (char === quote) quote = null
      else if (char === "\\" && quote === '"' && at + 1 < typed.length)
        word = (word ?? "") + typed[++at]
      else word = (word ?? "") + char
    } else if (char === '"' || char === "'") {
      quote = char
      word ??= ""
    } else if (/\s/.test(char)) {
      if (word !== null) words.push(word)
      word = null
    } else if (char === "\\" && at + 1 < typed.length) {
      word = (word ?? "") + typed[++at]
    } else word = (word ?? "") + char
  }
  if (word !== null) words.push(word)
  return words
}

function executable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

function onPath(name: string): string | null {
  const names =
    process.platform === "win32" && !path.extname(name)
      ? [`${name}.exe`, `${name}.cmd`]
      : [name]
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue
    for (const one of names) {
      const file = path.join(dir, one)
      if (executable(file)) return file
    }
  }
  return null
}

/**
 * An app opened from the Dock or Finder gets a bare PATH, without the directories a
 * terminal adds - which is where `claude`, `python3` and the rest live. Ask the login
 * shell what PATH it would use, and adopt it. Once is enough, once it has answered, until
 * the agents are looked at again on purpose. A
 * shell with a lot in its profile can take many seconds over it, the first time after
 * the machine was started above all: it is given that long, and one that was given up
 * on is asked again the next time something is looked for, or the app would go on
 * finding no agent until it was opened again.
 */
let adopted: Promise<void> | null = null
/**
 * The one login shell to ask for the PATH a terminal would have: the user's own
 * (`$SHELL`) where that is a shell to be found - a path that is there, or a bare name the
 * PATH answers to - and otherwise the first that is always there. The user's own is asked
 * alone, and never fallen back from: falling past a shell that is only slow to answer (a
 * heavy profile, the first time after the machine was started) would take the bare
 * `/bin/sh` below it instead, whose profile is a different and often stale one, and keep
 * the PATH it gives - the very "no agent found" the note above is about. Falling back is
 * for when there is no `$SHELL` to ask at all, which is what an Arch box is often
 * launched with.
 */
export function loginShell(): string | null {
  const own = process.env.SHELL
  // a bare name (no path) is left to be found on the PATH, as when it is run
  if (own && (own.includes("/") ? executable(own) : true)) return own
  // A Mac's own login shell is zsh, whose profile (`~/.zprofile`) is where Homebrew and
  // the agents put their PATH: asked for first there. Elsewhere bash is what a box is
  // launched with.
  const alwaysThere =
    process.platform === "darwin"
      ? ["/bin/zsh", "/bin/bash", "/bin/sh"]
      : ["/bin/bash", "/bin/sh", "/bin/zsh"]
  return alwaysThere.find((one) => executable(one)) ?? null
}
function adoptShellPath(): Promise<void> {
  if (adopted) return adopted
  // Ask the shell once. Where there is none to ask, or it did not answer, it is asked
  // again the next time something is looked for, so the reset has to happen after the
  // async part has run: set from inside its own body it would be overwritten by the
  // `adopted =` below before it took effect.
  const asked = (async () => {
    if (process.platform === "win32") return true
    const shell = loginShell()
    if (!shell) return false
    try {
      const { stdout } = await run(
        shell,
        ["-ilc", 'printf "__PATH__%s__PATH__" "$PATH"'],
        { timeout: 20_000 }
      )
      const found = /__PATH__(.*)__PATH__/s.exec(stdout)?.[1]
      if (found) process.env.PATH = found
      return true
    } catch {
      return false
    }
  })()
  adopted = asked.then((answered) => {
    if (!answered) adopted = null
  })
  return adopted
}

/** Where a command is: looked for on the PATH by its name, or taken for a path. */
export async function locate(command: string): Promise<string | null> {
  const given = expandHome(command)
  if (given.includes("/") || given.includes(path.sep))
    return executable(given) ? path.resolve(given) : null
  const file = onPath(given)
  if (file) return file
  await adoptShellPath()
  return onPath(given)
}

/** The version a command prints of itself, as far as it is one. */
async function versionOf(
  file: string,
  env: Record<string, string | undefined>
): Promise<string | null> {
  try {
    const { stdout, stderr } = await run(file, ["--version"], {
      timeout: 8000,
      env,
    })
    return (
      /\b(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\b/.exec(`${stdout}\n${stderr}`)?.[1] ??
      null
    )
  } catch {
    // it is there but would not report a version; still worth trying to run
    return null
  }
}

export type ProvidersDeps = {
  settings: SettingsStore
  /** each agent's own way of saying who is signed in to it and what models it has */
  look: Record<ProviderId, (launch: Launch) => Promise<Looked>>
  /** something of what is known of them changed: the window is to hear of it */
  onChange: () => void
  /** how newer versions are found and put in: as they are, unless something stands in */
  updates?: { newest: typeof newestOf; run: typeof runUpdate }
}

const UPDATES = { newest: newestOf, run: runUpdate }

export class Providers {
  private readonly deps: ProvidersDeps
  private statuses = new Map<ProviderId, ProviderStatus>()
  private models = new Map<ProviderId, ModelChoice[]>()
  /** what is being found out about each, one thing after another */
  private queues = new Map<ProviderId, Promise<void>>()
  /** how many things are yet to be found out about each */
  private waiting = new Map<ProviderId, number>()
  /** a newer version of each in use than the one installed, and what puts it in */
  private newest = new Map<ProviderId, { version: string; command: Command }>()
  /** the ones being updated now */
  private updating = new Set<ProviderId>()
  /**
   * Each has been looked for once: what is installed is known, and the PATH a terminal
   * would have has been taken up if it was needed to find them.
   */
  readonly found: Promise<void>

  constructor(deps: ProvidersDeps) {
    this.deps = deps
    this.found = Promise.all(
      PROVIDERS.map((id) => this.next(id, () => this.find(id)))
    ).then(() => {})
    // who is signed in and what models there are takes longer, and is asked after; and
    // after that, whether there is a newer version of it
    void this.found.then(() => {
      for (const id of PROVIDERS) {
        void this.next(id, () => this.ask(id))
        void this.next(id, () => this.lookNewer(id, false))
      }
    })
  }

  /** One thing at a time is found out about an agent, in the order asked for. */
  private next(id: ProviderId, what: () => Promise<void>): Promise<void> {
    this.waiting.set(id, (this.waiting.get(id) ?? 0) + 1)
    const queued = (this.queues.get(id) ?? Promise.resolve())
      .then(what)
      .catch((error: unknown) => console.error(`[${id}]`, error))
      .then(() => {
        const left = (this.waiting.get(id) ?? 1) - 1
        this.waiting.set(id, left)
        if (left === 0) this.deps.onChange()
      })
    this.queues.set(id, queued)
    return queued
  }

  private env(id: ProviderId, settings: ProviderSettings) {
    const env = cleanEnv()
    for (const { name, value } of settings.env) if (name) env[name] = value
    const home = CLI[id].home
    if (home && settings.home) env[home] = expandHome(settings.home)
    return env
  }

  /** Look for an agent: where it is, and what version. */
  private async find(id: ProviderId) {
    const settings = this.deps.settings.provider(id)
    let file = await locate(settings.binary || CLI[id].command)
    // Claude Code is run through its SDK, which wants the file itself
    if (file && id === "claude") file = fs.realpathSync(file)
    const version = file ? await versionOf(file, this.env(id, settings)) : null
    const was = this.statuses.get(id)
    this.statuses.set(id, {
      path: file,
      version,
      signedIn: was?.path === file ? was.signedIn : null,
      account: was?.path === file ? was.account : null,
      trouble: null,
      checkedAt: Date.now(),
    })
    if (!file) this.models.delete(id)
    this.deps.onChange()
  }

  /** Ask an agent that is installed and switched on who is signed in, and for its models. */
  private async ask(id: ProviderId) {
    const launch = this.launch(id)
    const status = this.statuses.get(id)
    if (!launch || !status) return
    const looked = await this.deps.look[id](launch).catch(
      (error: unknown): Looked => ({
        signedIn: null,
        account: null,
        trouble: error instanceof Error ? error.message : String(error),
        models: [],
      })
    )
    // looked for again meanwhile, and found elsewhere or not at all
    if (this.statuses.get(id) !== status) return
    this.statuses.set(id, {
      ...status,
      version: looked.version ?? status.version,
      signedIn: looked.signedIn,
      account: looked.account,
      trouble: looked.trouble,
      checkedAt: Date.now(),
    })
    if (looked.models.length > 0) this.models.set(id, looked.models)
    this.deps.onChange()
  }

  /**
   * Whether there is a newer version of one in use than the one installed, and how it
   * would be put in: by the way it was installed, which a newer one is only offered for
   * where it can be told. What npm said is kept an hour, unless it is asked `fresh`.
   */
  private async lookNewer(id: ProviderId, fresh: boolean) {
    const launch = this.launch(id)
    const installed = this.statuses.get(id)?.version
    const way = launch ? wayOf(id, launch.path) : null
    const command =
      launch && way
        ? updateCommand(
            id,
            launch.path,
            way,
            way.kind === "brew" ? await locate("brew") : null
          )
        : null
    const newest =
      launch && way && command && installed
        ? await (this.deps.updates ?? UPDATES).newest(
            id,
            launch.path,
            way,
            launch.env,
            fresh
          )
        : null
    if (command && installed && newest && newer(installed, newest))
      this.newest.set(id, { version: newest, command })
    else this.newest.delete(id)
    this.deps.onChange()
  }

  /**
   * One turned a message away for want of a sign-in. What it says of its account is only
   * what it has kept of it, which it goes on saying when the sign-in has run out: until
   * it is looked at again, it is taken for signed out.
   */
  signedOut(id: ProviderId) {
    const status = this.statuses.get(id)
    if (!status || status.signedIn === false) return
    this.statuses.set(id, { ...status, signedIn: false, checkedAt: Date.now() })
    this.deps.onChange()
  }

  /** Look again, for each in use, at whether there is a newer version of it. */
  lookForUpdates() {
    for (const id of PROVIDERS)
      void this.next(id, () => this.lookNewer(id, false))
  }

  /**
   * Put in the newest version of one, the way it was installed, and look at it all again
   * after: whether it is the newer one now, and whether it answers.
   */
  async update(id: ProviderId): Promise<ProviderUpdated> {
    const newest = this.newest.get(id)
    const launch = this.launch(id)
    if (!newest || !launch || this.updating.has(id))
      return {
        outcome: "same",
        version: this.statuses.get(id)?.version ?? null,
      }
    this.updating.add(id)
    this.deps.onChange()
    const done = await (this.deps.updates ?? UPDATES).run(
      newest.command,
      launch.env
    )
    if (!done.ok)
      console.error(`[${id}] ${newest.command.said}\n${done.output}`)
    this.updating.delete(id)
    await this.check(id)
    const now = this.statuses.get(id)
    const version = now?.version ?? null
    return {
      outcome: !done.ok
        ? "failed"
        : !now?.path || !version || now.trouble
          ? "broken"
          : version === newest.version || newer(newest.version, version)
            ? "updated"
            : "same",
      version,
    }
  }

  /** Each of them, as the window has it. */
  list(): Provider[] {
    return PROVIDERS.map((id) => {
      const newest = this.newest.get(id)
      return {
        id,
        settings: this.deps.settings.provider(id),
        status: this.statuses.get(id) ?? null,
        checking: (this.waiting.get(id) ?? 0) > 0,
        models: this.models.get(id) ?? [],
        update: newest
          ? { version: newest.version, command: newest.command.said }
          : null,
        updating: this.updating.has(id),
      }
    })
  }

  /** What to start an agent with: null if it is switched off, or is not installed. */
  launch(id: ProviderId): Launch | null {
    const settings = this.deps.settings.provider(id)
    const file = this.statuses.get(id)?.path
    if (!file || !settings.enabled) return null
    return {
      path: file,
      args: splitArgs(settings.args),
      env: this.env(id, settings),
    }
  }

  /** Whether there is any agent at all to put something to. */
  any(): boolean {
    return PROVIDERS.some((id) => this.launch(id) !== null)
  }

  /**
   * Change what is chosen about one. What only the window goes by (which models are
   * shown) is kept and no more; anything that changes what is run has it looked at again.
   */
  change(id: ProviderId, patch: unknown): Promise<void> {
    const was = this.deps.settings.provider(id)
    const now = this.deps.settings.setProvider(id, patch)
    this.deps.onChange()
    const same =
      was.enabled === now.enabled &&
      was.binary === now.binary &&
      was.home === now.home &&
      was.args === now.args &&
      JSON.stringify(was.env) === JSON.stringify(now.env)
    return same ? Promise.resolve() : this.check(id)
  }

  /**
   * Look at one of them again, or at them all. The terminal's PATH is asked for afresh
   * first: an installer puts its folder on it, and what was installed since the app
   * opened is found only there.
   */
  check(id?: ProviderId): Promise<void> {
    adopted = null
    return Promise.all(
      (id ? [id] : PROVIDERS).map((one) =>
        this.next(one, async () => {
          await this.find(one)
          await this.ask(one)
          await this.lookNewer(one, true)
        })
      )
    ).then(() => {})
  }
}
