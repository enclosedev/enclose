// What a conversation says as it is written goes to the window at a steady pace, and not
// at every word. An agent's words come in pieces of a few letters each, many in a
// second, and each piece is told to the window as the whole of what has been said so far:
// so of a message still being written, the window is told at most once in each
// STEADY_MS, and always of where it had got to last. Anything else is told at once: an
// item new to the conversation, one that has changed state (a message that is finished,
// a step that is done), and whatever else the window is told meanwhile, which is told
// after what was held back of the conversation, never before it.
import type { ThreadItem } from "../shared/api"

/** How often the window is told of a message as it is written, at the most, ms. */
export const STEADY_MS = 40

/** Where an item has got to: what the window is to hear of as soon as it changes. */
function stateOf(item: ThreadItem): string {
  switch (item.kind) {
    case "assistant":
      return item.streaming ? "streaming" : "said"
    case "tool":
    case "permission":
    case "question":
    case "job":
      return item.state
    default:
      return ""
  }
}

/** What was last told the window of a conversation, and what of it is held back. */
type Told = {
  /** the item last told of, and where it had got to, and when (ms) */
  id: string
  state: string
  at: number
  /** the same item as it is now, where that has not been told yet */
  held: ThreadItem | null
  timer: NodeJS.Timeout | null
}

export class Pace {
  private readonly tell: (
    projectId: string,
    conversationId: string,
    item: ThreadItem
  ) => void
  private readonly every: number
  private readonly now: () => number
  /** by project and conversation */
  private told = new Map<string, Told>()

  constructor(
    tell: (projectId: string, conversationId: string, item: ThreadItem) => void,
    every = STEADY_MS,
    now = () => Date.now()
  ) {
    this.tell = tell
    this.every = every
    this.now = now
  }

  /** An item was put in a conversation, or put in place of the one with its id. */
  put(projectId: string, conversationId: string, item: ThreadItem) {
    const key = `${projectId}\n${conversationId}`
    const last = this.told.get(key)
    if (last?.held && last.held.id !== item.id) this.release(key, last)
    const state = stateOf(item)
    const at = this.now()
    if (
      last &&
      last.id === item.id &&
      last.state === state &&
      at - last.at < this.every
    ) {
      last.held = item
      last.timer ??= setTimeout(
        () => this.release(key, last),
        this.every - (at - last.at)
      )
      return
    }
    if (last?.timer) clearTimeout(last.timer)
    this.told.set(key, { id: item.id, state, at, held: null, timer: null })
    this.tell(projectId, conversationId, item)
  }

  /** Tell the window now of all that is held back, of every conversation. */
  flush() {
    for (const [key, last] of this.told) this.release(key, last)
  }

  private release(key: string, last: Told) {
    if (last.timer) clearTimeout(last.timer)
    last.timer = null
    const { held } = last
    if (!held) return
    last.held = null
    last.at = this.now()
    const [projectId, conversationId] = key.split("\n")
    this.tell(projectId, conversationId, held)
  }

  /** Let go of everything, telling nothing more. */
  close() {
    for (const last of this.told.values())
      if (last.timer) clearTimeout(last.timer)
    this.told.clear()
  }
}
