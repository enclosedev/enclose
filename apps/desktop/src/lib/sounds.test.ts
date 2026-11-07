import { afterEach, describe, expect, it, vi } from "vitest"

import type { ConversationSummary } from "@shared/api"
import { usePreferences } from "./preferences"
import { cueOf, play } from "./sounds"

const conversation = (
  id: string,
  more: Partial<ConversationSummary> = {}
): ConversationSummary => ({
  id,
  title: id,
  name: null,
  version: 1,
  main: false,
  onCard: false,
  provider: "claude",
  status: "idle",
  since: null,
  away: 0,
  doing: null,
  context: null,
  lastMessage: null,
  gist: null,
  failed: false,
  updatedAt: 0,
  queued: [],
  versioning: false,
  job: null,
  lastJob: null,
  ...more,
})
const working = (id: string) => conversation(id, { status: "working" })
const making = (state: "working" | "done" | "stopped" | "failed") =>
  conversation("a", { lastJob: { id: "job-1", state } })

describe("what is heard of the conversations changing", () => {
  it("is a turn being over", () => {
    expect(cueOf([working("a")], [conversation("a")])).toBe("done")
  })

  it("is a turn that did not get through", () => {
    expect(cueOf([working("a")], [conversation("a", { failed: true })])).toBe(
      "failed"
    )
  })

  it("is an agent waiting on the user, once", () => {
    const asking = conversation("a", { status: "asking" })
    expect(cueOf([working("a")], [asking])).toBe("asking")
    expect(cueOf([asking], [asking])).toBeNull()
    // (the yes given, and back at work)
    expect(cueOf([asking], [working("a")])).toBeNull()
  })

  it("is nothing where what was said meanwhile goes on at once", () => {
    const queued = conversation("a", {
      queued: [{ kind: "user", id: "q", at: 0, text: "And a lid" }],
    } as Partial<ConversationSummary>)
    expect(cueOf([working("a")], [queued])).toBeNull()
  })

  it("is nothing of conversations not there before, or not changed", () => {
    expect(cueOf([], [conversation("a"), working("b")])).toBeNull()
    expect(cueOf([working("a")], [working("a")])).toBeNull()
    expect(cueOf([conversation("a")], [conversation("a")])).toBeNull()
  })

  it("is a board made in the background, as that went", () => {
    expect(cueOf([making("working")], [making("done")])).toBe("board")
    expect(cueOf([making("working")], [making("failed")])).toBe("failed")
    // stopped by the user, who knows it
    expect(cueOf([making("working")], [making("stopped")])).toBeNull()
    // one that was over already
    expect(cueOf([making("done")], [making("done")])).toBeNull()
  })

  it("is what most wants the user, of several at once", () => {
    expect(
      cueOf(
        [working("a"), working("b"), making("working")],
        [
          conversation("b", { status: "asking" }),
          { ...making("done"), id: "a" },
        ]
      )
    ).toBe("asking")
  })
})

describe("playing", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    usePreferences.setState({ sounds: true })
  })

  /** An AudioContext that makes nodes that do nothing, counting how many were made. */
  function stubAudio() {
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    })
    const node = () => {
      const made = {
        gain: param(),
        frequency: param(),
        threshold: param(),
        connect: () => made,
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      return made
    }
    const tones = vi.fn(node)
    class Context {
      state = "running"
      currentTime = 0
      destination = node()
      createGain = node
      createDynamicsCompressor = node
      createOscillator = tones
      resume = vi.fn()
    }
    vi.stubGlobal("AudioContext", Context)
    return tones
  }

  it("is nothing with sounds turned off", () => {
    const tones = stubAudio()
    usePreferences.setState({ sounds: false })
    play("board")
    expect(tones).not.toHaveBeenCalled()
  })

  it("is a pop for each note, with sounds on", () => {
    const tones = stubAudio()
    play("board")
    // four notes, each a tone and its overtone
    expect(tones).toHaveBeenCalledTimes(8)
    // the same again at once is not heard twice
    play("board")
    expect(tones).toHaveBeenCalledTimes(8)
  })
})
