import { afterEach, describe, expect, it } from "vitest"

import {
  answerTo,
  assemblyTools,
  makingTools,
  modelTools,
  ToolServer,
  versionTools,
  viewportTools,
} from "./tools"

const viewport = viewportTools(async ({ kind }) => {
  if (kind === "screenshot") return { data: "AAAA", mimeType: "image/png" }
  if (kind === "parts") return [{ id: "lid", label: "Lid" }]
  throw new Error("The viewport did not answer.")
})

describe("answerTo", () => {
  it("says what it is, in the version it was asked in if it speaks that", async () => {
    const answer = await answerTo("viewport", viewport, {
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    })
    expect(answer).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "viewport" },
      },
    })
    const other = await answerTo("viewport", viewport, {
      id: 2,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    })
    expect(other).toMatchObject({ result: { protocolVersion: "2025-06-18" } })
  })

  it("lists its tools with what each takes", async () => {
    const answer = await answerTo(
      "model",
      modelTools(async () => "done"),
      { id: "a", method: "tools/list" }
    )
    const [arrange] = (
      answer as {
        result: {
          tools: { name: string; inputSchema: { required: string[] } }[]
        }
      }
    ).result.tools
    expect(arrange.name).toBe("arrange")
    expect(arrange.inputSchema).toMatchObject({
      type: "object",
      required: ["what", "groups", "parts"],
    })
    expect(arrange.inputSchema).not.toHaveProperty("$schema")
  })

  it("has the tools a project's own are tried with only where they are to be", async () => {
    const names = (tools: ReturnType<typeof viewportTools>) =>
      tools.map((tool) => tool.name)
    expect(names(viewport)).toEqual(["screenshot", "selection", "parts"])
    const asked: unknown[] = []
    const trying = viewportTools(async (wanted) => {
      asked.push(wanted)
      return [{ tool: "clock", name: "Clock", controls: [] }]
    }, true)
    expect(names(trying)).toEqual([
      "screenshot",
      "selection",
      "parts",
      "tools",
      "tool",
    ])
    expect(
      await answerTo("viewport", trying, {
        id: 1,
        method: "tools/call",
        params: {
          name: "tool",
          arguments: { tool: "clock", control: "set", value: 90 },
        },
      })
    ).toMatchObject({
      result: {
        content: [{ type: "text", text: expect.stringContaining("Clock") }],
      },
    })
    expect(asked).toEqual([
      { kind: "tool", use: { tool: "clock", control: "set", value: 90 } },
    ])
  })

  it("runs a tool, and gives back words or a picture", async () => {
    expect(
      await answerTo("viewport", viewport, {
        id: 1,
        method: "tools/call",
        params: { name: "parts", arguments: {} },
      })
    ).toMatchObject({
      result: {
        content: [{ type: "text", text: expect.stringContaining('"lid"') }],
      },
    })
    expect(
      await answerTo("viewport", viewport, {
        id: 2,
        method: "tools/call",
        params: { name: "screenshot" },
      })
    ).toMatchObject({
      result: {
        content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
      },
    })
  })

  it("says so, as a tool's own answer, when the tool could not do it", async () => {
    expect(
      await answerTo("viewport", viewport, {
        id: 1,
        method: "tools/call",
        params: { name: "selection", arguments: {} },
      })
    ).toMatchObject({
      result: {
        isError: true,
        content: [{ type: "text", text: "The viewport did not answer." }],
      },
    })
    // what it was given is not what the tool takes
    const arranged: unknown[] = []
    const answer = await answerTo(
      "model",
      modelTools(async (given) => {
        arranged.push(given)
        return "done"
      }),
      {
        id: 2,
        method: "tools/call",
        params: { name: "arrange", arguments: { what: "a box" } },
      }
    )
    expect(answer).toMatchObject({ result: { isError: true } })
    expect(arranged).toEqual([])
  })

  it("takes an assembly guide as it is given, and says what came of filing it", async () => {
    const given: unknown[] = []
    const assembly = assemblyTools(async (guide) => {
      given.push(guide)
      if (guide.title === "Nothing")
        throw new Error("The guide was not written.")
      return "Written as assembly/desk-lamp-v1.json"
    })
    const call = (guide: unknown) =>
      answerTo("assembly", assembly, {
        id: 1,
        method: "tools/call",
        params: { name: "guide", arguments: guide },
      })
    const step = { title: "Fit", text: "Push it on.", parts: ["base"] }
    const needs = [{ name: "2.5 mm hex key", icon: "hex-key" }]
    expect(
      await call({
        title: "Desk lamp",
        needs,
        cover: { view: [1, -1, 1], parts: ["base"] },
        steps: [{ ...step, from: [0, 0, 60], view: [1, -1, 1] }],
      })
    ).toMatchObject({
      result: {
        content: [
          { type: "text", text: "Written as assembly/desk-lamp-v1.json" },
        ],
      },
    })
    expect(given).toHaveLength(1)
    await call({
      title: "Desk lamp",
      needs,
      cover: {},
      steps: [
        { ...step, sub: "Shade" },
        { title: "Hang it", text: "On the post.", parts: [], fits: ["Shade"] },
      ],
    })
    expect(given[1]).toMatchObject({
      steps: [{ sub: "Shade" }, { fits: ["Shade"] }],
    })
    given.pop()
    const cover = { parts: ["base"] }
    expect(
      await call({ title: "Nothing", needs, cover, steps: [step] })
    ).toMatchObject({
      result: {
        isError: true,
        content: [{ type: "text", text: "The guide was not written." }],
      },
    })
    // and what is no guide at all is not passed on: a way that is not three numbers,
    // a picture the page has not, nothing said of what is needed
    for (const not of [
      {
        title: "Desk lamp",
        needs,
        cover,
        steps: [{ ...step, from: [0, 60] }],
      },
      {
        title: "Desk lamp",
        needs: [{ name: "Glue", icon: "bottle" }],
        cover,
        steps: [step],
      },
      { title: "Desk lamp", cover, steps: [step] },
      // or of how it is drawn on its cover
      { title: "Desk lamp", needs, steps: [step] },
    ])
      expect(await call(not)).toMatchObject({ result: { isError: true } })
    expect(given).toHaveLength(2)
  })

  it("begins a new version with the brief it is given, or says why it cannot", async () => {
    const briefs: string[] = []
    const versions = versionTools(async (brief) => {
      if (brief === "none") throw new Error("Versions are switched off.")
      briefs.push(brief)
      return "The new version is being begun."
    })
    const call = (given: unknown) =>
      answerTo("versions", versions, {
        id: 1,
        method: "tools/call",
        params: { name: "begin", arguments: given },
      })
    expect(await call({ brief: "Make the lid taller" })).toMatchObject({
      result: {
        content: [{ type: "text", text: "The new version is being begun." }],
      },
    })
    expect(briefs).toEqual(["Make the lid taller"])
    expect(await call({ brief: "none" })).toMatchObject({
      result: {
        isError: true,
        content: [{ type: "text", text: "Versions are switched off." }],
      },
    })
    expect(await call({})).toMatchObject({ result: { isError: true } })
    expect(briefs).toHaveLength(1)
  })

  it("has no answer to what wants none, and an error for what it does not know", async () => {
    expect(
      await answerTo("viewport", viewport, {
        method: "notifications/initialized",
      })
    ).toBeNull()
    expect(
      await answerTo("viewport", viewport, { id: 1, method: "resources/list" })
    ).toMatchObject({ error: { code: -32601 } })
    expect(
      await answerTo("viewport", viewport, {
        id: 2,
        method: "tools/call",
        params: { name: "nothing" },
      })
    ).toMatchObject({ error: { code: -32602 } })
  })
})

describe("makingTools", () => {
  it("says which step of making a board the agent is at, and takes only those", async () => {
    const said: string[] = []
    const [step] = makingTools((one) => said.push(one))
    const answer = await answerTo("boards", [step], {
      id: 1,
      method: "tools/call",
      params: { name: "step", arguments: { step: "routing" } },
    })
    expect(said).toEqual(["routing"])
    expect(JSON.stringify(answer)).toContain("you are routing now")
    const wrong = await answerTo("boards", [step], {
      id: 2,
      method: "tools/call",
      params: { name: "step", arguments: { step: "soldering" } },
    })
    expect(said).toEqual(["routing"])
    expect(JSON.stringify(wrong)).toMatch(/isError|error/)
  })
})

describe("ToolServer", () => {
  const server = new ToolServer()
  afterEach(() => server.close())

  const post = (
    url: string,
    body: unknown,
    headers: Record<string, string> = {}
  ) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })

  it("answers at the address it gave, and only there, and only while it serves", async () => {
    const serving = await server.serve({ viewport })
    const url = serving.urls.viewport
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[\w-]{20,}\/viewport$/)

    const listed = await post(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    })
    expect(listed.status).toBe(200)
    const { result } = (await listed.json()) as {
      result: { tools: { name: string }[] }
    }
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "screenshot",
      "selection",
      "parts",
    ])

    const told = await post(url, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })
    expect(told.status).toBe(202)

    // another set, another key, another way of asking, a page in a browser
    expect((await post(url.replace(/viewport$/, "model"), {})).status).toBe(404)
    expect(
      (await post(url.replace(/\/[\w-]+\/viewport$/, "/wrong/viewport"), {}))
        .status
    ).toBe(404)
    expect((await fetch(url)).status).toBe(405)
    expect(
      (
        await post(
          url,
          { id: 1, method: "ping" },
          { origin: "https://evil.example" }
        )
      ).status
    ).toBe(403)

    serving.stop()
    expect((await post(url, { id: 1, method: "ping" })).status).toBe(404)
  })
})
