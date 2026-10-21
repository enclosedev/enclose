import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { NO_SUCH_METHOD } from "./rpc"
import {
  opencodeModels,
  lookAtOpencode,
  runOpencode,
  withAccess,
} from "./opencode"
import { fakeAgent, fakeTurn, until } from "./testing"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-opencode-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})
const launch = (file: string, env: Record<string, string> = {}) => ({
  path: file,
  args: [],
  env: { ...process.env, ...env },
})
const opencode = { provider: "opencode" as const, model: null, effort: null }

const OPTIONS = [
  { value: "opencode/big-pickle", name: "OpenCode/Big Pickle" },
  { value: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
]

describe("opencodeModels", () => {
  it("offers the models as opencode lists them, and the choice of leaving it to opencode", () => {
    expect(opencodeModels("opencode/big-pickle", OPTIONS)).toEqual([
      {
        id: null,
        name: "Default",
        short: "OpenCode/Big Pickle",
        detail: "The model opencode is set to run",
        efforts: [],
      },
      {
        id: "opencode/big-pickle",
        name: "OpenCode/Big Pickle",
        short: "OpenCode/Big Pickle",
        detail: "",
        efforts: [],
      },
      {
        id: "deepseek/deepseek-chat",
        name: "DeepSeek Chat",
        short: "DeepSeek Chat",
        detail: "",
        efforts: [],
      },
    ])
  })

  it("still leaves it to opencode when opencode lists nothing", () => {
    expect(opencodeModels(undefined, undefined)).toEqual([
      expect.objectContaining({ id: null, short: "Default" }),
    ])
  })
})

describe("withAccess", () => {
  it("says how much opencode may do, in opencode's own terms", () => {
    for (const [access, permission] of [
      [
        "supervised",
        { edit: "ask", bash: "ask", webfetch: "ask", websearch: "ask" },
      ],
      [
        "edits",
        { edit: "allow", bash: "ask", webfetch: "ask", websearch: "ask" },
      ],
      [
        "auto",
        { edit: "allow", bash: "allow", webfetch: "allow", websearch: "allow" },
      ],
      ["full", "allow"],
    ] as const) {
      const env = withAccess({}, access)
      expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "")).toEqual({
        permission,
      })
    }
  })

  it("keeps what was already set there, laying the app's choice over it", () => {
    const env = withAccess(
      {
        OPENCODE_CONFIG_CONTENT: JSON.stringify({
          theme: "dark",
          permission: "allow",
        }),
        PATH: "/bin",
      },
      "supervised"
    )
    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "")).toEqual({
      theme: "dark",
      permission: {
        edit: "ask",
        bash: "ask",
        webfetch: "ask",
        websearch: "ask",
      },
    })
    expect(env.PATH).toBe("/bin")
  })

  it("leaves out what will not be read as a config rather than fail a turn", () => {
    const env = withAccess({ OPENCODE_CONFIG_CONTENT: "not json" }, "edits")
    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "")).toEqual({
      permission: {
        edit: "allow",
        bash: "ask",
        webfetch: "ask",
        websearch: "ask",
      },
    })
  })
})

describe("lookAtOpencode", () => {
  it("asks opencode for its models, which come with a session", async () => {
    const file = fakeAgent(
      dir,
      true,
      `on("initialize", () => ({}))
on("authenticate", (params) => {
  if (params.methodId !== "opencode-login") throw new Error("unknown method")
  return {}
})
on("session/new", () => ({
  sessionId: "s1",
  configOptions: [{ id: "model", currentValue: "opencode/big-pickle", options: ${JSON.stringify(OPTIONS)} }],
}))`
    )
    expect(await lookAtOpencode(launch(file))).toMatchObject({
      version: null,
      signedIn: null,
      account: null,
      trouble: null,
      models: [
        { id: null },
        { id: "opencode/big-pickle" },
        { id: "deepseek/deepseek-chat" },
      ],
    })
  })

  it("says so when opencode will not even begin", async () => {
    const file = fakeAgent(
      dir,
      true,
      `on("initialize", () => ({}))
on("authenticate", () => ({}))
on("session/new", () => { throw new Error("no sessions today") })`
    )
    await expect(lookAtOpencode(launch(file))).rejects.toThrow(
      "no sessions today"
    )
  })
})

describe("runOpencode", () => {
  const log = () => path.join(dir, "seen.json")
  /** An opencode that does a little of everything in its one turn. */
  const busy = () => `
import fs from "node:fs"
const seen = { argv, env: process.env.OPENCODE_CONFIG_CONTENT, made: null, set: [], prompt: null, answers: [] }
on("initialize", () => ({}))
on("authenticate", () => ({}))
on("session/new", (params) => { seen.made = params; return { sessionId: "s1", configOptions: [] } })
on("session/set_config_option", (params) => { seen.set.push([params.configId, params.value]); return { configOptions: [] } })
on("session/prompt", async (params) => {
  seen.prompt = params
  const say = (update, more = {}) => tell("session/update", { sessionId: "s1", update, ...more })
  say({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hm" } })
  say({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "On " } })
  say({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "it." } })
  say({ sessionUpdate: "tool_call", toolCallId: "t1", name: "bash", title: "bash", kind: "execute", status: "pending", rawInput: { command: "python3 model.py" } })
  seen.answers.push(await ask("session/request_permission", { sessionId: "s1", toolCall: { toolCallId: "t1" }, options: [
    { optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "ever", name: "Always", kind: "allow_always" }, { optionId: "no", name: "Reject", kind: "reject_once" } ] }))
  say({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" })
  say({ sessionUpdate: "tool_call", toolCallId: "t2", name: "write", title: "write", kind: "edit", status: "pending", rawInput: { filePath: process.cwd() + "/model.py" } })
  seen.answers.push(await ask("session/request_permission", { sessionId: "s1", toolCall: { toolCallId: "t2" }, options: [
    { optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" } ] }))
  say({ sessionUpdate: "tool_call_update", toolCallId: "t2", status: "failed" })
  // the app's own tools come over MCP, and it gives the tool's own name on its name
  // field, the server's and the tool's joined with one line: viewport_screenshot
  say({ sessionUpdate: "tool_call", toolCallId: "t3", name: "viewport_screenshot", title: "Take a screenshot", kind: "other", rawInput: { tool_name: "viewport_screenshot", tool_input: {} } })
  seen.answers.push(await ask("session/request_permission", { sessionId: "s1", toolCall: { toolCallId: "t3" }, options: [
    { optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" } ] }))
  say({ sessionUpdate: "tool_call_update", toolCallId: "t3", status: "completed" })
  // a subagent's session is no part of the turn
  tell("session/update", { sessionId: "child", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "elsewhere" } } })
  say({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done." } })
  seen.answers.push(await ask("session/request_elicitation", {}).catch((error) => error))
  fs.writeFileSync(${JSON.stringify(log())}, JSON.stringify(seen))
  return { stopReason: "end_turn" }
})
`

  it("runs a turn: what opencode says and does becomes the conversation's items", async () => {
    const fake = fakeTurn({
      launch: { ...launch(fakeAgent(dir, true, busy())), args: ["--debug"] },
      cwd: dir,
      manner: {
        ...opencode,
        model: "deepseek/deepseek-chat",
        effort: "high",
        access: "edits",
      },
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
    await runOpencode(fake.turn)

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
      'mcp__viewport__screenshot: {"tool_name":"viewport_screenshot","tool_input":{}} (done)',
      "said: Done.",
    ])
    // only the command is put to the user: the project's files are opencode's to
    // change, as it was let, and the app's own tools are never asked about
    expect(fake.asked).toEqual([
      {
        title: "Run this command?",
        detail: "python3 model.py",
        canAlways: true,
      },
    ])

    const seen = JSON.parse(fs.readFileSync(log(), "utf8")) as {
      argv: string[]
      env: string
      made: Record<string, unknown>
      set: [string, string][]
      prompt: { prompt: unknown[] }
      answers: unknown[]
    }
    // opencode takes no flags for how much it may do: that is said in its environment,
    // as its own permission config, laid over what the user has set there
    expect(seen.argv).toEqual(["acp", "--debug"])
    expect(JSON.parse(seen.env)).toMatchObject({
      permission: {
        edit: "allow",
        bash: "ask",
        webfetch: "ask",
        websearch: "ask",
      },
    })
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
    })
    // the model is chosen, and nothing is said of thinking harder: opencode takes
    // no session for that
    expect(seen.set).toEqual([["model", "deepseek/deepseek-chat"]])
    expect(seen.prompt).toEqual({
      sessionId: "s1",
      prompt: [
        { type: "text", text: "You are running inside Enclose." },
        { type: "text", text: "Make a lid" },
        { type: "image", data: "AAAA", mimeType: "image/png" },
      ],
    })
    expect(seen.answers).toEqual([
      { outcome: { outcome: "selected", optionId: "no" } },
      { outcome: { outcome: "selected", optionId: "yes" } },
      { outcome: { outcome: "selected", optionId: "yes" } },
      {
        code: NO_SUCH_METHOD,
        message: "Method not found: session/request_elicitation",
      },
    ])
  })

  it("lets opencode do as it is let: everything, or what it was let", async () => {
    for (const [access, asked] of [
      ["full", []],
      ["auto", ["Run this command?", "Change this file?"]],
      ["supervised", ["Run this command?", "Change this file?"]],
      ["edits", ["Run this command?"]],
    ] as const) {
      const fake = fakeTurn({
        launch: launch(fakeAgent(dir, true, busy())),
        cwd: dir,
        manner: { ...opencode, access },
      })
      await runOpencode(fake.turn)
      expect(fake.asked.map((wanted) => wanted.title)).toEqual(asked)
    }
  })

  it("takes a title for words, not for the app's own tool: only the name it gives", async () => {
    const file = fakeAgent(
      dir,
      true,
      `
on("initialize", () => ({}))
on("authenticate", () => ({}))
on("session/new", () => ({ sessionId: "s1", configOptions: [] }))
on("session/prompt", async () => {
  // a command the model wrote words for, titled as one of the app's own tools: it is
  // still a command, and is put to the user
  tell("session/update", { sessionId: "s1", update: { sessionUpdate: "tool_call", toolCallId: "t1", name: "bash", title: "viewport_screenshot", kind: "execute", status: "pending", rawInput: { command: "rm -rf build" } } })
  await ask("session/request_permission", { sessionId: "s1", toolCall: { toolCallId: "t1" }, options: [
    { optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" } ] })
  tell("session/update", { sessionId: "s1", update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" } })
  return { stopReason: "end_turn" }
})
`
    )
    const fake = fakeTurn({
      launch: launch(file),
      cwd: dir,
      manner: { ...opencode, access: "edits" },
    })
    await runOpencode(fake.turn)
    expect(fake.asked.map((wanted) => wanted.title)).toEqual([
      "Run this command?",
    ])
    expect(fake.items()).toMatchObject([
      { kind: "tool", name: "Run", detail: "rm -rf build", state: "done" },
    ])
  })

  it("lets alone only the edits that stay in the project, and no stand-in for the app's tools", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-outside-"))
    fs.symlinkSync(outside, path.join(dir, "out"))
    const file = fakeAgent(
      dir,
      true,
      `
on("initialize", () => ({}))
on("authenticate", () => ({}))
on("session/new", () => ({ sessionId: "s1", configOptions: [] }))
on("session/prompt", async () => {
  const calls = [
    { name: "write", title: "write", kind: "edit", rawInput: { filePath: process.cwd() + "/model.py" } },
    { name: "write", title: "write", kind: "edit", rawInput: { filePath: ${JSON.stringify(path.join(outside, "x.py"))} } },
    { name: "write", title: "write", kind: "edit", locations: [{ path: "out/x.py" }] },
    { name: "write", title: "write", kind: "edit", rawInput: { filePath: "model.py" }, locations: [{ path: "../elsewhere.py" }] },
    { name: "edit", title: "edit", kind: "edit", rawInput: {} },
    // what the model gave a tool of opencode's own is no name of the app's tools
    { name: "webfetch", title: "viewport_screenshot", kind: "other", rawInput: { tool_name: "viewport_screenshot" } },
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
      manner: { ...opencode, access: "edits" },
    })
    try {
      await runOpencode(fake.turn)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
    // the first edit, of the project's own model, is the only one let go
    expect(fake.asked.map((wanted) => wanted.title)).toEqual([
      "Change this file?",
      "Change this file?",
      "Change this file?",
      "Change this file?",
      "Let opencode use viewport_screenshot?",
    ])
  })

  it("takes a session up again, leaving out what is played back of it", async () => {
    const file = fakeAgent(
      dir,
      true,
      `
on("initialize", () => ({}))
on("authenticate", () => ({}))
on("session/load", (params) => {
  if (params.sessionId === "lost") throw new Error("session not found")
  tell("session/update", { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "said before" } } })
  // (and it never says that it has done)
})
on("session/new", () => ({ sessionId: "fresh", configOptions: [] }))
on("session/set_config_option", () => ({ configOptions: [] }))
on("session/prompt", (params) => {
  tell("session/update", { sessionId: params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: String(params.prompt.length) } } })
  return { stopReason: "end_turn" }
})
`
    )
    const kept = fakeTurn({
      launch: launch(file),
      cwd: dir,
      manner: { ...opencode, access: "full" },
      sessionId: "kept",
      guideChanged: true,
    })
    await runOpencode(kept.turn)
    expect(kept.sessions).toEqual(["kept"])
    expect(kept.notices).toEqual([])
    // what it was told of the project has changed: it is told again, ahead of the message
    expect(kept.items()).toMatchObject([
      { kind: "assistant", text: "2", streaming: false },
    ])

    const lost = fakeTurn({
      launch: launch(file),
      cwd: dir,
      manner: { ...opencode, access: "full" },
      sessionId: "lost",
      guideChanged: true,
    })
    await runOpencode(lost.turn)
    expect(lost.sessions).toEqual(["fresh"])
    expect(lost.notices).toHaveLength(1)
    expect(lost.notices[0]).toMatch(/^info: opencode could not find its record/)
    // a session begun afresh is told of the project as it begins, with the message
    expect(lost.items()).toMatchObject([{ kind: "assistant", text: "2" }])
  }, 15_000)

  it("tells opencode to stop when the turn is stopped, and ends what was in flight", async () => {
    const cancelled = path.join(dir, "cancelled.json")
    const file = fakeAgent(
      dir,
      true,
      `
import fs from "node:fs"
on("initialize", () => ({}))
on("authenticate", () => ({}))
on("session/new", () => ({ sessionId: "s1", configOptions: [] }))
on("session/prompt", () => {
  tell("session/update", { sessionId: "s1", update: { sessionUpdate: "tool_call", toolCallId: "t1", kind: "execute", status: "in_progress", rawInput: { command: "sleep 100" } } })
  tell("session/update", { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Half a" } } })
})
on("session/cancel", (params) => {
  fs.writeFileSync(${JSON.stringify(cancelled)}, JSON.stringify(params))
  process.exit(0)
})
`
    )
    const fake = fakeTurn({ launch: launch(file), cwd: dir })
    const running = runOpencode(fake.turn)
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
