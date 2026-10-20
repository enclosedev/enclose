import os from "node:os"

import { describe, expect, it } from "vitest"

import { AcpTurn, field } from "./acp"
import { fakeTurn } from "./testing"

const make = (
  done?: (
    method: string,
    told: { sessionId?: string; stopReason?: string | null },
    sessionId: string
  ) => string | null | undefined
) => {
  const fake = fakeTurn({
    launch: { path: "", args: [], env: {} },
    cwd: os.tmpdir(),
  })
  const state = new AcpTurn(
    fake.turn,
    "run",
    (call) => ({
      name: call.kind ?? "Tool",
      detail: call.title ?? "",
    }),
    done
  )
  state.sessionId = "s1"
  const told = (update: Record<string, unknown>, more = {}) =>
    state.notification("session/update", {
      sessionId: "s1",
      update,
      ...more,
    })
  return { fake, state, told }
}

describe("field", () => {
  it("takes the first of these names that has a value", () => {
    expect(
      field({ path: "", file_path: "model.py" }, "path", "file_path")
    ).toBe("model.py")
    expect(field({ args: ["one", "two"] }, "args")).toBe("one two")
    expect(field({ args: ["one", 2] }, "args")).toBe("")
    expect(field(null, "path")).toBe("")
  })
})

describe("AcpTurn", () => {
  it("gathers what is said into one item, and puts each tool call on show", () => {
    const { fake, state, told } = make()
    told({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "On " },
    })
    told({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "it." },
    })
    told({
      sessionUpdate: "tool_call",
      toolCallId: "t1",
      title: "bash",
      kind: "execute",
      status: "pending",
    })
    told({
      sessionUpdate: "tool_call_update",
      toolCallId: "t1",
      status: "completed",
    })
    state.hush()
    expect(fake.items()).toMatchObject([
      { kind: "assistant", text: "On it.", streaming: false },
      { kind: "tool", name: "execute", detail: "bash", state: "done" },
    ])
  })

  it("leaves out a subagent's session, and what is played back of this one", () => {
    const { fake, state, told } = make()
    state.notification("session/update", {
      sessionId: "child",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "elsewhere" },
      },
    })
    told(
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "old" },
      },
      { _meta: { isReplay: true } }
    )
    expect(fake.items()).toEqual([])
  })

  it("keeps a conversation being taken up again out of the turn, until it is over", () => {
    const { fake, state, told } = make()
    state.beginReplay()
    told({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "said before" },
    })
    expect(fake.items()).toEqual([])
    expect(state.replayed).toBeGreaterThan(0)
    state.endReplay()
    told({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "new" },
    })
    expect(fake.items()).toMatchObject([{ kind: "assistant", text: "new" }])
  })

  it("is over when the agent says so apart from the prompt's answer", async () => {
    const { state } = make((method, told, sessionId) =>
      method === "x/over" && told.sessionId === sessionId
        ? (told.stopReason ?? null)
        : undefined
    )
    state.notification("x/over", { sessionId: "s1", stopReason: "end_turn" })
    await expect(state.finished).resolves.toBe("end_turn")
  })

  it("leaves what was in flight as it stood, and marked so", () => {
    const { fake, state, told } = make()
    told({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Half a" },
    })
    told({
      sessionUpdate: "tool_call",
      toolCallId: "t1",
      title: "sleep 100",
      kind: "execute",
      status: "in_progress",
    })
    state.abandon()
    expect(fake.items()).toMatchObject([
      { kind: "assistant", text: "Half a", streaming: false },
      { kind: "tool", name: "execute", detail: "sleep 100", state: "failed" },
    ])
  })
})
