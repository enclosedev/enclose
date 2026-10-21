import { describe, expect, it } from "vitest"

import type { ThreadItem } from "@shared/api"
import { atWork, inBlocks, sameSteps, spelledOut, type Steps } from "./steps"

const user = (id: string, at = 0): ThreadItem => ({
  kind: "user",
  id,
  at,
  text: "Make a cube",
  part: null,
})
const says = (id: string, at = 0): ThreadItem => ({
  kind: "assistant",
  id,
  at,
  text: "Done.",
  streaming: false,
})
const step = (
  id: string,
  state: "running" | "done" | "failed" = "done",
  at = 0
) =>
  ({
    kind: "tool",
    id,
    at,
    name: "Run",
    detail: "python3 model.py",
    state,
  }) satisfies ThreadItem
const asked = (
  id: string,
  state: "pending" | "allowed" | "denied"
): ThreadItem => ({
  kind: "permission",
  id,
  at: 0,
  title: "Run this command?",
  detail: "python3 model.py",
  canAlways: false,
  state,
})

/** What each block is, in a word: a stretch of steps is the ids of its steps. */
const shape = (items: ThreadItem[]) =>
  inBlocks(items).map((block) =>
    block.kind === "steps" ? block.steps.map((s) => s.id).join("+") : block.kind
  )

describe("inBlocks", () => {
  it("gathers the steps between two things said into one", () => {
    expect(
      shape([user("u"), step("a"), step("b"), step("c"), says("s")])
    ).toEqual(["user", "a+b+c", "assistant"])
  })

  it("keeps with the steps what was said on the way to the next of them", () => {
    expect(
      shape([user("u"), step("a"), says("s"), step("b"), step("c"), says("t")])
    ).toEqual(["user", "a+s+b+c", "assistant"])
    expect(shape([user("u"), says("s"), step("a"), says("t")])).toEqual([
      "user",
      "s+a",
      "assistant",
    ])
    expect(shape([says("s"), says("t"), step("a")])).toEqual(["s+t+a"])
  })

  it("takes what was said last for the answer, until a step follows it", () => {
    expect(shape([user("u"), step("a"), says("s")])).toEqual([
      "user",
      "a",
      "assistant",
    ])
    expect(shape([user("u"), step("a"), says("s"), says("t")])).toEqual([
      "user",
      "a",
      "assistant",
      "assistant",
    ])
    expect(shape([step("a"), says("s"), user("u"), step("b")])).toEqual([
      "a",
      "assistant",
      "user",
      "b",
    ])
  })

  it("shows what was said before a question, while it waits on an answer", () => {
    expect(
      shape([says("s"), asked("q", "pending"), step("a", "running")])
    ).toEqual(["assistant", "permission", "a"])
    expect(shape([says("s"), asked("q", "allowed"), step("a")])).toEqual([
      "s+a",
    ])
  })

  it("keeps a stretch its name as it grows", () => {
    const before = inBlocks([user("u"), step("a", "running")])
    const after = inBlocks([user("u"), step("a"), step("b", "running")])
    expect(after[1].id).toBe(before[1].id)
  })

  it("stops for a question that is waiting on an answer", () => {
    expect(shape([step("a", "running"), asked("q", "pending")])).toEqual([
      "a",
      "permission",
    ])
  })

  it("carries on through a question that was answered yes", () => {
    expect(
      shape([
        step("a"),
        asked("q", "allowed"),
        step("b"),
        asked("r", "allowed"),
      ])
    ).toEqual(["a+b"])
  })

  it("leaves a no where it was said", () => {
    expect(
      shape([step("a", "failed"), asked("q", "denied"), step("b")])
    ).toEqual(["a", "permission", "b"])
  })

  it("times a stretch from when the agent was asked to what came after it", () => {
    const blocks = inBlocks([
      user("u", 1_000),
      step("a", "done", 9_000),
      step("b", "done", 20_000),
      says("s", 31_000),
    ])
    expect(blocks[1]).toMatchObject({ kind: "steps", took: 30_000 })
  })

  it("times it likewise when something was said on the way", () => {
    const blocks = inBlocks([
      user("u", 1_000),
      says("s", 2_000),
      step("a", "done", 5_000),
      says("t", 6_000),
      step("b", "done", 8_000),
      says("v", 12_000),
    ])
    expect(blocks[1]).toMatchObject({ kind: "steps", took: 11_000 })
  })

  it("times it from its first step when it does not come straight after the asking", () => {
    const blocks = inBlocks([
      user("u", 1_000),
      asked("q", "denied"),
      step("a", "done", 5_000),
      step("b", "done", 6_000),
      says("t", 12_000),
    ])
    expect(blocks[2]).toMatchObject({ kind: "steps", took: 7_000 })
  })

  it("has no time for a stretch that nothing has come after", () => {
    const blocks = inBlocks([user("u", 1_000), step("a", "done", 5_000)])
    expect(blocks[1]).toMatchObject({ kind: "steps", took: null })
  })

  it("has nothing to show for nothing", () => {
    expect(inBlocks([])).toEqual([])
  })
})

describe("atWork", () => {
  it("says nothing while the agent has only been asked", () => {
    expect(atWork([])).toBeNull()
    expect(atWork([user("u")])).toBeNull()
  })

  it("says the step the agent is on, in the conversation's words for it", () => {
    expect(atWork([user("u"), step("a", "running")])).toBe(
      "Run python3 model.py"
    )
    expect(
      atWork([user("u"), step("a", "running"), step("b", "running")])
    ).toBe("Run python3 model.py")
    expect(atWork([user("u"), step("a", "done")])).toBe("Run python3 model.py")
    expect(
      atWork([
        user("u"),
        {
          kind: "tool",
          id: "t",
          at: 0,
          name: "Look",
          detail: "",
          state: "done",
        },
      ])
    ).toBe("Look")
  })

  it("says so when the agent is writing, and when it waits on the user", () => {
    expect(atWork([user("u"), step("a"), says("s")])).toBe(
      "Writing what it found"
    )
    expect(atWork([user("u"), asked("p", "pending")])).toBe(
      "Waiting for your answer in the conversation"
    )
    expect(atWork([user("u"), asked("p", "denied")])).toBeNull()
  })

  it("says so too while something the agent asked waits on an answer", () => {
    const question = (state: "pending" | "answered"): ThreadItem => ({
      kind: "question",
      id: "q",
      at: 0,
      questions: [
        { question: "What does it hold?", options: [], several: false },
      ],
      state,
      answers: state === "answered" ? ["A mug"] : [],
    })
    expect(atWork([user("u"), question("pending")])).toBe(
      "Waiting for your answer in the conversation"
    )
    expect(atWork([user("u"), question("answered")])).toBeNull()
  })

  it("says the agent is thinking between steps, but not before the first", () => {
    const thinking = { kind: "thinking", since: 0, tokens: 3000 } as const
    expect(atWork([user("u"), step("a")], thinking)).toBe("Thinking")
    expect(atWork([user("u"), step("a"), says("s")], thinking)).toBe("Thinking")
    // what it was asked says more of it then
    expect(atWork([user("u")], thinking)).toBeNull()
  })

  it("says when the API is being tried again, whatever the agent was at", () => {
    const retrying = { kind: "retrying", attempt: 2, of: 10 } as const
    expect(atWork([user("u")], retrying)).toBe("Retrying, attempt 2 of 10")
    expect(atWork([user("u"), step("a", "running")], retrying)).toBe(
      "Retrying, attempt 2 of 10"
    )
    expect(atWork([user("u"), asked("p", "pending")], retrying)).toBe(
      "Waiting for your answer in the conversation"
    )
  })
})

describe("spelledOut", () => {
  const said = (id: string, at: number): ThreadItem => ({
    kind: "assistant",
    id,
    at,
    text: "Looking at the board.",
    streaming: false,
  })

  it("has what was said on the way stand by itself, between stretches of their own", () => {
    const [stretch] = inBlocks([
      step("a", "done", 1000),
      step("b", "done", 2000),
      said("c", 5000),
      step("d", "running", 6000),
    ]) as [Steps]
    const pieces = spelledOut(stretch)
    expect(pieces.map((piece) => piece.kind)).toEqual([
      "steps",
      "assistant",
      "steps",
    ])
    const [before, , after] = pieces as [Steps, unknown, Steps]
    expect(before.steps.map((one) => one.id)).toEqual(["a", "b"])
    // (from its first step to what was said after it)
    expect(before.took).toBe(4000)
    expect(after.steps.map((one) => one.id)).toEqual(["d"])
    expect(after.took).toBeNull()
  })

  it("counts a stretch from what was said before it", () => {
    const [stretch] = inBlocks([
      said("a", 1000),
      step("b", "done", 3000),
      said("c", 9000),
      step("d", "running", 9500),
    ]) as [Steps]
    const pieces = spelledOut(stretch)
    expect(pieces.map((piece) => piece.id)).toEqual(["a", "b", "c", "d"])
    expect((pieces[1] as Steps).took).toBe(8000)
  })
})

describe("sameSteps", () => {
  it("finds a stretch gathered again from items that did not change the same", () => {
    const items = [user("u"), step("a"), step("b"), says("s")]
    const [, first] = inBlocks(items) as [unknown, Steps]
    // the last thing said changed: the stretch before it is a new list of the same steps
    const [, again] = inBlocks([...items.slice(0, 3), says("s", 1)]) as [
      unknown,
      Steps,
    ]
    expect(again).not.toBe(first)
    expect(sameSteps(first.steps, again.steps)).toBe(true)
  })

  it("finds it changed when one of its steps did, or another came", () => {
    const items = [user("u"), step("a", "running"), says("s")]
    const [, first] = inBlocks(items) as [unknown, Steps]
    const [, done] = inBlocks([user("u"), step("a"), says("s")]) as [
      unknown,
      Steps,
    ]
    expect(sameSteps(first.steps, done.steps)).toBe(false)
    const [, more] = inBlocks([items[0]!, items[1]!, step("b")]) as [
      unknown,
      Steps,
    ]
    expect(sameSteps(first.steps, more.steps)).toBe(false)
  })
})
