// One turn of a conversation, as whichever agent runs it is given it: what was asked,
// how it is to be answered, and what the agent says back with. The conversations
// (threads.ts) make one of these for each turn and hand it to the agent's own runner.
import fs from "node:fs"
import path from "node:path"

import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

import type {
  ContextUse,
  Doing,
  Manner,
  PermissionAnswer,
  ThreadItem,
} from "../shared/api"
import type { Launch } from "./providers"
import type { AppTool } from "./tools"

/** What goes into a turn: words, or words and pictures, as Claude Code takes a message. */
export type Content = SDKUserMessage["message"]["content"]

/** Something an agent wants leave for, as it is put to the user. */
export type Asked = {
  title: string
  detail: string
  /** whether "always" is among the answers: the agent can be told not to ask this again */
  canAlways: boolean
}

export type Turn = {
  /** the project's folder, which the agent works in */
  cwd: string
  /**
   * The agent goes by the settings the folder has of its own as well as the user's
   * (Claude Code's .claude/settings.json and the like): a folder the app made, one with
   * none, or one whose settings the user has said to trust (projects.ts).
   */
  ownSettings?: boolean
  /** what to start, and with what around it */
  launch: Launch
  manner: Manner
  content: Content
  /** what the agent is told about where it is, on top of its own instructions */
  guide: string
  /**
   * That is other than what the session it carries on was told: an agent that takes its
   * instructions only when a session begins has to be told again, with the message.
   */
  guideChanged: boolean
  /** the session of the agent's own that carries the conversation on, if it has had one */
  sessionId: string | null
  /** The agent says which of its sessions the conversation now is. */
  session(id: string): void
  /** set off when the turn is stopped */
  signal: AbortSignal
  /** Add an item to the conversation, or replace the one with the same id. */
  put(item: ThreadItem): void
  notice(tone: "error" | "info", text: string): void
  /**
   * Say what the agent is at where nothing shows it, or null once something does. Said
   * again only when that would be shown otherwise: not at every token thought.
   */
  doing(what: Doing | null): void
  /** Say how full the conversation's context window is, as the agent says it now. */
  context(use: ContextUse): void
  /**
   * The turn is the asking for the conversation to be compacted (see COMPACT): the agent
   * sums up what was said so far, each in its own way, and is told nothing else. What it
   * is given (`content`) is what was written, which may say what the summary is to keep.
   */
  compact?: boolean
  /**
   * Put a question to the user, and wait for the answer. Stopping the turn answers no,
   * and so does `signal`, where the agent can take a question back.
   */
  ask(asked: Asked, signal?: AbortSignal): Promise<PermissionAnswer>
  /** Something was done in the folder, or said: have the project looked at again. */
  touched(): void
  /**
   * The app's own tools, by the name of each set. An agent that cannot be handed them
   * in-process is given `served` instead: where the same sets answer over HTTP.
   */
  tools: Record<string, AppTool[]>
  served: Record<string, string>
  /**
   * The turn is the app's own asking, that a model be looked over. The agent does it
   * with the app's tools: anything else it reaches for is put to the user, whatever it
   * is let do when the user asks.
   */
  lookOver: boolean
  /**
   * The project's files are not the agent's to change in this turn: a circuit board is
   * being made in the background, and the model waits for it. The agent can read, run
   * and answer, and is let write nothing, as far as it can be kept from it.
   */
  readOnly?: boolean
  /** Nobody is there to answer a question: the agent decides, and says what it decided. */
  noQuestions?: boolean
  /**
   * More that is said to the agent while it is at work, as it comes: where the agent
   * takes more of a message in the middle of a turn. Ends with the turn.
   */
  more?: AsyncIterable<string>
  /** A tool call in a few words: what kind of thing, and on what. */
  describe(name: string, input: unknown): { name: string; detail: string }
  /** An id for an item, which no other item has. */
  id(kind: string): string
}

/**
 * What is said to an agent while it is at work, taken as it comes (a turn's `more`).
 * It ends when it is ended, which is to be done as soon as the turn has given its
 * result: the agent's session is kept open for as long as what it is told by is, and a
 * session that waits on it to end is never done with.
 */
export class Saying implements AsyncIterable<string> {
  private said: string[] = []
  private heard: (() => void) | null = null
  private ended = false

  /** Say something more. False once it has ended: there is nobody to say it to. */
  say(text: string): boolean {
    if (this.ended) return false
    this.said.push(text)
    this.heard?.()
    return true
  }

  end() {
    this.ended = true
    this.heard?.()
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    for (;;) {
      const next = this.said.shift()
      if (next !== undefined) yield next
      else if (this.ended) return
      else await new Promise<void>((resolve) => (this.heard = resolve))
    }
  }
}

/** Words, or a picture, of what an agent is given. */
export type Piece =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }

/** A turn's content as a plain run of words and pictures, in the order they come. */
export function piecesOf(content: Content): Piece[] {
  if (typeof content === "string") return [{ type: "text", text: content }]
  return content.flatMap((block): Piece[] =>
    block.type === "text"
      ? [{ type: "text", text: block.text }]
      : block.type === "image" && block.source.type === "base64"
        ? [
            {
              type: "image",
              data: block.source.data,
              mimeType: block.source.media_type,
            },
          ]
        : []
  )
}

/**
 * What an agent is told ahead of a message when what it was told of the project at the
 * start of its session no longer holds: the project has a model now, or a name.
 */
export const guideAgain = (guide: string) =>
  [
    "<enclose>",
    "What the app told you about this project when the conversation began has changed. This is how it stands now, and takes the place of what you were told then:",
    "",
    guide,
    "</enclose>",
  ].join("\n")

/** Rejects once a turn is stopped: raced against whatever is being waited for. */
export function stopped(signal: AbortSignal): Promise<never> {
  const halt = new Promise<never>((_, reject) => {
    const stop = () => reject(new Error("Stopped."))
    if (signal.aborted) stop()
    else signal.addEventListener("abort", stop, { once: true })
  })
  // nobody may be waiting on it when it happens
  halt.catch(() => {})
  return halt
}

/** A command as it is worth showing: without the shell it was wrapped in to be run. */
export function bare(command: string): string {
  const inner = /^(?:\S*\/)?(?:ba|z|da)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/.exec(
    command.trim()
  )
  return (inner?.[2] ?? command).trim()
}

/**
 * Where a file really is, links followed: its own real path where it is there, and
 * otherwise the real path of the nearest folder above it that is, with the rest of the
 * way after it. Null for a link that leads nowhere yet: what is written to it lands
 * wherever it leads.
 */
export function realPath(file: string): string | null {
  const rest: string[] = []
  let at = path.resolve(file)
  for (;;) {
    try {
      return path.join(fs.realpathSync(at), ...rest)
    } catch {
      try {
        if (fs.lstatSync(at).isSymbolicLink()) return null
      } catch {
        // not there at all: the folder above it is looked at
      }
      const up = path.dirname(at)
      if (up === at) return path.resolve(file)
      rest.unshift(path.basename(at))
      at = up
    }
  }
}

/**
 * Whether a file, given whole or from `root`, is really inside it: wherever a link on the
 * way leads, and whatever other way to the folder the agent knows it by.
 */
export function isInside(root: string, file: string): boolean {
  const base = realPath(root)
  const real = realPath(path.resolve(root, file))
  if (!base || !real) return false
  return (
    real === base ||
    real.startsWith(base.endsWith(path.sep) ? base : base + path.sep)
  )
}

/** Where an agent that speaks ACP says a call's files are, in what it was given. */
const PATH_FIELDS = ["path", "file_path", "filePath", "target_file"]

/**
 * Whether a call to change files, as an agent that speaks ACP puts it, changes only
 * files inside the project: every one it names, where it says it is and in what it was
 * given, is. A call that names none, or that carries a patch, which can name more than
 * it says, is not known to.
 */
export function changesOnlyInside(
  root: string,
  call: { locations?: { path?: string }[] | null; rawInput?: unknown }
): boolean {
  const given = (call.rawInput ?? {}) as Record<string, unknown>
  if (["patch", "patchText", "patch_text"].some((key) => key in given))
    return false
  const files = [
    ...(call.locations ?? []).map((one) => one.path),
    ...PATH_FIELDS.map((key) => given[key]),
  ].filter((file): file is string => typeof file === "string" && file !== "")
  return files.length > 0 && files.every((file) => isInside(root, file))
}

/**
 * Says where a file is as seen from a folder, for a file inside it: an agent gives the
 * whole path, and may know the folder by another way to it than the app does.
 */
export function inside(root: string): (file: string) => string {
  const roots = [root]
  try {
    const real = fs.realpathSync(root)
    if (real !== root) roots.push(real)
  } catch {
    // a folder that is not there has only the one name
  }
  return (file) => {
    const within = roots.find((one) => file.startsWith(one + path.sep))
    return within ? file.slice(within.length + 1) : file
  }
}
