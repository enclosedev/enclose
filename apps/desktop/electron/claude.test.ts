import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Doing } from "../shared/api"
import {
  accountOf,
  commandChoices,
  extraArgs,
  followDoing,
  measure,
  modelChoices,
  settingSources,
  takenIn,
} from "./claude"

describe("settingSources", () => {
  it("takes the folder's own settings only where it is trusted to say", () => {
    expect(settingSources(true)).toEqual(["user", "project", "local"])
    expect(settingSources(false)).toEqual(["user"])
  })
})

describe("modelChoices", () => {
  it("offers the models as Claude Code lists them", () => {
    expect(
      modelChoices([
        {
          value: "sonnet",
          resolvedModel: "claude-sonnet-5-5",
          displayName: "Sonnet 5.5",
          description: "Most efficient for simpler tasks",
          supportsEffort: true,
          supportedEffortLevels: ["low", "medium", "high"],
        },
        {
          value: "haiku",
          displayName: "Haiku 4.5",
          description: "Fastest for quick answers",
        },
      ])
    ).toEqual([
      {
        id: null,
        name: "Default",
        short: "Default",
        detail: "The model Claude Code is set to run",
        efforts: [],
      },
      {
        id: "sonnet",
        name: "Sonnet 5.5",
        short: "Sonnet 5.5",
        detail: "Most efficient for simpler tasks",
        efforts: ["low", "medium", "high"],
      },
      {
        id: "haiku",
        name: "Haiku 4.5",
        short: "Haiku 4.5",
        detail: "Fastest for quick answers",
        efforts: [],
      },
    ])
  })

  it("says which model the default is, by the name the list has it under", () => {
    const [standing, opus] = modelChoices([
      {
        value: "default",
        resolvedModel: "claude-opus-5-5",
        displayName: "Default (recommended)",
        description: "Opus 5.5 \u00b7 Best for everyday, complex tasks",
        supportsEffort: true,
        supportedEffortLevels: ["high", "max"],
      },
      {
        value: "opus",
        resolvedModel: "claude-opus-5-5",
        displayName: "Opus 5.5",
        description: "For complex work and everyday tasks",
      },
    ])
    expect(standing).toMatchObject({
      id: null,
      name: "Default (recommended)",
      short: "Opus 5.5",
      efforts: ["high", "max"],
    })
    expect(opus).toMatchObject({ id: "opus", short: "Opus 5.5" })
  })

  it("offers nothing when Claude Code lists nothing", () => {
    expect(modelChoices([])).toEqual([])
  })
})

describe("commandChoices", () => {
  const row = (name: string, more: object = {}) => ({
    name,
    description: `What ${name} does`,
    argumentHint: "",
    ...more,
  })
  const all = [
    row("kicad-pcb"),
    row("hello", { argumentHint: "<part>" }),
    row("vercel:deploy", { description: "(vercel) Deploy the\n  project" }),
    row("vercel:deploy"),
    row("code-review", { builtin: true }),
    row("model", { builtin: true }),
    row("context", { builtin: true }),
    row("compact", { builtin: true }),
  ]

  it("offers the commands that mean something here, then the user's", () => {
    const { commands } = commandChoices(all, [])
    expect(commands.map((command) => command.name)).toEqual([
      "compact",
      "context",
      "kicad-pcb",
      "hello",
      "vercel:deploy",
    ])
  })

  it("says what each does in a line, without saying twice whose it is", () => {
    const { commands } = commandChoices(all, [])
    expect(commands.find((c) => c.name === "vercel:deploy")?.detail).toBe(
      "Deploy the project"
    )
    expect(commands.find((c) => c.name === "hello")?.hint).toBe("<part>")
  })

  it("offers the skills that are not Claude Code's own", () => {
    const { skills } = commandChoices(all, [
      row("kicad-pcb"),
      row("dataviz", { builtin: true }),
    ])
    expect(skills.map((skill) => skill.name)).toEqual(["kicad-pcb"])
  })

  it("leaves a user's command alone that is named as one of Claude Code's", () => {
    const { commands } = commandChoices([row("context"), row("usage")], [])
    expect(commands.map((command) => command.name)).toEqual([
      "context",
      "usage",
    ])
  })
})

describe("extraArgs", () => {
  it("is what was typed after the command, as the SDK takes more arguments", () => {
    expect(extraArgs([])).toEqual({})
    expect(
      extraArgs(["--chrome", "--model", "opus", "--x=1=2", "stray", "-v", "--"])
    ).toEqual({ chrome: null, model: "opus", x: "1=2" })
    expect(extraArgs(["--debug", "--verbose"])).toEqual({
      debug: null,
      verbose: null,
    })
  })
})

describe("accountOf", () => {
  it("says who is signed in, by what they pay for or how they reach it", () => {
    expect(
      accountOf({
        email: "someone@example.com",
        subscriptionType: "Claude Max",
        apiProvider: "firstParty",
      })
    ).toEqual({ signedIn: true, account: "Claude Max" })
    expect(accountOf({ apiProvider: "bedrock" })).toEqual({
      signedIn: true,
      account: "bedrock",
    })
    expect(
      accountOf({
        apiKeySource: "ANTHROPIC_API_KEY",
        apiProvider: "firstParty",
      })
    ).toEqual({ signedIn: true, account: "API key" })
  })

  it("says nobody is, where Claude Code names no account and no key", () => {
    expect(accountOf({ apiProvider: "firstParty" })).toEqual({
      signedIn: false,
      account: null,
    })
    expect(accountOf({ tokenSource: "none", apiKeySource: "none" })).toEqual({
      signedIn: false,
      account: null,
    })
  })
})

describe("followDoing", () => {
  // the messages as Claude Code sends them, with no more in them than is looked at
  const event = (said: object, parent: string | null = null) =>
    ({
      type: "stream_event",
      event: said,
      parent_tool_use_id: parent,
    }) as unknown as SDKMessage
  const system = (said: object) =>
    ({ type: "system", ...said }) as unknown as SDKMessage
  const followed = () => {
    const said: (Doing | null)[] = []
    return { said, follow: followDoing((doing) => said.push(doing)) }
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it("says Claude is thinking from the block it thinks in, and how far it has got", () => {
    vi.useFakeTimers({ now: 5000 })
    const { said, follow } = followed()
    for (const message of [
      system({ subtype: "init" }),
      event({ type: "message_start", message: { id: "m" } }),
      event({
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "" },
      }),
      system({ subtype: "thinking_tokens", estimated_tokens: 250 }),
      system({ subtype: "thinking_tokens", estimated_tokens: 850 }),
      system({ subtype: "thinking_tokens", estimated_tokens: 1200 }),
      system({ subtype: "thinking_tokens", estimated_tokens: 1900 }),
      event({ type: "content_block_stop", index: 0 }),
      event({
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "" },
      }),
      event({ type: "content_block_stop", index: 1 }),
      { type: "result" } as unknown as SDKMessage,
    ])
      follow(message)
    // the tokens by the thousand, which is all that is shown of them
    expect(said).toEqual([
      { kind: "thinking", since: 5000, tokens: null },
      { kind: "thinking", since: 5000, tokens: 0 },
      { kind: "thinking", since: 5000, tokens: 1000 },
      null,
    ])
  })

  it("leaves a subagent's thinking to the subagent", () => {
    const { said, follow } = followed()
    follow(
      event(
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        },
        "toolu_1"
      )
    )
    follow(system({ subtype: "thinking_tokens", estimated_tokens: 4000 }))
    expect(said).toEqual([])
  })

  it("says the API is being tried again, until it answers", () => {
    const { said, follow } = followed()
    follow(system({ subtype: "api_retry", attempt: 1, max_retries: 10 }))
    follow(system({ subtype: "api_retry", attempt: 2, max_retries: 10 }))
    follow(event({ type: "message_start", message: { id: "m" } }))
    expect(said).toEqual([
      { kind: "retrying", attempt: 1, of: 10 },
      { kind: "retrying", attempt: 2, of: 10 },
      null,
    ])
  })

  it("says Claude Code is compacting the conversation, until it has", () => {
    vi.useFakeTimers({ now: 7000 })
    const { said, follow } = followed()
    follow(system({ subtype: "status", status: "requesting" }))
    follow(system({ subtype: "status", status: "compacting" }))
    follow(system({ subtype: "status", status: "compacting" }))
    follow(system({ subtype: "compact_boundary", compact_metadata: {} }))
    follow(system({ subtype: "status", status: "compacting" }))
    follow(system({ subtype: "status", status: null }))
    expect(said).toEqual([
      { kind: "compacting", since: 7000 },
      null,
      { kind: "compacting", since: 7000 },
      null,
    ])
  })
})

describe("measure", () => {
  const result = (windows: number[]) =>
    ({
      type: "result",
      modelUsage: Object.fromEntries(
        windows.map((contextWindow, index) => [`m${index}`, { contextWindow }])
      ),
    }) as unknown as Extract<SDKMessage, { type: "result" }>

  it("says how full the conversation is as Claude Code counts it", async () => {
    const getContextUsage = vi.fn(async () => ({
      totalTokens: 15039,
      rawMaxTokens: 1_000_000,
    }))
    expect(
      await measure({ getContextUsage } as never, result([200_000]), 900)
    ).toEqual({ used: 15039, window: 1_000_000 })
    expect(getContextUsage).toHaveBeenCalledWith({ detail: "summary" })
  })

  it("goes by the last reply where Claude Code is too old to say", async () => {
    const old = {
      getContextUsage: async () => {
        throw new Error("Unsupported control request")
      },
    } as never
    expect(await measure(old, result([200_000, 1_000_000]), 52000)).toEqual({
      used: 52000,
      window: 1_000_000,
    })
    expect(await measure(old, result([]), 52000)).toBeNull()
    expect(await measure(old, result([200_000]), null)).toBeNull()
  })

  it("counts all that a reply took in, read from the cache or not", () => {
    expect(
      takenIn({
        input_tokens: 3,
        cache_creation_input_tokens: 1200,
        cache_read_input_tokens: 40000,
      })
    ).toBe(41203)
    expect(takenIn({ input_tokens: 10, cache_read_input_tokens: null })).toBe(
      10
    )
  })
})
