import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ThreadItem } from "../shared/api"
import {
  digestOf,
  forgetConversations,
  newConversation,
  readConversations,
  readItems,
  readShelved,
  writeConversation,
  writeConversationSoon,
  writeSummaries,
  type Conversation,
} from "./conversations"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclose-conversations-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const said = (id: string, text: string, at = 1): ThreadItem => ({
  kind: "user",
  id,
  at,
  text,
  part: null,
})
const none = () => null

describe("conversations on disk", () => {
  it("keeps each of a project's conversations, and each project's apart", () => {
    const first = { ...newConversation(), items: [said("a", "A cube")] }
    const second = {
      ...newConversation(),
      sessionId: "session-2",
      items: [said("b", "A lid")],
    }
    writeConversation(dir, "p1", first)
    writeConversation(dir, "p1", second)
    writeConversation(dir, "p2", {
      ...newConversation(),
      items: [said("c", "A gear")],
    })

    const read = readConversations(dir, "p1", none)
    expect(read).toHaveLength(2)
    expect(read.find((c) => c.id === first.id)).toEqual(first)
    expect(read.find((c) => c.id === second.id)).toEqual(second)
    expect(readConversations(dir, "p2", none)).toHaveLength(1)
    expect(readConversations(dir, "p3", none)).toEqual([])
  })

  it("writes a conversation without holding the app up, as it would be written at once", async () => {
    const one = {
      ...newConversation(),
      sessionId: "session-1",
      items: [said("a", "A cube")],
    }
    const writing = writeConversationSoon(dir, "p1", one)
    // what is written is the conversation as it was asked to be
    one.items = [...one.items, said("b", "With a hole")]
    await writing
    expect(readConversations(dir, "p1", none)).toEqual([
      { ...one, items: [said("a", "A cube")] },
    ])
  })

  it("writes over a conversation that is carried on, rather than beside it", () => {
    const one = { ...newConversation(), items: [said("a", "A cube")] }
    writeConversation(dir, "p1", one)
    one.items.push(said("b", "With a hole"))
    one.sessionId = "session-1"
    writeConversation(dir, "p1", one)
    expect(readConversations(dir, "p1", none)).toEqual([one])
  })

  it("takes in the one conversation a project had before it could have more", () => {
    const items = [said("a", "A cube"), said("b", "With a hole")]
    fs.writeFileSync(path.join(dir, "p1.json"), JSON.stringify(items))

    const read = readConversations(dir, "p1", () => "session-1")
    expect(read).toEqual([
      {
        id: read[0].id,
        provider: "claude",
        sessionId: "session-1",
        guided: null,
        name: null,
        items,
        gist: null,
      },
    ])
    expect(fs.existsSync(path.join(dir, "p1.json"))).toBe(false)
    expect(readConversations(dir, "p1", none)).toEqual(read)
  })

  it("keeps the name a conversation was given", () => {
    const named = {
      ...newConversation(),
      name: "The lid",
      items: [said("a", "A cube")],
    }
    writeConversation(dir, "p1", named)
    expect(readConversations(dir, "p1", none)).toEqual([named])
  })

  it("keeps whose agent a conversation is had with, and takes one that says nothing of it for Claude Code's", () => {
    const groks = {
      ...newConversation("grok"),
      sessionId: "01a1",
      guided: "abc",
      items: [said("a", "A cube")],
    }
    writeConversation(dir, "p1", groks)
    expect(readConversations(dir, "p1", none)).toEqual([groks])

    // from before there was any other, or with something else written where it goes
    for (const provider of [undefined, "gemini", 3])
      fs.writeFileSync(
        path.join(dir, "p1", `${groks.id}.json`),
        JSON.stringify({ provider, sessionId: "s", items: groks.items })
      )
    expect(readConversations(dir, "p1", none)).toMatchObject([
      { provider: "claude", sessionId: "s", guided: null },
    ])
  })

  it("keeps what a message was summed up as, and drops what does not read as that", () => {
    const summed = {
      ...newConversation(),
      items: [said("a", "A cube")],
      gist: { of: "a", text: "A cube, summed up" },
    }
    writeConversation(dir, "p1", summed)
    expect(readConversations(dir, "p1", none)).toEqual([summed])
    fs.writeFileSync(
      path.join(dir, "p1", `${summed.id}.json`),
      JSON.stringify({ sessionId: null, items: summed.items, gist: { of: 3 } })
    )
    expect(readConversations(dir, "p1", none)).toEqual([
      { ...summed, gist: null },
    ])
  })

  it("makes no conversation of one in which nothing was said", () => {
    fs.writeFileSync(path.join(dir, "p1.json"), "[]")
    expect(readConversations(dir, "p1", () => "session-1")).toEqual([])
    expect(fs.existsSync(path.join(dir, "p1.json"))).toBe(false)
  })

  it("leaves alone what is not its own, and moves a conversation it cannot read aside", () => {
    fs.writeFileSync(path.join(dir, "p1.json"), "{ cut short")
    fs.mkdirSync(path.join(dir, "p1"))
    fs.writeFileSync(path.join(dir, "p1", "broken.json"), "{ cut short")
    fs.writeFileSync(path.join(dir, "p1", "notes.txt"), "not ours")
    writeConversation(dir, "p1", {
      ...newConversation(),
      id: "good",
      items: [said("u1", "a lid")],
    })
    expect(readConversations(dir, "p1", none).map((c) => c.id)).toEqual([
      "good",
    ])
    const left = fs.readdirSync(path.join(dir, "p1")).sort()
    expect(left).toHaveLength(3)
    expect(left[0]).toMatch(/^broken\.json\.corrupt-\d+$/)
    expect(left.slice(1)).toEqual(["good.json", "notes.txt"])
    expect(fs.readFileSync(path.join(dir, "p1", left[0]), "utf8")).toBe(
      "{ cut short"
    )
    expect(fs.existsSync(path.join(dir, "p1.json"))).toBe(true)
  })

  it("writes a conversation whole, leaving nothing beside it", () => {
    const conversation = {
      ...newConversation(),
      items: [said("u1", "a lid")],
    }
    writeConversation(dir, "p1", conversation)
    writeConversation(dir, "p1", {
      ...conversation,
      items: [said("u1", "a lid"), said("u2", "a box")],
    })
    expect(fs.readdirSync(path.join(dir, "p1"))).toEqual([
      `${conversation.id}.json`,
    ])
    expect(readConversations(dir, "p1", none)[0].items).toHaveLength(2)
  })

  it("brings back what was in flight when the app closed as over", () => {
    writeConversation(dir, "p1", {
      ...newConversation(),
      items: [
        said("a", "A cube"),
        {
          kind: "tool",
          id: "t",
          at: 2,
          name: "Run",
          detail: "python3 model.py",
          state: "running",
        },
        { kind: "assistant", id: "s", at: 3, text: "The cu", streaming: true },
      ],
    })
    expect(readConversations(dir, "p1", none)[0].items.slice(1)).toMatchObject([
      { state: "failed" },
      { streaming: false },
    ])
  })

  it("forgets a project's conversations, and only that project's", () => {
    writeConversation(dir, "p1", {
      ...newConversation(),
      items: [said("a", "A cube")],
    })
    writeConversation(dir, "p2", {
      ...newConversation(),
      items: [said("b", "A lid")],
    })
    fs.writeFileSync(path.join(dir, "p1.json"), "[]")
    forgetConversations(dir, "p1")
    expect(fs.readdirSync(dir)).toEqual(["p2"])
    expect(readConversations(dir, "p2", none)).toHaveLength(1)
  })
})

const answered = (id: string, text: string, at = 1): ThreadItem => ({
  kind: "assistant",
  id,
  at,
  text,
  streaming: false,
})
const noted = (id: string, at = 1): ThreadItem => ({
  kind: "notice",
  id,
  at,
  tone: "info",
  text: "Stopped.",
})

describe("digestOf", () => {
  it("keeps the first item, the first said, the last said by either and the last, in order", () => {
    const items = [
      noted("n0"),
      said("u1", "A cube"),
      answered("a1", "Done"),
      said("u2", "With a hole"),
      answered("a2", "Done again"),
      noted("n1"),
    ]
    expect(digestOf(items).map((item) => item.id)).toEqual([
      "n0",
      "u1",
      "a2",
      "n1",
    ])
    expect(digestOf([said("u1", "A cube")])).toEqual([said("u1", "A cube")])
    expect(digestOf([])).toEqual([])
  })

  it("keeps a board made in the background without what was done in making it", () => {
    const job: ThreadItem = {
      kind: "job",
      id: "j",
      at: 2,
      board: "main",
      name: "Main board",
      state: "done",
      items: [answered("x", "Placed")],
      ended: 3,
    }
    expect(digestOf([said("u1", "A board"), job])).toEqual([
      said("u1", "A board"),
      { ...job, items: [] },
    ])
  })
})

describe("conversations as the sidebar has them", () => {
  const long = (id: string) => ({
    ...newConversation(),
    id,
    items: [
      said("u1", "A cube"),
      answered("a1", "Done"),
      said("u2", "With a hole"),
      answered("a2", "Done again"),
    ],
  })
  /** how many times each conversation's own file is read while `work` is done */
  const readsOf = (work: () => void) => {
    const read = vi.spyOn(fs, "readFileSync")
    try {
      work()
      return read.mock.calls.filter(
        ([file]) =>
          typeof file === "string" &&
          file.endsWith(".json") &&
          file.includes(`${path.sep}p1${path.sep}`)
      ).length
    } finally {
      read.mockRestore()
    }
  }

  it("has only what each card needs, and all of it from the file when wanted", () => {
    writeConversation(dir, "p1", long("c1"))
    const [shelved] = readShelved(dir, "p1", none)
    expect(shelved).toMatchObject({ id: "c1", shelved: true })
    expect(shelved.items.map((item) => item.id)).toEqual(["u1", "a2"])
    expect(readItems(dir, "p1", "c1")).toEqual(long("c1").items)
    expect(readItems(dir, "p1", "gone")).toBeNull()
  })

  it("reads none of the conversations' files where the summaries are as they are", () => {
    writeConversation(dir, "p1", long("c1"))
    writeConversation(dir, "p1", { ...long("c2"), name: "The lid" })
    let first: Conversation[] = []
    expect(readsOf(() => (first = readShelved(dir, "p1", none)))).toBe(2)
    let again: Conversation[] = []
    expect(readsOf(() => (again = readShelved(dir, "p1", none)))).toBe(0)
    const byId = (conversations: Conversation[]) =>
      [...conversations].sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(again)).toEqual(byId(first))
    expect(byId(again)[1]).toMatchObject({ name: "The lid" })
  })

  it("reads again the one whose file was written since, and forgets one that is gone", () => {
    writeConversation(dir, "p1", long("c1"))
    writeConversation(dir, "p1", long("c2"))
    readShelved(dir, "p1", none)
    writeConversation(dir, "p1", {
      ...long("c1"),
      items: [...long("c1").items, said("u3", "In red")],
    })
    fs.rmSync(path.join(dir, "p1", "c2.json"))
    let read: Conversation[] = []
    expect(readsOf(() => (read = readShelved(dir, "p1", none)))).toBe(1)
    expect(read.map((one) => one.id)).toEqual(["c1"])
    expect(read[0].items.at(-1)).toEqual(said("u3", "In red"))
    expect(readsOf(() => readShelved(dir, "p1", none))).toBe(0)
  })

  it("writes the summaries anew where they cannot be read, and keeps them from what is written", () => {
    writeConversation(dir, "p1", long("c1"))
    fs.writeFileSync(path.join(dir, "p1", "summaries.index"), "{ cut short")
    expect(readShelved(dir, "p1", none).map((one) => one.id)).toEqual(["c1"])
    expect(readsOf(() => readShelved(dir, "p1", none))).toBe(0)
    // a conversation is never taken for one: nor is it moved aside
    expect(readConversations(dir, "p1", none).map((one) => one.id)).toEqual([
      "c1",
    ])
    // what is written of them goes by what each was when its file was written
    const [shelved] = readShelved(dir, "p1", none)
    writeSummaries(dir, "p1", [{ ...shelved, name: "Renamed" }])
    expect(readShelved(dir, "p1", none)[0].name).toBeNull()
  })
})
