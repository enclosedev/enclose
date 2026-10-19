import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  accountOf,
  askCodexOnce,
  codexModels,
  lookAtCodex,
  runCodex,
} from "./codex"
import { fakeAgent, fakeTurn, until } from "./testing"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-codex-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})
const launch = (file: string) => ({ path: file, args: [], env: process.env })

describe("codexModels", () => {
  it("offers the models as Codex lists them, and the choice of leaving it to Codex", () => {
    expect(
      codexModels([
        {
          model: "gpt-sol",
          displayName: "GPT-Sol",
          description: "The workhorse",
          isDefault: true,
          supportedReasoningEfforts: [
            { reasoningEffort: "low" },
            { reasoningEffort: "high" },
            { reasoningEffort: "ultra" },
          ],
        },
        { model: "gpt-old", displayName: "GPT-Old", hidden: true },
        { model: "gpt-luna", displayName: "GPT-Luna" },
      ])
    ).toEqual([
      {
        id: null,
        name: "Default",
        short: "GPT-Sol",
        detail: "The model Codex is set to run",
        efforts: ["low", "high"],
      },
      {
        id: "gpt-sol",
        name: "GPT-Sol",
        short: "GPT-Sol",
        detail: "The workhorse",
        efforts: ["low", "high"],
      },
      {
        id: "gpt-luna",
        name: "GPT-Luna",
        short: "GPT-Luna",
        detail: "",
        efforts: [],
      },
    ])
    expect(codexModels([])).toEqual([])
  })
})

describe("accountOf", () => {
  it("says who is signed in, by what they pay for or how they reach it", () => {
    expect(accountOf({ type: "chatgpt", planType: "plus" }, true)).toEqual({
      signedIn: true,
      account: "ChatGPT Plus",
    })
    expect(accountOf({ type: "chatgpt", planType: "new" }, true)).toEqual({
      signedIn: true,
      account: "ChatGPT",
    })
    expect(accountOf({ type: "apiKey" }, true)).toEqual({
      signedIn: true,
      account: "API key",
    })
  })

  it("tells nobody being signed in from nobody needing to be", () => {
    expect(accountOf(null, true)).toEqual({ signedIn: false, account: null })
    expect(accountOf(null, false)).toEqual({ signedIn: null, account: null })
  })
})

describe("lookAtCodex", () => {
  it("asks Codex for its version, its account and all of its models", async () => {
    const file = fakeAgent(
      dir,
      false,
      `
on("initialize", () => ({ userAgent: "enclose/0.162.0 (Mac OS; arm64)" }))
on("account/read", () => ({ account: { type: "chatgpt", planType: "pro" }, requiresOpenaiAuth: true }))
on("model/list", (params) =>
  params.cursor
    ? { data: [{ model: "b", displayName: "B" }], nextCursor: null }
    : { data: [{ model: "a", displayName: "A", isDefault: true }], nextCursor: "more" })
`
    )
    expect(await lookAtCodex(launch(file))).toEqual({
      version: "0.162.0",
      signedIn: true,
      account: "ChatGPT Pro",
      trouble: null,
      models: [
        expect.objectContaining({ id: null, short: "A" }),
        expect.objectContaining({ id: "a" }),
        expect.objectContaining({ id: "b" }),
      ],
    })
  })
})

describe("runCodex", () => {
  /** A Codex that does a little of everything in its one turn. */
  const BUSY = `
const seen = { opening: null, turn: null, decisions: [] }
on("initialize", () => ({ userAgent: "enclose/0.162.0" }))
on("initialized", () => {})
on("thread/start", (params) => { seen.opening = params; return { thread: { id: "thread-1" } } })
on("turn/start", (params) => {
  seen.turn = params
  setTimeout(async () => {
    tell("turn/started", { threadId: "thread-1", turn: { id: "turn-1" } })
    tell("item/agentMessage/delta", { threadId: "thread-1", itemId: "m1", delta: "On " })
    tell("item/agentMessage/delta", { threadId: "thread-1", itemId: "m1", delta: "it." })
    tell("item/completed", { threadId: "thread-1", item: { type: "agentMessage", id: "m1", text: "On it." } })
    tell("item/started", { threadId: "thread-1", item: { type: "commandExecution", id: "c1", command: '/bin/zsh -lc "python3 model.py"', status: "inProgress" } })
    seen.decisions.push(await ask("item/commandExecution/requestApproval", { itemId: "c1", command: '/bin/zsh -lc "python3 model.py"' }))
    tell("item/completed", { threadId: "thread-1", item: { type: "commandExecution", id: "c1", command: '/bin/zsh -lc "python3 model.py"', status: "completed" } })
    tell("item/started", { threadId: "thread-1", item: { type: "fileChange", id: "f1", status: "inProgress", changes: [{ path: process.cwd() + "/model.py", kind: { type: "update" } }] } })
    seen.decisions.push(await ask("item/fileChange/requestApproval", { itemId: "f1" }))
    tell("item/completed", { threadId: "thread-1", item: { type: "fileChange", id: "f1", status: "failed", changes: [{ path: process.cwd() + "/model.py", kind: { type: "update" } }] } })
    tell("item/started", { threadId: "thread-1", item: { type: "mcpToolCall", id: "t1", server: "viewport", tool: "screenshot", arguments: {}, status: "inProgress" } })
    seen.decisions.push(await ask("mcpServer/elicitation/request", { serverName: "viewport", mode: "form", message: "Allow?", requestedSchema: { type: "object", properties: {} } }))
    tell("item/completed", { threadId: "thread-1", item: { type: "mcpToolCall", id: "t1", server: "viewport", tool: "screenshot", arguments: {}, status: "completed" } })
    // a subagent's thread is no part of the conversation
    tell("item/agentMessage/delta", { threadId: "thread-2", itemId: "x", delta: "elsewhere" })
    tell("item/completed", { threadId: "thread-1", item: { type: "agentMessage", id: "m2", text: "Done." } })
    seen.decisions.push(await ask("something/else", {}));
    tell("seen", { ...seen, argv })
    tell("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } })
  }, 5)
  return { turn: { id: "turn-1" } }
})
`

  it("runs a turn: what Codex says and does becomes the conversation's items", async () => {
    // (the fake says what it saw on its stderr-free line: a notification the runner ignores)
    const log = path.join(dir, "seen.json")
    const file = fakeAgent(
      dir,
      false,
      BUSY.replace(
        'tell("seen", { ...seen, argv })',
        `(await import("node:fs")).writeFileSync(${JSON.stringify(log)}, JSON.stringify({ ...seen, argv }))`
      )
    )
    const fake = fakeTurn({
      launch: launch(file),
      cwd: dir,
      manner: {
        provider: "codex",
        model: "gpt-sol",
        effort: "high",
        access: "edits",
      },
    })
    await runCodex(fake.turn)

    expect(fake.sessions).toEqual(["thread-1"])
    expect(fake.notices).toEqual([])
    expect(
      fake
        .items()
        .map((item) =>
          item.kind === "assistant"
            ? `said: ${item.text}${item.streaming ? " …" : ""}`
            : item.kind === "tool"
              ? `${item.name}: ${item.detail} (${item.state})`
              : item.kind
        )
    ).toEqual([
      "said: On it.",
      "Run: python3 model.py (done)",
      "Edit: model.py (failed)",
      "mcp__viewport__screenshot: {} (done)",
      "said: Done.",
    ])
    // what leave was asked for, of the user: not for the app's own tools
    expect(fake.asked).toEqual([
      {
        title: "Run this command?",
        detail: "python3 model.py",
        canAlways: true,
      },
      { title: "Change this file?", detail: "model.py", canAlways: true },
    ])

    const seen = JSON.parse(fs.readFileSync(log, "utf8")) as {
      opening: Record<string, unknown>
      turn: { input: unknown[]; model: string; effort: string }
      decisions: unknown[]
      argv: string[]
    }
    expect(seen.argv).toEqual([
      "app-server",
      "-c",
      'mcp_servers.viewport.url="http://127.0.0.1:1/key/viewport"',
    ])
    expect(seen.opening).toMatchObject({
      cwd: dir,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      approvalsReviewer: "user",
      developerInstructions: "You are running inside Enclose.",
      model: "gpt-sol",
    })
    expect(seen.turn).toMatchObject({
      threadId: "thread-1",
      input: [{ type: "text", text: "Make a lid", text_elements: [] }],
      model: "gpt-sol",
      effort: "high",
    })
    expect(seen.decisions).toEqual([
      { decision: "accept" },
      { decision: "accept" },
      { action: "accept", content: {}, _meta: null },
      { code: -32601, message: "Method not found: something/else" },
    ])
  })

  it("takes a thread up again, and starts afresh, saying so, when Codex has lost it", async () => {
    const file = fakeAgent(
      dir,
      false,
      `
on("initialize", () => ({}))
on("thread/resume", (params) => {
  if (params.threadId === "lost") throw new Error("thread not found")
  return { thread: { id: params.threadId } }
})
on("thread/start", () => ({ thread: { id: "fresh" } }))
on("turn/start", (params) => {
  setTimeout(() => {
    tell("item/completed", { threadId: params.threadId, item: { type: "agentMessage", id: "m", text: String(params.input.length) } })
    tell("turn/completed", { threadId: params.threadId, turn: { id: "t", status: "completed" } })
  }, 5)
  return { turn: { id: "t" } }
})
`
    )
    const kept = fakeTurn({
      launch: launch(file),
      cwd: dir,
      sessionId: "kept",
      guideChanged: true,
    })
    await runCodex(kept.turn)
    expect(kept.sessions).toEqual(["kept"])
    expect(kept.notices).toEqual([])
    // what it was told of the project has changed: it is told again, ahead of the message
    expect(kept.items()).toMatchObject([{ kind: "assistant", text: "2" }])

    const lost = fakeTurn({ launch: launch(file), cwd: dir, sessionId: "lost" })
    await runCodex(lost.turn)
    expect(lost.sessions).toEqual(["fresh"])
    expect(lost.notices).toHaveLength(1)
    expect(lost.notices[0]).toMatch(/^info: Codex could not find its record/)
  })

  it("says what went wrong in a turn that failed", async () => {
    const file = fakeAgent(
      dir,
      false,
      `
on("initialize", () => ({}))
on("thread/start", () => ({ thread: { id: "thread-1" } }))
on("turn/start", () => {
  setTimeout(() => {
    tell("error", { threadId: "thread-1", willRetry: true, error: { message: "a hiccup" } })
    tell("turn/completed", { threadId: "thread-1", turn: { id: "t", status: "failed", error: { message: "You are out of credits." } } })
  }, 5)
  return { turn: { id: "t" } }
})
`
    )
    const fake = fakeTurn({ launch: launch(file), cwd: dir })
    await runCodex(fake.turn)
    expect(fake.notices).toEqual(["error: You are out of credits."])
  })

  it("tells Codex to stop when the turn is stopped, and ends what was in flight", async () => {
    const log = path.join(dir, "interrupted.json")
    const file = fakeAgent(
      dir,
      false,
      `
import fs from "node:fs"
on("initialize", () => ({}))
on("thread/start", () => ({ thread: { id: "thread-1" } }))
on("turn/start", () => {
  setTimeout(() => {
    tell("item/started", { threadId: "thread-1", item: { type: "commandExecution", id: "c1", command: "sleep 100", status: "inProgress" } })
    tell("item/agentMessage/delta", { threadId: "thread-1", itemId: "m1", delta: "Half a" })
  }, 5)
  return { turn: { id: "turn-1" } }
})
on("turn/interrupt", (params) => {
  fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(params))
  tell("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "interrupted" } })
  return {}
})
`
    )
    const fake = fakeTurn({ launch: launch(file), cwd: dir })
    const running = runCodex(fake.turn)
    await until(() => fake.items().length === 2)
    fake.abort.abort()
    await expect(running).rejects.toThrow("Stopped.")
    expect(JSON.parse(fs.readFileSync(log, "utf8"))).toEqual({
      threadId: "thread-1",
      turnId: "turn-1",
    })
    expect(fake.items()).toMatchObject([
      { kind: "tool", name: "Run", detail: "sleep 100", state: "failed" },
      { kind: "assistant", text: "Half a", streaming: false },
    ])
  })

  it("says why, when Codex goes before the turn is over", async () => {
    const file = fakeAgent(
      dir,
      false,
      `
on("initialize", () => { console.error("no such flag: --nope"); process.exit(2) })
`
    )
    const fake = fakeTurn({ launch: launch(file), cwd: dir })
    await expect(runCodex(fake.turn)).rejects.toThrow("no such flag: --nope")
  })
})

describe("askCodexOnce", () => {
  /** A Codex that says what it was asked, as it was asked it, and then how it went. */
  const answering = (how: "completed" | "failed" | "never") => `
let opening = null
on("initialize", () => ({}))
on("initialized", () => {})
on("thread/start", (params) => { opening = params; return { thread: { id: "thread-1" } } })
on("turn/start", (params) => {
  if (${JSON.stringify(how)} !== "never")
    setTimeout(() => {
      tell("item/completed", { threadId: "thread-2", item: { type: "agentMessage", id: "x", text: "elsewhere" } })
      tell("item/completed", { threadId: "thread-1", item: { type: "agentMessage", id: "m1", text: "Let me look." } })
      tell("item/completed", { threadId: "thread-1", item: { type: "agentMessage", id: "m2", text: JSON.stringify({ opening, input: params.input, model: params.model }) } })
      tell("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: ${JSON.stringify(how)} } })
    }, 5)
  return { turn: { id: "turn-1" } }
})
`
  const given = [
    { type: "image" as const, mimeType: "image/png", data: "AAAA" },
    { type: "text" as const, text: "What is it?" },
  ]

  it("asks once, shut in to reading and kept nowhere, and gives back its last words", async () => {
    const file = fakeAgent(dir, false, answering("completed"))
    const said = await askCodexOnce(
      launch(file),
      "You look at pictures.",
      given,
      new AbortController().signal,
      10_000
    )
    expect(JSON.parse(said!)).toEqual({
      opening: {
        cwd: os.tmpdir(),
        approvalPolicy: "never",
        sandbox: "read-only",
        developerInstructions: "You look at pictures.",
        ephemeral: true,
      },
      input: [
        { type: "image", url: "data:image/png;base64,AAAA" },
        { type: "text", text: "What is it?", text_elements: [] },
      ],
    })
  })

  it("runs the model it is told to, where it is told one", async () => {
    const file = fakeAgent(dir, false, answering("completed"))
    const said = await askCodexOnce(
      launch(file),
      "",
      given,
      new AbortController().signal,
      10_000,
      "gpt-luna"
    )
    expect(JSON.parse(said!)).toMatchObject({
      opening: { model: "gpt-luna" },
      model: "gpt-luna",
    })
  })

  it("gives back nothing where the turn failed, took too long, or was stopped", async () => {
    const signal = () => new AbortController().signal
    const failed = fakeAgent(dir, false, answering("failed"))
    expect(
      await askCodexOnce(launch(failed), "", given, signal(), 10_000)
    ).toBe(null)
    const silent = fakeAgent(dir, false, answering("never"))
    expect(await askCodexOnce(launch(silent), "", given, signal(), 200)).toBe(
      null
    )
    const stop = new AbortController()
    const asking = askCodexOnce(launch(silent), "", given, stop.signal, 10_000)
    setTimeout(() => stop.abort(), 100)
    expect(await asking).toBeNull()
  })
})
