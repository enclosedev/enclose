// Claude Code, as one of the agents the app runs: who is signed in to it, the models it
// offers, and the commands and skills it has. It is run through its own SDK, pointed at
// the install already on this machine, which carries whatever account the user signed in
// with.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  query,
  type AccountInfo,
  type ModelInfo,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
  type SettingSource,
  type SlashCommand,
} from "@anthropic-ai/claude-agent-sdk"

import {
  EFFORTS,
  type Command,
  type Commands,
  type Doing,
  type ModelChoice,
} from "../shared/api"
import type { Launch, Looked } from "./providers"

/**
 * Where Claude Code keeps what it knows of a folder: the conversations had there, and
 * the notes it has made about the project. It files them under the folder's path, in
 * its home, which is `home` when the user has given it another.
 */
const storeOf = (dir: string, home: string | undefined) =>
  path.join(
    home ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"),
    "projects",
    dir.replace(/[^a-zA-Z0-9]/g, "-")
  )

/**
 * A project's folder has been renamed: take what Claude Code keeps about it along, so
 * that its notes are still the project's. (A conversation can be carried on either way:
 * Claude Code finds it by its id.) If this cannot be done, nothing is lost by it.
 */
export function followRename(from: string, to: string, home?: string) {
  try {
    const [was, is] = [storeOf(from, home), storeOf(to, home)]
    if (fs.existsSync(was) && !fs.existsSync(is)) fs.renameSync(was, is)
  } catch {
    // left where it was
  }
}

/**
 * What the user would have typed after `claude`, as the SDK takes more arguments: each
 * flag by its name, with what follows it, or nothing for one that stands alone.
 */
export function extraArgs(args: string[]): Record<string, string | null> {
  const extra: Record<string, string | null> = {}
  for (let at = 0; at < args.length; at++) {
    const arg = args[at]
    if (!arg.startsWith("--") || arg.length === 2) continue
    const [name, value] = arg.slice(2).split(/=(.*)/s)
    if (value !== undefined) extra[name] = value
    else if (args[at + 1] !== undefined && !args[at + 1].startsWith("-"))
      extra[name] = args[++at]
    else extra[name] = null
  }
  return extra
}

/** How the SDK is told which Claude Code to run, and with what. */
export const running = (launch: Launch) => ({
  pathToClaudeCodeExecutable: launch.path,
  env: launch.env,
  ...(launch.args.length > 0 ? { extraArgs: extraArgs(launch.args) } : {}),
})

/** What Claude Code says of its models, as the app offers them. */
export function modelChoices(rows: ModelInfo[]): ModelChoice[] {
  const choices = rows.map((row): ModelChoice => {
    const standing = row.value === "default"
    // the default is one of the models, which the list also has under its own name
    const itself = standing
      ? rows.find(
          (other) =>
            other !== row &&
            other.resolvedModel !== undefined &&
            other.resolvedModel === row.resolvedModel
        )
      : undefined
    return {
      id: standing ? null : row.value,
      name: row.displayName,
      short: itself?.displayName ?? row.displayName,
      detail: row.description,
      efforts: EFFORTS.filter(
        (effort) =>
          row.supportsEffort && row.supportedEffortLevels?.includes(effort)
      ),
    }
  })
  if (choices.length > 0 && !choices.some((choice) => choice.id === null))
    choices.unshift({
      id: null,
      name: "Default",
      short: "Default",
      detail: "The model Claude Code is set to run",
      efforts: [],
    })
  return choices
}

/** Whether two of what an agent is at would be shown alike. */
function alike(a: Doing | null, b: Doing | null): boolean {
  if (a?.kind === "thinking" && b?.kind === "thinking")
    return a.since === b.since && a.tokens === b.tokens
  if (a?.kind === "retrying" && b?.kind === "retrying")
    return a.attempt === b.attempt && a.of === b.of
  return a === b
}

/**
 * Follows what Claude is at where nothing it says or does shows it, from the messages
 * Claude Code sends: thinking, which comes as a block of its message with no words in
 * it and an estimate of the tokens now and then; or trying the API again. `say` is
 * told each time that would be shown otherwise, and null once Claude goes on.
 */
export function followDoing(
  say: (doing: Doing | null) => void
): (message: SDKMessage) => void {
  let doing: Doing | null = null
  // the block of Claude's message it is thinking in
  let block: number | null = null
  const tell = (now: Doing | null) => {
    if (alike(doing, now)) return
    doing = now
    say(now)
  }
  return (message) => {
    if (message.type === "stream_event") {
      // a subagent's thinking is its own
      if (message.parent_tool_use_id) return
      const event = message.event
      if (event.type === "message_start") tell(null)
      else if (
        event.type === "content_block_start" &&
        (event.content_block.type === "thinking" ||
          event.content_block.type === "redacted_thinking")
      ) {
        block = event.index
        tell({ kind: "thinking", since: Date.now(), tokens: null })
      } else if (event.type === "content_block_stop" && event.index === block) {
        block = null
        tell(null)
      }
    } else if (message.type === "system") {
      // (counted by the thousand: it comes about once a second)
      if (message.subtype === "thinking_tokens" && doing?.kind === "thinking")
        tell({
          ...doing,
          tokens: Math.floor(message.estimated_tokens / 1000) * 1000,
        })
      else if (message.subtype === "api_retry") {
        block = null
        tell({
          kind: "retrying",
          attempt: message.attempt,
          of: message.max_retries,
        })
      }
    } else if (message.type === "result") {
      block = null
      tell(null)
    }
  }
}

/** How long Claude Code is given to say what it has. */
const ASKING_TIMEOUT_MS = 20_000

/**
 * Ask the installed Claude Code something about itself, through a session that is given
 * nothing to answer and is ended once it has said. Null if it would not say.
 */
async function asked<T>(
  launch: Launch,
  where: { cwd: string; settingSources: SettingSource[] },
  ask: (session: Query) => Promise<T>
): Promise<T | null> {
  const abort = new AbortController()
  const gaveUp = new Promise<never>((_, reject) =>
    abort.signal.addEventListener("abort", () => reject(new Error("ended")), {
      once: true,
    })
  )
  // nothing is ever said to it: the session is only there to be asked
  const nothing: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        gaveUp.catch(() => ({ done: true as const, value: undefined })),
    }),
  }
  const timer = setTimeout(() => abort.abort(), ASKING_TIMEOUT_MS)
  try {
    const session = query({
      prompt: nothing,
      options: { ...where, ...running(launch), abortController: abort },
    })
    return await Promise.race([ask(session), gaveUp])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    abort.abort()
  }
}

/**
 * Who Claude Code says is signed in to it: by what they pay for, or how they reach it.
 * Nobody, if it names no account and no key.
 */
export function accountOf(info: AccountInfo): {
  signedIn: boolean
  account: string | null
} {
  const elsewhere =
    info.apiProvider && info.apiProvider !== "firstParty"
      ? info.apiProvider
      : null
  const key = [info.apiKeySource, info.tokenSource].find(
    (source) => source && source !== "none"
  )
  const account =
    info.subscriptionType ?? elsewhere ?? (key ? "API key" : null) ?? info.email
  return { signedIn: account != null, account: account ?? null }
}

/**
 * What the installed Claude Code says of itself: the account it is signed in to, and
 * the models it offers that account.
 */
export async function lookAtClaude(launch: Launch): Promise<Looked> {
  const said = await asked(
    launch,
    { cwd: os.tmpdir(), settingSources: ["user"] },
    async (session) => ({
      models: await session.supportedModels(),
      // one too old to say is not one that nobody is signed in to
      account: await session.accountInfo().catch(() => null),
    })
  )
  if (!said)
    return {
      signedIn: null,
      account: null,
      trouble: "Claude Code did not answer.",
      models: [],
    }
  return {
    ...(said.account
      ? accountOf(said.account)
      : { signedIn: null, account: null }),
    trouble: null,
    models: modelChoices(said.models),
  }
}

/**
 * Claude Code's own commands that mean something in this app. The rest of them are
 * about its terminal, or set what the app sets itself: the model, how hard it thinks.
 */
const OWN_COMMANDS = ["compact", "context", "usage"]

/** A command or a skill as Claude Code lists it, as the app offers it. */
function commandChoice(row: SlashCommand): Command {
  // one that a plugin brings says whose it is twice: in its name, and before what it does
  const whose = /^([^:]+):/.exec(row.name)?.[1]
  const detail = row.description.replace(/\s+/g, " ").trim()
  return {
    name: row.name,
    detail:
      whose && detail.startsWith(`(${whose}) `)
        ? detail.slice(whose.length + 3)
        : detail,
    hint: row.argumentHint ?? "",
  }
}

/**
 * What Claude Code says it can be called on for, as the app offers it. Its commands:
 * those of its own that mean something here, then everything the user, the project or a
 * plugin has added. Its skills: every one that is not built into it.
 */
export function commandChoices(
  all: SlashCommand[],
  skills: SlashCommand[]
): Commands {
  // a name can be listed twice, as a plugin's command and as its skill: once is enough
  const once = (rows: SlashCommand[]) => {
    const seen = new Set<string>()
    return rows
      .filter((row) => !seen.has(row.name) && seen.add(row.name))
      .map(commandChoice)
  }
  return {
    commands: once([
      ...OWN_COMMANDS.flatMap(
        (name) => all.find((row) => row.builtin && row.name === name) ?? []
      ),
      ...all.filter((row) => !row.builtin),
    ]),
    skills: once(skills.filter((row) => !row.builtin)),
  }
}

/**
 * Where Claude Code takes its settings from: the user's own, and the folder's as well
 * where the folder is trusted to say what it may do (projects.ts). The folder's own
 * hooks and servers of tools run with no asking, and so does what they say.
 */
export const settingSources = (folders: boolean): SettingSource[] =>
  folders ? ["user", "project", "local"] : ["user"]

/**
 * The commands and skills the installed Claude Code has in a folder: its own, the
 * user's, the folder's (where it goes by the folder's own settings: see projects.ts),
 * and what plugins bring. None, if it would not say.
 */
export async function listCommands(
  launch: Launch | null,
  cwd: string,
  folders: boolean
): Promise<Commands> {
  const found =
    launch &&
    (await asked(
      launch,
      { cwd, settingSources: settingSources(folders) },
      async (session) =>
        commandChoices(
          await session.supportedCommands(),
          (await session.reloadSkills()).skills
        )
    ))
  return found ?? { commands: [], skills: [] }
}
