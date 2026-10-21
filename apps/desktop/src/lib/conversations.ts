// How a project's conversations are laid out: which one is on its card, which are under
// it, and which the conversation panel shows. All of them are kept; this only says where
// each is to be found.

import type { ConversationSummary } from "@shared/api"

const DAY = 86_400_000

/** How many days a conversation can be left alone before it settles, at either end. */
export const SETTLE_DAYS = { min: 1, max: 365, initial: 3 }

export type Stack = {
  /** the conversation on the project's card; null when the card offers a new one */
  cover: ConversationSummary | null
  /** the ones under the card, the latest first */
  under: ConversationSummary[]
  /** the one the panel shows; null is a new one, with nothing said in it yet */
  open: ConversationSummary | null
}

/**
 * Lay out a project's conversations, given latest first. The card is the latest of them
 * for as long as it is being carried on. Left alone for `settleDays` it settles: it goes
 * under the card with the earlier ones, and the card offers a new one.
 */
export function stackOf(
  conversations: ConversationSummary[],
  /** what the user turned to: a conversation, a new one (null), or nothing yet */
  picked: string | null | undefined,
  settleDays: number,
  now: number
): Stack {
  const latest = conversations.at(0)
  const carriedOn =
    latest !== undefined &&
    (latest.status !== "idle" || now - latest.updatedAt < settleDays * DAY)
  const cover = picked === null || !carriedOn ? null : latest
  const chosen =
    typeof picked === "string"
      ? conversations.find((c) => c.id === picked)
      : undefined
  return {
    cover,
    under: cover ? conversations.slice(1) : conversations,
    open: chosen ?? (picked === null ? null : cover),
  }
}

/**
 * Whether the panel goes on to the conversation the agent began a new version of the
 * project in (`to`), as it was asked to in another (`from`): where the one it was asked
 * in is what the panel shows, as it would had the user begun the new one themselves.
 * Whoever has turned to something else meanwhile is left there.
 */
export function follows(
  /** what the panel shows; null is a new one, with nothing said in it yet */
  open: ConversationSummary | null,
  from: string,
  to: string
): boolean {
  return open?.id === from || open?.id === to
}

/**
 * The conversations Claude has got to the end of a turn in without anyone seeing it: what
 * a card says "Done" of. Given the ones that were so, the conversations as they were and
 * as they now are, and the one in front of the user (if any), which is seen as it happens.
 * One comes off the list when it is looked at, when it is carried on, and when it is gone.
 */
export function finishedNow(
  finished: string[],
  before: ConversationSummary[],
  now: ConversationSummary[],
  inView: string | null
): string[] {
  const was = new Map(before.map((c) => [c.id, c.status]))
  const next = now
    .filter(
      (c) =>
        c.status === "idle" &&
        c.id !== inView &&
        (finished.includes(c.id) ||
          // Claude was in the middle of it a moment ago, and is not now
          (was.get(c.id) ?? "idle") !== "idle")
    )
    .map((c) => c.id)
  // the same list is the same thing: nothing that watches it need look again
  return next.length === finished.length &&
    next.every((id) => finished.includes(id))
    ? finished
    : next
}
