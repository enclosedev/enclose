import { describe, expect, it } from "vitest"

import type { ConversationSummary } from "@shared/api"
import { finishedNow, follows, stackOf } from "./conversations"

const DAY = 86_400_000
const NOW = 100 * DAY

/** A conversation last touched so many days ago. */
const left = (
  id: string,
  days: number,
  status: ConversationSummary["status"] = "idle"
): ConversationSummary => ({
  id,
  title: `About ${id}`,
  name: null,
  version: 1,
  provider: "claude",
  status,
  since: null,
  away: 0,
  doing: null,
  context: null,
  lastMessage: null,
  gist: null,
  failed: false,
  updatedAt: NOW - days * DAY,
  queued: [],
  versioning: false,
  job: null,
})

/** A layout by its ids: the card, what is under it, and what the panel shows. */
const laid = (
  conversations: ConversationSummary[],
  picked?: string | null,
  settleDays = 3
) => {
  const { cover, under, open } = stackOf(conversations, picked, settleDays, NOW)
  return [cover?.id ?? null, under.map((c) => c.id), open?.id ?? null]
}

describe("stackOf", () => {
  it("offers a new conversation where there has been none", () => {
    expect(laid([])).toEqual([null, [], null])
  })

  it("puts the latest on the card and the earlier ones under it", () => {
    expect(laid([left("c", 0.1), left("b", 1), left("a", 9)])).toEqual([
      "c",
      ["b", "a"],
      "c",
    ])
  })

  it("settles the latest once it has been left alone long enough", () => {
    expect(laid([left("b", 2.9), left("a", 9)])).toEqual(["b", ["a"], "b"])
    expect(laid([left("b", 3.1), left("a", 9)])).toEqual([
      null,
      ["b", "a"],
      null,
    ])
  })

  it("settles after as many days as it is told to", () => {
    expect(laid([left("a", 5)], undefined, 7)).toEqual(["a", [], "a"])
    expect(laid([left("a", 5)], undefined, 1)).toEqual([null, ["a"], null])
  })

  it("never settles one that the agent is still at work on", () => {
    expect(laid([left("a", 4, "working")])).toEqual(["a", [], "a"])
    expect(laid([left("a", 4, "asking")])).toEqual(["a", [], "a"])
  })

  it("shows an earlier one that is turned to, and leaves the card as it is", () => {
    expect(laid([left("c", 0.1), left("b", 1), left("a", 9)], "a")).toEqual([
      "c",
      ["b", "a"],
      "a",
    ])
    expect(laid([left("b", 5), left("a", 9)], "b")).toEqual([
      null,
      ["b", "a"],
      "b",
    ])
  })

  it("puts a new one on the card when one is asked for, over the latest", () => {
    expect(laid([left("b", 0.1), left("a", 9)], null)).toEqual([
      null,
      ["b", "a"],
      null,
    ])
  })

  it("goes by the card when what was turned to is no longer there", () => {
    expect(laid([left("b", 0.1), left("a", 9)], "gone")).toEqual([
      "b",
      ["a"],
      "b",
    ])
  })
})

describe("finishedNow", () => {
  const idle = (id: string) => left(id, 0)
  const busy = (id: string) => left(id, 0, "working")
  const asking = (id: string) => left(id, 0, "asking")

  it("takes note of a conversation the agent has just got to the end of", () => {
    expect(
      finishedNow([], [busy("a"), idle("b")], [idle("a"), idle("b")], null)
    ).toEqual(["a"])
    expect(finishedNow([], [asking("a")], [idle("a")], null)).toEqual(["a"])
  })

  it("takes none of one that is in front of the user as it ends", () => {
    expect(finishedNow([], [busy("a")], [idle("a")], "a")).toEqual([])
  })

  it("keeps it noted until it is looked at", () => {
    const now = [idle("a"), idle("b")]
    expect(finishedNow(["a"], now, now, "b")).toEqual(["a"])
    expect(finishedNow(["a"], now, now, "a")).toEqual([])
  })

  it("lets go of one that is carried on, or is gone", () => {
    expect(finishedNow(["a"], [idle("a")], [busy("a")], null)).toEqual([])
    expect(
      finishedNow(["a", "b"], [idle("a"), idle("b")], [idle("b")], null)
    ).toEqual(["b"])
  })

  it("makes nothing of a conversation that was never seen at work", () => {
    expect(finishedNow([], [], [idle("a")], null)).toEqual([])
    expect(finishedNow([], [idle("a")], [idle("a")], null)).toEqual([])
  })

  it("is the same list while nothing about it has changed", () => {
    const finished = ["a"]
    const now = [idle("a"), busy("b")]
    expect(finishedNow(finished, now, now, null)).toBe(finished)
  })
})

describe("follows", () => {
  it("goes on to a new version from the conversation it was asked for in", () => {
    expect(follows(left("a", 0), "a", "b")).toBe(true)
    expect(follows(left("b", 0), "a", "b")).toBe(true)
  })

  it("leaves whoever has turned to something else where they are", () => {
    expect(follows(left("c", 0), "a", "b")).toBe(false)
    // a new one, with nothing said in it yet
    expect(follows(null, "a", "b")).toBe(false)
  })
})
