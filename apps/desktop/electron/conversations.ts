// The conversations had about each project, as they are kept on disk: a folder for each
// project, and in it a file for each conversation. Nothing here takes one away but
// `forgetConversations`, which is for a project taken off the list.
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { PROVIDERS, type ProviderId, type ThreadItem } from "../shared/api"
import { setAside, writeWhole, writeWholeSoon } from "./atomic"

export type Conversation = {
  id: string
  /** whose agent it is had with: the one it began with, and is carried on with */
  provider: ProviderId
  /** that agent's own session that carries it on, once it has one */
  sessionId: string | null
  /**
   * What that session was last told of the project, as a mark of it: an agent that
   * takes such things only when a session begins is told again when they change.
   */
  guided: string | null
  /**
   * What that session was last told of the project's inspiration board, as a mark of it:
   * it is told again when the board changes. None, where it has been told nothing of one.
   */
  inspired?: string
  /** what the user has called it; until they do, it goes by the first thing said in it */
  name: string | null
  items: ThreadItem[]
  /** what one of its messages comes to in a few words, and which message: see gist.ts */
  gist: { of: string; text: string } | null
  /**
   * Only the few of its items the sidebar needs have been read (see `readShelved`): the
   * rest are in its file, to be read when they are wanted. Never written down so.
   */
  shelved?: boolean
  /** what the summaries keep of it, as it was when its file was last read or written */
  summed?: Summed
}

/**
 * An item as it should read once nothing is running any more. The app can be closed in
 * the middle of a turn; what was in flight then did not finish, and must not come back
 * looking as if it were still going.
 */
function settled(item: ThreadItem): ThreadItem {
  if (item.kind === "tool" && item.state === "running")
    return { ...item, state: "failed" }
  if (item.kind === "permission" && item.state === "pending")
    return { ...item, state: "denied" }
  if (item.kind === "question" && item.state === "pending")
    return { ...item, state: "skipped" }
  if (item.kind === "assistant" && item.streaming)
    return { ...item, streaming: false }
  return item
}

/** A conversation that is about to have its first thing said in it. */
export function newConversation(provider: ProviderId = "claude"): Conversation {
  return {
    id: randomBytes(6).toString("hex"),
    provider,
    sessionId: null,
    guided: null,
    name: null,
    items: [],
    gist: null,
  }
}

const folder = (dir: string, projectId: string) => path.join(dir, projectId)
/** Where a project's one conversation was kept, when a project had only one. */
const single = (dir: string, projectId: string) =>
  path.join(dir, `${projectId}.json`)

/** A conversation as its file has it. */
const fileOf = ({
  provider,
  sessionId,
  guided,
  inspired,
  name,
  items,
  gist,
}: Conversation) =>
  JSON.stringify({ provider, sessionId, guided, inspired, name, items, gist })

export function writeConversation(
  dir: string,
  projectId: string,
  conversation: Conversation
) {
  fs.mkdirSync(folder(dir, projectId), { recursive: true })
  // (written whole or not at all: it is written again and again while a turn goes on)
  writeWhole(
    path.join(folder(dir, projectId), `${conversation.id}.json`),
    fileOf(conversation)
  )
}

/**
 * The same, without holding the app up while the disk is written to. What is written is
 * the conversation as it is when this is called. Two of these at once to the same
 * conversation could each put theirs in place last: whoever calls it waits for one to
 * be over before the next.
 */
export async function writeConversationSoon(
  dir: string,
  projectId: string,
  conversation: Conversation
) {
  const data = fileOf(conversation)
  await fs.promises.mkdir(folder(dir, projectId), { recursive: true })
  await writeWholeSoon(
    path.join(folder(dir, projectId), `${conversation.id}.json`),
    data
  )
}

/**
 * The conversation a project had when it could have only one, moved in with the others.
 * `session` is asked for the Claude Code session that went with it.
 */
function adopt(dir: string, projectId: string, session: () => string | null) {
  const old = single(dir, projectId)
  let items: unknown
  try {
    items = JSON.parse(fs.readFileSync(old, "utf8"))
  } catch {
    return
  }
  if (Array.isArray(items) && items.length > 0) {
    writeConversation(dir, projectId, {
      ...newConversation(),
      sessionId: session(),
      items: items as ThreadItem[],
    })
  }
  // only now that it is kept in the new place
  fs.unlinkSync(old)
}

/**
 * A conversation from what its file says: null where it is not one of ours, or has
 * nothing said in it. Throws where the file cannot be read, or is not JSON.
 */
function readFile(file: string, id: string): Conversation | null {
  const read: unknown = JSON.parse(fs.readFileSync(file, "utf8"))
  try {
    const { provider, sessionId, guided, inspired, name, items, gist } =
      read as {
        provider?: unknown
        sessionId?: unknown
        guided?: unknown
        inspired?: unknown
        name?: unknown
        items?: unknown
        gist?: unknown
      }
    if (!Array.isArray(items) || items.length === 0) return null
    const { of, text } = (gist ?? {}) as { of?: unknown; text?: unknown }
    return {
      id,
      // one from before there was any agent but Claude Code says nothing of whose
      provider: PROVIDERS.find((one) => one === provider) ?? "claude",
      sessionId: typeof sessionId === "string" ? sessionId : null,
      guided: typeof guided === "string" ? guided : null,
      ...(typeof inspired === "string" && { inspired }),
      name: typeof name === "string" && name ? name : null,
      items: (items as ThreadItem[]).map(settled),
      gist:
        typeof of === "string" && typeof text === "string"
          ? { of, text }
          : null,
    }
  } catch {
    // not one of ours: passed over, and left alone
    return null
  }
}

/**
 * A project's conversation files, each with what it is known by. Nothing, where nothing
 * has been said about the project yet.
 */
function filesIn(dir: string, projectId: string): [string, string][] {
  let names: string[]
  try {
    names = fs.readdirSync(folder(dir, projectId))
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => [
      name.slice(0, -".json".length),
      path.join(folder(dir, projectId), name),
    ])
}

/**
 * Read a conversation file: what it says, or null. One that is cut short, or written
 * over by something else, is moved aside, where it can still be looked into, and not
 * taken for a conversation that never was.
 */
function readOrSetAside(file: string, id: string): Conversation | null {
  try {
    return readFile(file, id)
  } catch {
    setAside(file)
    return null
  }
}

/** A project's conversations, in no particular order. */
export function readConversations(
  dir: string,
  projectId: string,
  /** the session of the conversation a project had when it could have only one */
  session: () => string | null
): Conversation[] {
  adopt(dir, projectId, session)
  return filesIn(dir, projectId).flatMap(([id, file]) => {
    const conversation = readOrSetAside(file, id)
    return conversation ? [conversation] : []
  })
}

// What the sidebar shows of a project's conversations is kept beside them as well, in
// one file: so that the app can be opened, and the list of projects shown, without
// every conversation of every project being read whole first. Each conversation is
// there with how its file stood when it was written down, its size and when: one whose
// file stands otherwise now, or that is not there at all, is read from its own file
// again, and the summaries written anew. Nothing is kept there that is not in the
// conversations' own files: it is only ever a shorter way to what they say.

/** The file a project's summaries are kept in (not a conversation: no .json). */
const summariesOf = (dir: string, projectId: string) =>
  path.join(folder(dir, projectId), "summaries.index")

/** How a conversation's file stands: its size, and when it was written. Null if it is not there. */
export function stampOf(
  dir: string,
  projectId: string,
  id: string
): string | null {
  try {
    const { size, mtimeMs } = fs.statSync(
      path.join(folder(dir, projectId), `${id}.json`)
    )
    return `${size}:${mtimeMs}`
  } catch {
    return null
  }
}

/**
 * The few of a conversation's items its card in the sidebar is drawn from: the first,
 * the first thing the user said, the last thing either said, and the last of all, in
 * their order. (A board made in the background, without all that was done in making it.)
 */
export function digestOf(items: ThreadItem[]): ThreadItem[] {
  const wanted = new Set([
    items[0],
    items.find((item) => item.kind === "user"),
    items.findLast((item) => item.kind === "user" || item.kind === "assistant"),
    items.at(-1),
  ])
  return items
    .filter((item) => wanted.has(item))
    .map((item) => (item.kind === "job" ? { ...item, items: [] } : item))
}

/** One conversation as the summaries keep it, with how its file stood (see `stampOf`). */
export type Summed = {
  stamp: string
  provider: ProviderId
  sessionId: string | null
  guided: string | null
  inspired?: string
  name: string | null
  gist: { of: string; text: string } | null
  items: ThreadItem[]
}

/** What the summaries keep of a conversation as it is now, with how its file stands. */
export const summedOf = (
  {
    provider,
    sessionId,
    guided,
    inspired,
    name,
    gist,
    items,
    shelved,
  }: Conversation,
  stamp: string
): Summed => ({
  stamp,
  provider,
  sessionId,
  guided,
  ...(inspired !== undefined && { inspired }),
  name,
  gist,
  items: shelved ? items : digestOf(items),
})

/**
 * A project's conversations as the sidebar needs them, each `shelved`: with only the
 * few items its card is drawn from (`digestOf`), the rest to be read from its file when
 * they are wanted (`readItems`). Each has how its file stood as it was read (`stamp`).
 * Read from the summaries kept beside them where those are as the files are; and the
 * summaries written anew where they were not.
 */
export function readShelved(
  dir: string,
  projectId: string,
  /** the session of the conversation a project had when it could have only one */
  session: () => string | null
): Conversation[] {
  adopt(dir, projectId, session)
  let kept: Record<string, Partial<Summed> | undefined> = {}
  try {
    const read: unknown = JSON.parse(
      fs.readFileSync(summariesOf(dir, projectId), "utf8")
    )
    if (typeof read === "object" && read !== null && !Array.isArray(read))
      kept = read as typeof kept
  } catch {
    // none yet, or none that can be read: they are all read from their files, and
    // written anew (they are only a shorter way to what the files say)
  }
  const files = filesIn(dir, projectId)
  let stale = Object.keys(kept).length !== files.length
  const found = files.flatMap(([id, file]): Conversation[] => {
    const stamp = stampOf(dir, projectId, id)
    const summed = Object.hasOwn(kept, id) ? kept[id] : undefined
    if (
      stamp !== null &&
      summed?.stamp === stamp &&
      PROVIDERS.includes(summed.provider as ProviderId) &&
      Array.isArray(summed.items) &&
      summed.items.length > 0
    ) {
      const conversation: Conversation = {
        id,
        provider: summed.provider as ProviderId,
        sessionId: summed.sessionId ?? null,
        guided: summed.guided ?? null,
        ...(typeof summed.inspired === "string" && {
          inspired: summed.inspired,
        }),
        name: summed.name ?? null,
        gist: summed.gist ?? null,
        items: summed.items,
        shelved: true,
      }
      return [{ ...conversation, summed: summedOf(conversation, stamp) }]
    }
    stale = true
    const read = readOrSetAside(file, id)
    if (!read || stamp === null) return []
    const conversation = { ...read, items: digestOf(read.items), shelved: true }
    return [{ ...conversation, summed: summedOf(conversation, stamp) }]
  })
  if (stale) {
    try {
      writeWhole(summariesOf(dir, projectId), summariesFile(found))
    } catch (error) {
      // read whole again the next time, then
      console.error("[conversations]", error)
    }
  }
  return found
}

/** The summaries of a project's conversations, as their file has them. */
function summariesFile(conversations: Conversation[]): string {
  const kept: Record<string, Summed> = {}
  for (const { id, summed } of conversations) if (summed) kept[id] = summed
  return JSON.stringify(kept)
}

/** Write the summaries of a project's conversations down, as they are now. */
export function writeSummaries(
  dir: string,
  projectId: string,
  conversations: Conversation[]
) {
  fs.mkdirSync(folder(dir, projectId), { recursive: true })
  writeWhole(summariesOf(dir, projectId), summariesFile(conversations))
}

/** The same, without holding the app up while the disk is written to. */
export async function writeSummariesSoon(
  dir: string,
  projectId: string,
  conversations: Conversation[]
) {
  const data = summariesFile(conversations)
  await fs.promises.mkdir(folder(dir, projectId), { recursive: true })
  await writeWholeSoon(summariesOf(dir, projectId), data)
}

/**
 * All the items of a shelved conversation, from its file: null where there is none
 * any more, or it cannot be read (moved aside, then, as it would be on being opened).
 */
export function readItems(
  dir: string,
  projectId: string,
  id: string
): ThreadItem[] | null {
  const file = path.join(folder(dir, projectId), `${id}.json`)
  if (!fs.existsSync(file)) return null
  return readOrSetAside(file, id)?.items ?? null
}

/** Forget everything said about a project. */
export function forgetConversations(dir: string, projectId: string) {
  fs.rmSync(folder(dir, projectId), { recursive: true, force: true })
  fs.rmSync(single(dir, projectId), { force: true })
}
