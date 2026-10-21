import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  NO_SUCH_METHOD,
  RpcError,
  startPeer,
  stopPeers,
  type Peer,
} from "./rpc"
import { fakeAgent, until } from "./testing"

let dir: string
let peers: Peer[]

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-test-"))
  peers = []
})
afterEach(async () => {
  for (const peer of peers) peer.close()
  await Promise.all(peers.map((peer) => peer.gone))
  fs.rmSync(dir, { recursive: true, force: true })
})

/** What the other side told the app, and what it asked of it, as they came. */
type Heard = { told: [string, unknown][]; asked: [string, unknown][] }

/**
 * A line to a process that speaks as `body` has it (see fakeAgent). What it asks of the
 * app is answered by `answer`, or with what it was asked where there is none.
 */
function line(
  body: string,
  {
    versioned = true,
    answer,
  }: {
    versioned?: boolean
    answer?: (method: string, params: unknown) => Promise<unknown>
  } = {}
): { peer: Peer; heard: Heard } {
  const heard: Heard = { told: [], asked: [] }
  const peer = startPeer(process.execPath, [fakeAgent(dir, versioned, body)], {
    cwd: dir,
    env: process.env,
    versioned,
    onNotification: (method, params) => heard.told.push([method, params]),
    onRequest: async (method, params) => {
      heard.asked.push([method, params])
      return answer ? answer(method, params) : params
    },
  })
  peers.push(peer)
  return { peer, heard }
}

describe("startPeer", () => {
  it("asks, and is answered: each with what it asked", async () => {
    const { peer } = line(`on("double", ({ n }) => ({ n: n * 2 }))`)
    const [four, ten] = await Promise.all([
      peer.request<{ n: number }>("double", { n: 2 }),
      peer.request<{ n: number }>("double", { n: 5 }),
    ])
    expect([four.n, ten.n]).toEqual([4, 10])
  })

  it("rejects with what the other side said went wrong, and how it numbers that", async () => {
    const { peer } = line(
      `on("fail", () => { throw new Error("No such thread.") })`
    )
    const failed = await peer.request("fail").catch((error: unknown) => error)
    expect(failed).toBeInstanceOf(RpcError)
    expect(failed).toMatchObject({ code: -32000, message: "No such thread." })
    await expect(peer.request("dance")).rejects.toMatchObject({
      code: NO_SUCH_METHOD,
    })
  })

  it("hears what it is told, and tells in turn", async () => {
    const { peer, heard } = line(
      `on("ready", (params) => tell("started", { with: params }))`
    )
    peer.notify("ready", { model: "small" })
    await until(() => heard.told.length > 0)
    expect(heard.told).toEqual([["started", { with: { model: "small" } }]])
  })

  it("goes on listening after something it is told that the app could not take", async () => {
    const told: string[] = []
    const peer = startPeer(
      process.execPath,
      [
        fakeAgent(
          dir,
          true,
          `on("ready", () => { tell("broken", {}); tell("fine", {}) }); on("ping", () => ({ pong: true }))`
        ),
      ],
      {
        cwd: dir,
        env: process.env,
        versioned: true,
        onNotification: (method) => {
          if (method === "broken") throw new TypeError("not what was expected")
          told.push(method)
        },
        onRequest: async () => ({}),
      }
    )
    peers.push(peer)
    peer.notify("ready")
    await until(() => told.length > 0)
    expect(told).toEqual(["fine"])
    expect(await peer.request("ping")).toEqual({ pong: true })
  })

  it("stops every process still running, as the app is quit", async () => {
    const { peer } = line(`on("ping", () => ({ pong: true }))`)
    expect(await peer.request("ping")).toEqual({ pong: true })
    stopPeers()
    await peer.gone
    await expect(peer.request("ping")).rejects.toThrow()
  })

  it("answers what it is asked, with what the app says", async () => {
    const { peer, heard } = line(
      `on("run", async () => ({ said: await ask("may", { command: "ls" }) }))`,
      { answer: async () => ({ decision: "allow" }) }
    )
    expect(await peer.request("run")).toEqual({
      said: { decision: "allow" },
    })
    expect(heard.asked).toEqual([["may", { command: "ls" }]])
  })

  it("answers with an error where the app has none to give, numbered as the app numbers it", async () => {
    const { peer } = line(
      `on("run", async () => ({ said: await ask("may", {}) }))`,
      {
        answer: async () => {
          throw new RpcError(NO_SUCH_METHOD, "Nothing here does that.")
        },
      }
    )
    expect(await peer.request("run")).toEqual({
      said: { code: NO_SUCH_METHOD, message: "Nothing here does that." },
    })
  })

  it("says each message is JSON-RPC 2.0 only to a process that says so itself", async () => {
    const seen = `on("seen", () => ({ versions: lines }))
const lines = []
process.stdin.on("data", (data) => lines.push(...String(data).split("\\n").filter(Boolean).map((line) => JSON.parse(line).jsonrpc ?? null)))`
    const said = line(seen)
    expect(await said.peer.request("seen")).toEqual({ versions: ["2.0"] })
    const unsaid = line(seen, { versioned: false })
    expect(await unsaid.peer.request("seen")).toEqual({ versions: [null] })
  })

  it("passes over what the process prints that is none of its messages", async () => {
    const { peer, heard } = line(
      `process.stdout.write("warming up\\n42\\n")
on("hello", () => ({ hello: true }))`
    )
    expect(await peer.request("hello")).toEqual({ hello: true })
    expect(heard).toEqual({ told: [], asked: [] })
  })

  it("gives up what is being waited for when the process goes, with its last words", async () => {
    const { peer } = line(
      `on("leave", () => { process.stderr.write("out of memory\\n"); process.exit(3) })`
    )
    await expect(peer.request("leave")).rejects.toThrow("out of memory")
    await peer.gone
    expect(peer.stderr()).toBe("out of memory")
    await expect(peer.request("anything")).rejects.toThrow("out of memory")
  })

  it("says how a process went that went without a word", async () => {
    const { peer } = line(`on("leave", () => process.exit(3))`)
    await expect(peer.request("leave")).rejects.toThrow(
      "It exited with code 3 before it had answered."
    )
  })

  it("ends the process by closing its input, which lets it leave of itself", async () => {
    const { peer } = line(`on("hello", () => ({ hello: true }))`)
    await peer.request("hello")
    peer.close()
    await peer.gone
    await expect(peer.request("hello")).rejects.toThrow("It exited")
  })

  it("has no line to a command that is not there", async () => {
    const peer = startPeer(path.join(dir, "no-such-agent"), [], {
      cwd: dir,
      env: process.env,
      versioned: true,
      onNotification: () => {},
      onRequest: async () => null,
    })
    peers.push(peer)
    await peer.gone
    await expect(peer.request("hello")).rejects.toThrow(/ENOENT/)
  })
})
