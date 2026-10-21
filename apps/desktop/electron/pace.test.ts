import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ThreadItem } from "../shared/api"
import { Pace, STEADY_MS } from "./pace"

const said = (id: string, text: string, streaming = true): ThreadItem => ({
  kind: "assistant",
  id,
  at: 1,
  text,
  streaming,
})
const step = (id: string, state: "running" | "done"): ThreadItem => ({
  kind: "tool",
  id,
  at: 1,
  name: "Run",
  detail: "make",
  state,
})

/** A pace, and what the window has been told by it: each item as conversation:id:text-or-state. */
function pacing() {
  const told: string[] = []
  const pace = new Pace((_, conversation, item) =>
    told.push(
      `${conversation}:${item.id}:${item.kind === "assistant" ? item.text : item.kind === "tool" ? item.state : ""}`
    )
  )
  return { pace, told }
}

describe("Pace", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("tells of a message at once, then at most once a while as it is written, ending where it got to", () => {
    const { pace, told } = pacing()
    pace.put("p", "c", said("m", "H"))
    pace.put("p", "c", said("m", "He"))
    pace.put("p", "c", said("m", "Hel"))
    expect(told).toEqual(["c:m:H"])
    vi.advanceTimersByTime(STEADY_MS)
    expect(told).toEqual(["c:m:H", "c:m:Hel"])
    pace.put("p", "c", said("m", "Hell"))
    pace.put("p", "c", said("m", "Hello"))
    vi.advanceTimersByTime(STEADY_MS - 1)
    expect(told).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(told.at(-1)).toBe("c:m:Hello")
    vi.advanceTimersByTime(STEADY_MS * 5)
    expect(told).toHaveLength(3)
  })

  it("tells at once of a message that is finished, in place of what was held back", () => {
    const { pace, told } = pacing()
    pace.put("p", "c", said("m", "H"))
    pace.put("p", "c", said("m", "Hi"))
    pace.put("p", "c", said("m", "Hi.", false))
    expect(told).toEqual(["c:m:H", "c:m:Hi."])
    vi.advanceTimersByTime(STEADY_MS * 2)
    expect(told).toEqual(["c:m:H", "c:m:Hi."])
  })

  it("tells what was held back of a conversation before anything else of it", () => {
    const { pace, told } = pacing()
    pace.put("p", "c", said("m", "Let me"))
    pace.put("p", "c", said("m", "Let me look"))
    pace.put("p", "c", step("t", "running"))
    pace.put("p", "c", step("t", "done"))
    expect(told).toEqual([
      "c:m:Let me",
      "c:m:Let me look",
      "c:t:running",
      "c:t:done",
    ])
  })

  it("keeps each conversation's pace to itself", () => {
    const { pace, told } = pacing()
    pace.put("p", "a", said("m", "A"))
    pace.put("p", "b", said("n", "B"))
    pace.put("p", "a", said("m", "AA"))
    pace.put("p", "b", said("n", "BB"))
    expect(told).toEqual(["a:m:A", "b:n:B"])
    vi.advanceTimersByTime(STEADY_MS)
    expect(told).toEqual(["a:m:A", "b:n:B", "a:m:AA", "b:n:BB"])
  })

  it("tells of all that is held back when it is flushed, before what is told next", () => {
    const { pace, told } = pacing()
    pace.put("p", "a", said("m", "A"))
    pace.put("p", "a", said("m", "AA"))
    pace.flush()
    expect(told).toEqual(["a:m:A", "a:m:AA"])
    vi.advanceTimersByTime(STEADY_MS)
    expect(told).toHaveLength(2)
  })

  it("tells nothing more once it is closed", () => {
    const { pace, told } = pacing()
    pace.put("p", "a", said("m", "A"))
    pace.put("p", "a", said("m", "AA"))
    pace.close()
    vi.advanceTimersByTime(STEADY_MS)
    expect(told).toEqual(["a:m:A"])
  })
})
