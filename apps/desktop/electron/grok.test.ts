import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { grokModels, lookAtGrok, runGrok } from "./grok"
import { fakeAgent, fakeTurn, until } from "./testing"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-grok-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})
const launch = (file: string, env: Record<string, string> = {}) => ({
  path: file,
  args: [],
  env: { ...process.env, ...env },
})
const grok = { provider: "grok" as const, model: null, effort: null }

const MODELS = {
  currentModelId: "grok-4.7",
  availableModels: [
    {
      modelId: "grok-4.7",
      name: "Grok 4.7",
      description: "The latest",
      _meta: {
        supportsReasoningEffort: true,
        reasoningEfforts: [
          { id: "xhigh", value: "xhigh" },
          { id: "high", value: "high" },
          { id: "low", value: "low" },
        ],
      },
    },
    { modelId: "grok-build", name: null, description: null },
  ],
}

describe("grokModels", () => {
  it("offers the models as Grok lists them, and the choice of leaving it to Grok", () => {
    expect(grokModels(MODELS)).toEqual([
      {
        id: null,
        name: "Default",
        short: "Grok 4.7",
        detail: "The model Grok is set to run",
        efforts: ["low", "high", "xhigh"],
      },
      {
        id: "grok-4.7",
        name: "Grok 4.7",
        short: "Grok 4.7",
        detail: "The latest",
        efforts: ["low", "high", "xhigh"],
      },
      {
        id: "grok-build",
        name: "grok-build",
        short: "grok-build",
        detail: "",
        efforts: [],
      },
    ])
  })

  it("still leaves it to Grok when Grok lists nothing", () => {
    expect(grokModels(undefined)).toEqual([
      expect.objectContaining({ id: null, short: "Default" }),
    ])
  })
})

describe("lookAtGrok", () => {
  const HELLO = `on("initialize", () => ({ _meta: { agentVersion: "1.0.50", defaultAuthMethodId: "cached_token", modelState: ${JSON.stringify(MODELS)} } }))`

  it("asks Grok for its version, who is signed in, and its models", async () => {
    const file = fakeAgent(
      dir,
      true,
      `${HELLO}
on("authenticate", (params) => {
  if (params.methodId !== "cached_token") throw new Error("unknown method")
  return { _meta: { email: "someone@example.com", subscription_tier: "SuperGrok" } }
})`
    )
    expect(await lookAtGrok(launch(file))).toMatchObject({
      version: "1.0.50",
      signedIn: true,
      account: "SuperGrok",
      trouble: null,
      models: [{ id: null }, { id: "grok-4.7" }, { id: "grok-build" }],
    })
  })

  it("says nobody is signed in when Grok has nothing to sign in with", async () => {
    const file = fakeAgent(
      dir,
      true,
      `${HELLO}
on("authenticate", () => { throw new Error("no cached token") })`
    )
    expect(await lookAtGrok(launch(file))).toMatchObject({
      signedIn: false,
      account: null,
    })
  })

  it("signs in with a key, where its environment has one", async () => {
    const file = fakeAgent(
      dir,
      true,
      `${HELLO}
on("authenticate", (params) => {
  if (params.methodId !== "xai.api_key") throw new Error("wrong method")
  return {}
})`
    )
    expect(
      await lookAtGrok(launch(file, { XAI_API_KEY: "xai-123" }))
    ).toMatchObject({ signedIn: true, account: "API key" })
  })
})

describe("runGrok", () => {
  const log = () => path.join(dir, "seen.json")
  /** A Grok that does a little of everything in its one turn. */
  const busy = () => `
import fs from "node:fs"
const seen = { argv, made: null, set: [], prompt: null, answers: [] }
on("initialize", () => ({ _meta: {} }))
on("authenticate", () => ({}))
on("session/new", (params) => { seen.made = params; return { sessionId: "s1" } })
on("session/set_config_option", (params) => { seen.set.push([params.configId, params.value]); return { configOptions: [] } })
on("session/prompt", async (params) => {
  seen.prompt = params
  const say = (update, more = {}) => tell("session/update", { sessionId: "s1", update, ...more })
  say({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hm" } })
  say({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "On " } })
  say({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "it." } })
  say({ sessionUpdate: "tool_call", toolCallId: "t1", title: "run_terminal_cmd", kind: "execute", status: "pending", rawInput: { command: "python3 model.py" } })
  seen.answers.push(await ask("session/request_permission", { sessionId: "s1", toolCall: { toolCallId: "t1" }, options: [
    { optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "ever", name: "Always", kind: "allow_always" }, { optionId: "no", name: "Reject", kind: "reject_once" } ] }))
  say({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" })
  say({ sessionUpdate: "tool_call", toolCallId: "t2", title: "search_replace", kind: "edit", status: "pending", rawInput: { file_path: process.cwd() + "/model.py" } })
  seen.answers.push(await ask("session/request_permission", { sessionId: "s1", toolCall: { toolCallId: "t2" }, options: [
    { optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" } ] }))
  say({ sessionUpdate: "tool_call_update", toolCallId: "t2", status: "failed" })
  // it looks the tool up first, by words that are much like its name
  say({ sessionUpdate: "tool_call", toolCallId: "t0", title: "search_tool", rawInput: { query: "viewport screenshot" }, _meta: { "x.ai/tool": { name: "search_tool", kind: "search_tool" } } })
  say({ sessionUpdate: "tool_call_update", toolCallId: "t0", kind: "other", title: 'Search tools: "viewport screenshot"', status: "completed" })
  say({ sessionUpdate: "tool_call", toolCallId: "t3", title: "use_tool", rawInput: { tool_name: "viewport__screenshot", tool_input: {} }, _meta: { "x.ai/tool": { name: "use_tool", kind: "use_tool" } } })
  say({ sessionUpdate: "tool_call_update", toolCallId: "t3", kind: "other", title: "viewport__screenshot" })
  seen.answers.push(await ask("session/request_permission", { sessionId: "s1", toolCall: { toolCallId: "t3" }, options: [
    { optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" } ] }))
  say({ sessionUpdate: "tool_call_update", toolCallId: "t3", status: "completed" })
  // a subagent's session, and something from before, are no part of the turn
  tell("session/update", { sessionId: "child", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "elsewhere" } } })
  say({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "old" } }, { _meta: { isReplay: true } })
  say({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done." } })
  seen.answers.push(await ask("_x.ai/ask_user_question", { questions: [] }))
  fs.writeFileSync(${JSON.stringify(log())}, JSON.stringify(seen))
  return { stopReason: "end_turn" }
})
`

  it("runs a turn: what Grok says and does becomes the conversation's items", async () => {
    const fake = fakeTurn({
      launch: { ...launch(fakeAgent(dir, true, busy())), args: ["--debug"] },
      cwd: dir,
      manner: { ...grok, model: "grok-4.6", effort: "high", access: "edits" },
      content: [
        { type: "text", text: "Make a lid" },
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "AAAA" },
        },
      ],
    })
    fake.turn.ask = async (wanted) => {
      fake.asked.push(wanted)
      return "deny"
    }
    await runGrok(fake.turn)

    expect(fake.sessions).toEqual(["s1"])
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
      "Find tool: viewport screenshot (done)",
      'mcp__viewport__screenshot: {"tool_name":"viewport__screenshot","tool_input":{}} (done)',
      "said: Done.",
    ])
    // only the command is put to the user: the project's files are Grok's to change,
    // as it was let, and the app's own tools are never asked about
    expect(fake.asked).toEqual([
      {
        title: "Run this command?",
        detail: "python3 model.py",
        canAlways: true,
      },
    ])

    const seen = JSON.parse(fs.readFileSync(log(), "utf8")) as {
      argv: string[]
      made: Record<string, unknown>
      set: [string, string][]
      prompt: { prompt: unknown[] }
      answers: unknown[]
    }
    expect(seen.argv).toEqual([
      "--permission-mode",
      "default",
      "agent",
      "--debug",
      "stdio",
    ])
    expect(seen.made).toEqual({
      cwd: dir,
      mcpServers: [
        {
          type: "http",
          name: "viewport",
          url: "http://127.0.0.1:1/key/viewport",
          headers: [],
        },
      ],
      _meta: { rules: "You are running inside Enclose." },
    })
    expect(seen.set).toEqual([
      ["model", "grok-4.6"],
      ["reasoning_effort", "high"],
    ])
    // Grok takes no pictures: it is sent the words
    expect(seen.prompt).toEqual({
      sessionId: "s1",
      prompt: [{ type: "text", text: "Make a lid" }],
    })
    expect(seen.answers).toEqual([
      { outcome: { outcome: "selected", optionId: "no" } },
      { outcome: { outcome: "selected", optionId: "yes" } },
      { outcome: { outcome: "selected", optionId: "yes" } },
      { outcome: "cancelled" },
    ])
  })

  it("lets Grok do as it is let: all of it, or what it judges routine", async () => {
    for (const [access, mode, meta] of [
      ["full", "bypassPermissions", { yoloMode: true }],
      ["auto", "auto", { autoMode: true }],
      ["supervised", "default", {}],
    ] as const) {
      const fake = fakeTurn({
        launch: launch(fakeAgent(dir, true, busy())),
        cwd: dir,
        manner: { ...grok, access },
      })
      await runGrok(fake.turn)
      const { made, argv } = JSON.parse(fs.readFileSync(log(), "utf8")) as {
        made: { _meta: Record<string, unknown> }
        argv: string[]
      }
      expect(argv.slice(0, 2)).toEqual(["--permission-mode", mode])
      expect(made._meta).toEqual({
        rules: "You are running inside Enclose.",
        ...meta,
      })
      // whatever Grok still asks about is put to the user, changing a file included:
      // it is only where edits are the agent's to make that the app answers for them
      expect(fake.asked.map((wanted) => wanted.title)).toEqual([
        "Run this command?",
        "Change this file?",
      ])
    }
  })

  it("lets alone only the edits that stay in the project, and no stand-in for the app's tools", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-outside-"))
    fs.symlinkSync(outside, path.join(dir, "out"))
    const file = fakeAgent(
      dir,
      true,
      `
on("initialize", () => ({ _meta: {} }))
on("authenticate", () => ({}))
on("session/new", () => ({ sessionId: "s1" }))
on("session/prompt", async () => {
  const calls = [
    { title: "search_replace", kind: "edit", rawInput: { file_path: process.cwd() + "/model.py" } },
    { title: "search_replace", kind: "edit", rawInput: { file_path: ${JSON.stringify(path.join(outside, "x.py"))} } },
    { title: "search_replace", kind: "edit", rawInput: { file_path: "out/x.py" } },
    { title: "search_replace", kind: "edit", rawInput: {} },
    // a command titled as one of the app's tools is still a command
    { title: "viewport__screenshot", kind: "execute", rawInput: { command: "rm -rf build", tool_name: "viewport__screenshot" } },
    // and a tool of Grok's own is not one of the app's, whatever it was given
    { title: "viewport__screenshot", rawInput: { tool_name: "viewport__screenshot" }, _meta: { "x.ai/tool": { name: "web_fetch", kind: "fetch" } } },
  ]
  for (const [n, call] of calls.entries()) {
    tell("session/update", { sessionId: "s1", update: { sessionUpdate: "tool_call", toolCallId: "t" + n, status: "pending", ...call } })
    await ask("session/request_permission", { sessionId: "s1", toolCall: { toolCallId: "t" + n }, options: [
      { optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" } ] })
  }
  return { stopReason: "end_turn" }
})
`
    )
    const fake = fakeTurn({
      launch: launch(file),
      cwd: dir,
      manner: { ...grok, access: "edits" },
    })
    try {
      await runGrok(fake.turn)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
    // the first edit, of the project's own model, is the only one let go
    expect(fake.asked.map((wanted) => wanted.title)).toEqual([
      "Change this file?",
      "Change this file?",
      "Change this file?",
      "Run this command?",
      expect.stringMatching(/^Let Grok use /),
    ])
  })

  it("takes a session up again, leaving out what is played back of it", async () => {
    const file = fakeAgent(
      dir,
      true,
      `
on("initialize", () => ({ _meta: {} }))
on("authenticate", () => ({}))
on("session/load", (params) => {
  if (params.sessionId === "lost") throw new Error("session not found")
  tell("session/update", { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "said before" } } })
  // (and it never says that it has done)
})
on("session/new", () => ({ sessionId: "fresh" }))
on("session/prompt", (params) => {
  tell("session/update", { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: String(params.prompt.length) } } })
  // (nor does it answer the prompt: it says apart that it is over)
  tell("_x.ai/session/prompt_complete", { sessionId: params.sessionId, stopReason: "end_turn" })
})
`
    )
    const kept = fakeTurn({
      launch: launch(file),
      cwd: dir,
      manner: { ...grok, access: "full" },
      sessionId: "kept",
      guideChanged: true,
    })
    await runGrok(kept.turn)
    expect(kept.sessions).toEqual(["kept"])
    expect(kept.notices).toEqual([])
    // what it was told of the project has changed: it is told again, ahead of the message
    expect(kept.items()).toMatchObject([
      { kind: "assistant", text: "2", streaming: false },
    ])

    const lost = fakeTurn({
      launch: launch(file),
      cwd: dir,
      manner: { ...grok, access: "full" },
      sessionId: "lost",
      guideChanged: true,
    })
    await runGrok(lost.turn)
    expect(lost.sessions).toEqual(["fresh"])
    expect(lost.notices).toHaveLength(1)
    expect(lost.notices[0]).toMatch(/^info: Grok could not find its record/)
    // a session begun afresh is told of the project as it begins
    expect(lost.items()).toMatchObject([{ kind: "assistant", text: "1" }])
  }, 15_000)

  it("says that nobody is signed in, where that is why it cannot answer", async () => {
    const file = fakeAgent(
      dir,
      true,
      `
on("initialize", () => ({ _meta: {} }))
on("authenticate", () => { throw new Error("no cached token") })
`
    )
    const fake = fakeTurn({ launch: launch(file), cwd: dir })
    await expect(runGrok(fake.turn)).rejects.toThrow(
      /Nobody is signed in to Grok/
    )
  })

  it("tells Grok to stop when the turn is stopped, and ends what was in flight", async () => {
    const cancelled = path.join(dir, "cancelled.json")
    const file = fakeAgent(
      dir,
      true,
      `
import fs from "node:fs"
on("initialize", () => ({ _meta: {} }))
on("authenticate", () => ({}))
on("session/new", () => ({ sessionId: "s1" }))
on("session/prompt", () => {
  tell("session/update", { sessionId: "s1", update: { sessionUpdate: "tool_call", toolCallId: "t1", kind: "execute", status: "in_progress", rawInput: { command: "sleep 100" } } })
  tell("session/update", { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Half a" } } })
})
on("session/cancel", (params) => {
  fs.writeFileSync(${JSON.stringify(cancelled)}, JSON.stringify(params))
  tell("_x.ai/session/prompt_complete", { sessionId: "s1", stopReason: "cancelled" })
})
`
    )
    const fake = fakeTurn({ launch: launch(file), cwd: dir })
    const running = runGrok(fake.turn)
    await until(() => fake.items().length === 2)
    fake.abort.abort()
    await expect(running).rejects.toThrow("Stopped.")
    expect(JSON.parse(fs.readFileSync(cancelled, "utf8"))).toEqual({
      sessionId: "s1",
    })
    expect(fake.items()).toMatchObject([
      { kind: "tool", name: "Run", detail: "sleep 100", state: "failed" },
      { kind: "assistant", text: "Half a", streaming: false },
    ])
  })
})
