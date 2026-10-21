import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { againAfter, Analytics, modelSaid } from "./analytics"

describe("modelSaid", () => {
  it("names a model only where it is one of its makers'", () => {
    expect(modelSaid("claude", null, [])).toBe("default")
    expect(modelSaid("claude", "opus", [])).toBe("opus")
    expect(modelSaid("claude", "claude-sonnet-5-5[1m]", [])).toBe(
      "claude-sonnet-5-5[1m]"
    )
    expect(modelSaid("codex", "gpt-5.1-codex-max", [])).toBe(
      "gpt-5.1-codex-max"
    )
    expect(modelSaid("grok", "grok-4.7", [])).toBe("grok-4.7")
    expect(modelSaid("opencode", "opencode/big-pickle", [])).toBe(
      "opencode/big-pickle"
    )
    expect(modelSaid("opencode", "deepseek/deepseek-chat", [])).toBe(
      "deepseek/deepseek-chat"
    )
  })

  it("counts any other as custom: written in, or of the user's own config", () => {
    expect(modelSaid("claude", "opus", ["opus"])).toBe("custom")
    expect(modelSaid("claude", "acme-internal-llm", [])).toBe("custom")
    expect(modelSaid("codex", "my-proxy/secret-model", [])).toBe("custom")
    expect(modelSaid("grok", "grok-4.7", [])).toBe("grok-4.7")
    expect(modelSaid("grok", "gpt-5", [])).toBe("custom")
    expect(modelSaid("opencode", "acme-lab/llama-finetune", [])).toBe("custom")
    expect(modelSaid("opencode", "big-pickle", [])).toBe("custom")
  })
})

type Sent = {
  api_key: string
  batch: {
    uuid: string
    event: string
    distinct_id: string
    properties: Record<string, unknown>
    timestamp: string
  }[]
}

let dir: string
let file: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-analytics-"))
  file = path.join(dir, "analytics-id")
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

/** One that sends to nowhere, and keeps what it would have sent and where. */
function setUp({ key = "phc_test", into = file } = {}) {
  const sent: Sent[] = []
  const urls: string[] = []
  const state = { allowed: true, taken: true }
  const analytics = new Analytics({
    key,
    host: "https://posthog.test",
    file: into,
    allowed: () => state.allowed,
    about: { app_version: "0.0.2", os: "macOS" },
    post: (url, body) => {
      urls.push(url)
      sent.push(JSON.parse(body) as Sent)
      return state.taken
        ? Promise.resolve({ ok: true })
        : Promise.reject(new Error("offline"))
    },
  })
  return { analytics, sent, urls, state }
}

/** Let this much time go by, and what was waiting on it be done. */
const after = (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe("Analytics", () => {
  it("sends what happened close together in one go, under a made-up name", async () => {
    const { analytics, sent, urls } = setUp()
    analytics.record("app opened")
    analytics.record("project added", { from: "new" })
    expect(sent).toEqual([])
    await after(5_000)

    expect(urls).toEqual(["https://posthog.test/batch/"])
    expect(sent[0].api_key).toBe("phc_test")
    expect(sent[0].batch.map((one) => one.event)).toEqual([
      "app opened",
      "project added",
    ])
    const name = fs.readFileSync(file, "utf8").trim()
    expect(name).toMatch(/^[0-9a-f-]{36}$/)
    expect(sent[0].batch[1]).toMatchObject({
      distinct_id: name,
      properties: {
        from: "new",
        app_version: "0.0.2",
        os: "macOS",
        $process_person_profile: false,
      },
    })
    await after(60_000)
    expect(sent).toHaveLength(1)
  })

  it("goes by the same name the next time the app is run", async () => {
    const first = setUp()
    first.analytics.record("app opened")
    await after(5_000)
    const again = setUp()
    again.analytics.record("app opened")
    await after(5_000)
    expect(again.sent[0].batch[0].distinct_id).toBe(
      first.sent[0].batch[0].distinct_id
    )
  })

  it("counts nothing with no project to send to, or while it is switched off", async () => {
    const none = setUp({ key: "" })
    none.analytics.record("app opened")
    const off = setUp()
    off.state.allowed = false
    off.analytics.record("app opened")
    off.analytics.used("section")
    await after(60_000)
    expect(none.sent).toEqual([])
    expect(off.sent).toEqual([])
    expect(fs.existsSync(file)).toBe(false)
  })

  it("lets go of what was waiting when it is switched off", async () => {
    const { analytics, sent, state } = setUp()
    analytics.record("app opened")
    state.allowed = false
    analytics.forget()
    await after(60_000)
    expect(sent).toEqual([])
  })

  it("counts a feature once for a run of the app", async () => {
    const { analytics, sent } = setUp()
    analytics.used("section")
    analytics.used("blueprint")
    analytics.used("section")
    await after(5_000)
    expect(sent[0].batch.map((one) => one.properties.feature)).toEqual([
      "section",
      "blueprint",
    ])
  })

  it("tries again what would not go, and gives it up after a few tries", async () => {
    const { analytics, sent, state } = setUp()
    state.taken = false
    analytics.record("app opened")
    await after(5_000)
    expect(sent).toHaveLength(1)
    await after(againAfter(1))
    // the same one, to be counted once if the first did arrive
    expect(sent).toHaveLength(2)
    expect(sent[1].batch[0].uuid).toBe(sent[0].batch[0].uuid)

    state.taken = true
    await after(againAfter(2))
    expect(sent).toHaveLength(3)
    await after(againAfter(3))
    expect(sent).toHaveLength(3)

    state.taken = false
    analytics.record("project added", { from: "new" })
    await after(5_000)
    for (let failures = 1; failures < 5; failures++)
      await after(againAfter(failures))
    expect(sent).toHaveLength(8)
    await after(10 * 60_000)
    expect(sent).toHaveLength(8)
  })

  it("sends nothing where the name it goes by cannot be kept", async () => {
    fs.writeFileSync(path.join(dir, "taken"), "")
    const { analytics, sent } = setUp({ into: path.join(dir, "taken", "id") })
    analytics.record("app opened")
    await after(5_000)
    expect(sent).toEqual([])
  })

  it("sends off what is waiting as the app is quit", async () => {
    const { analytics, sent } = setUp()
    analytics.record("app opened")
    analytics.close()
    await after(0)
    expect(sent).toHaveLength(1)
    await after(60_000)
    expect(sent).toHaveLength(1)
  })
})
