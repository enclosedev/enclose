import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The store is the window's: it keeps things in the window's storage, and tells the
// app's own process what of the view is used. Both are stood in for here, before the
// store is read, since it reads what was kept as it is made.
const { kept, used, sent, turned, sending } = vi.hoisted(() => {
  const kept = new Map<string, string>()
  const used: string[] = []
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  })
  vi.stubGlobal("location", { hash: "" })
  const sent: unknown[][] = []
  // what the app's process answers a message with: null, where it turns it away
  const sending = { into: "conversation" as string | null }
  // what of an agent's turns the app's process was asked to take back, or put back
  const turned: string[][] = []
  const turn = (way: string) => async (projectId: string) => {
    turned.push([way, projectId])
    return { ok: true, what: "Make it taller" }
  }
  vi.stubGlobal("window", {
    cad: {
      analytics: { used: (name: string) => void used.push(name) },
      changes: { undo: turn("undo"), redo: turn("redo") },
      thread: {
        send: async (...given: unknown[]) => {
          sent.push(given)
          return sending.into
        },
      },
    },
  })
  return { kept, used, sent, turned, sending }
})

import type { CadApi, Project, Vec3 } from "@shared/api"
import { RECOLOUR, useStore, type Section } from "./store"

const fresh = useStore.getState()
const state = () => useStore.getState()
const view = () => state().view

/** What a message that was sent went with, by name, as the app's process is told it. */
function message(at: number) {
  const [
    projectId,
    conversationId,
    text,
    notes,
    objects,
    manner,
    reference,
    pictures,
    quotes,
    board,
  ] = sent[at] as Parameters<CadApi["thread"]["send"]>
  return {
    projectId,
    conversationId,
    text,
    notes,
    objects,
    manner,
    reference,
    pictures,
    quotes,
    board,
  }
}

/** A cut across the model, a little way up it. */
const cut: Section = {
  position: [0, 0, 12],
  turn: [0, 0, 0, 1],
  flipped: false,
}

beforeEach(() => {
  useStore.setState(fresh, true)
  kept.clear()
  used.length = 0
  sent.length = 0
  state().activate("clock")
})

describe("what the view is put into", () => {
  it("is kept in the order it was gone into, and counted once as it is", () => {
    state().setView({ section: cut })
    state().setView({ only: { kind: "part", id: "lid" } })
    state().setView({ hidden: ["base"] })
    expect(state().entered).toEqual(["section", "only", "hidden"])
    state().setView({ section: { ...cut, flipped: true } })
    expect(state().entered).toEqual(["section", "only", "hidden"])
    expect(used).toEqual(["section", "only", "hidden"])
    state().setView({ only: null })
    expect(state().entered).toEqual(["section", "hidden"])
  })

  it("has the blueprint and the guides take the view's place by turns", () => {
    state().setView({ blueprint: true })
    expect(view()).toMatchObject({ blueprint: true, assembly: false })
    state().setView({ assembly: true })
    expect(view()).toMatchObject({ blueprint: false, assembly: true })
    state().setView({ blueprint: true })
    expect(view()).toMatchObject({ blueprint: true, assembly: false })
    expect(state().entered).toEqual(["blueprint"])
  })

  it("shows a sheet by itself only while it is the blueprint that is looked at", () => {
    state().setPartsOpen(true)
    state().setView({ blueprint: true, sheet: 2 })
    expect(view().sheet).toBe(2)
    expect(state().partsOpen).toBe(false)
    state().setView({ assembly: true })
    expect(view().sheet).toBeNull()
  })

  it("lets go of what was picked out for a blueprint, and keeps it for the guides", () => {
    const lid = {
      id: "lid",
      label: "Lid",
      point: [0, 0, 20] as Vec3,
      normal: [0, 0, 1] as Vec3,
      face: 3,
    }
    state().select({ part: lid, at: null })
    state().setView({ assembly: true })
    expect(state().selection?.part).toEqual(lid)
    state().setView({ blueprint: true })
    expect(state().selection).toBeNull()
  })

  it("puts the lists away, and what was being looked for, for the guides", () => {
    state().setPartsOpen(true)
    state().find("leg")
    state().setView({ assembly: true })
    expect(state()).toMatchObject({ partsOpen: false, finding: null })
  })

  it("keeps how the view was left for the next time: its grid, and the cut of each project", () => {
    state().setView({ grid: true })
    state().setView({ section: cut })
    state().setView({ section: null })
    expect(kept.get("enclose:grid")).toBe("on")
    state().cutOpen(() => ({ ...cut, position: [0, 0, 0] }))
    expect(view().section).toEqual(cut)
    state().activate("stool")
    state().cutOpen(() => ({ ...cut, position: [0, 0, 0] }))
    expect(view().section?.position).toEqual([0, 0, 0])
  })

  it("cuts open afresh where the cut it was left with no longer fits", () => {
    state().setView({ section: cut })
    state().setView({ section: null })
    state().cutOpen(
      () => ({ ...cut, position: [0, 0, 0] }),
      () => false
    )
    expect(view().section?.position).toEqual([0, 0, 0])
  })

  it("opens another project as a model is first looked at, with nothing gone into", () => {
    state().setView({ section: cut, exploded: true, assembly: true })
    state().activate("stool")
    expect(view()).toMatchObject({
      section: null,
      exploded: false,
      assembly: false,
    })
    expect(state().entered).toEqual([])
  })
})

describe("a circuit board, in PCB mode", () => {
  it("is first seen in 3D, from above, whichever way the last one was looked at", () => {
    state().setView({ board: "main" })
    expect(view()).toMatchObject({
      board: "main",
      boardAs: "3d",
      boardLayer: 1,
    })
    state().setView({ boardAs: "pcb", boardLayer: 4 })
    state().setView({ board: "power" })
    expect(view()).toMatchObject({ boardAs: "3d", boardLayer: 1 })
    state().setView({ boardAs: "schematic" })
    state().setView({ board: null })
    state().setView({ board: "power" })
    expect(view().boardAs).toBe("3d")
    state().setView({ board: null })
    state().setView({ board: "main", boardAs: "pcb" })
    expect(view().boardAs).toBe("pcb")
  })
})

describe("what Esc steps back through", () => {
  /** Press it, and say whether there was anything for it to do. */
  const esc = () => state().leave()

  it("does nothing where there is nothing to get out of", () => {
    expect(esc()).toBe(false)
  })

  it("puts the search away first, and then whichever list is up", () => {
    state().setView({ section: cut })
    state().setPartsOpen(true)
    state().find("leg")
    expect(esc()).toBe(true)
    expect(state()).toMatchObject({ finding: null, partsOpen: true })
    expect(esc()).toBe(true)
    expect(state().partsOpen).toBe(false)
    expect(view().section).toEqual(cut)
    expect(esc()).toBe(true)
    expect(view().section).toBeNull()
    expect(esc()).toBe(false)
  })

  it("leaves the project's tools at work, where they have been since it opened, until they are brought up", () => {
    // at work by themselves, from when the project opened
    state().setView({ tools: true, toolsQuiet: true })
    expect(esc()).toBe(false)
    expect(view().tools).toBe(true)
    state().setToolsOpen(true)
    expect(view()).toMatchObject({ tools: true, toolsQuiet: false })
    expect(esc()).toBe(true)
    expect(state().toolsOpen).toBe(false)
    expect(esc()).toBe(true)
    expect(view().tools).toBe(false)
  })

  it("puts a model that is pulled apart together before anything else, whenever it was", () => {
    state().setView({ exploded: true })
    state().setView({ section: cut })
    state().setView({ only: { kind: "part", id: "lid" } })
    esc()
    expect(view()).toMatchObject({ exploded: false, section: cut })
    expect(view().only).not.toBeNull()
  })

  it("then gets out of what was gone into, the last first", () => {
    state().setView({ section: cut })
    state().setView({ hidden: ["base"] })
    state().setView({ only: { kind: "part", id: "lid" } })
    esc()
    expect(view()).toMatchObject({ only: null, hidden: ["base"] })
    esc()
    expect(view().hidden).toEqual([])
    expect(view().section).toEqual(cut)
    esc()
    expect(view().section).toBeNull()
  })

  it("brings back what was hidden last by itself, and then all the rest", () => {
    state().setHidden(["base"])
    state().setHidden(["base", "lid", "lid_screws"])
    expect(esc()).toBe(true)
    expect(view().hidden).toEqual(["base"])
    expect(esc()).toBe(true)
    expect(view().hidden).toEqual([])
    expect(esc()).toBe(false)
  })

  it("brings back all of it at once where it was all hidden together", () => {
    state().setHidden(["base", "lid"])
    esc()
    expect(view().hidden).toEqual([])
  })

  it("brings back what was hidden last of what is still out of sight", () => {
    state().setHidden(["base"])
    state().setHidden(["base", "lid", "foot"])
    state().setHidden(["base", "foot"])
    esc()
    expect(view().hidden).toEqual(["base"])
    state().setHidden(["base", "lid"])
    esc()
    expect(view().hidden).toEqual(["base"])
  })

  it("puts a sheet back among the others before it leaves the blueprint", () => {
    state().setView({ blueprint: true, sheet: 1 })
    esc()
    expect(view()).toMatchObject({ blueprint: true, sheet: null })
    esc()
    expect(view().blueprint).toBe(false)
  })

  it("gets out of the guides before what was gone into under them", () => {
    state().setView({ section: cut })
    state().setView({ assembly: true })
    esc()
    expect(view()).toMatchObject({ assembly: false, section: cut })
  })
})

describe("what is over the view, put away a step at a time", () => {
  it("is the other projects, then all of it, then none, and leaves the conversation as it is", () => {
    state().setThreadOpen(true)
    state().clearView()
    expect(state()).toMatchObject({ cleared: "others", threadOpen: true })
    state().clearView()
    expect(state()).toMatchObject({ cleared: "all", threadOpen: true })
    state().clearView()
    expect(state()).toMatchObject({ cleared: null, threadOpen: true })
  })

  it("is not what Esc gets out of", () => {
    state().clearView()
    state().clearView()
    expect(state().leave()).toBe(false)
    expect(state().cleared).toBe("all")
  })
})

describe("Cmd+Z", () => {
  /** The open project, with a turn of an agent's that can be taken back. */
  const undoable = (took: number | null = 120_000) =>
    useStore.setState({
      projects: [
        {
          id: "clock",
          undo: { what: "Make it taller", at: 1000, took },
          redo: null,
        } as unknown as Project,
      ],
    })

  beforeEach(() => {
    state().letUndoGo()
    turned.length = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("takes back an agent's turn only at a second press, which the first asks for", async () => {
    undoable()
    await state().undo()
    expect(turned).toEqual([])
    expect(state().saying?.text).toMatch(
      /again to undo 2 min of the agent's work: “Make it taller”$/
    )
    await state().undo()
    expect(turned).toEqual([["undo", "clock"]])
    expect(state().saying?.text).toMatch(
      /^Undid “Make it taller”\. .* puts it back$/
    )
  })

  it("asks again where something else was done in between, or the time ran out", async () => {
    vi.useFakeTimers({ now: 10_000 })
    undoable()
    await state().undo()
    state().letUndoGo()
    expect(state().saying).toBeNull()
    await state().undo()
    vi.advanceTimersByTime(5000)
    await state().undo()
    expect(turned).toEqual([])
    await state().undo()
    expect(turned).toEqual([["undo", "clock"]])
  })

  it("takes back parts put out of sight by hand at once, before an earlier turn", async () => {
    undoable()
    state().setHidden(["lid"])
    expect(view().hidden).toEqual(["lid"])
    await state().undo()
    expect(view().hidden).toEqual([])
    expect(state().saying?.text).toBe("Undid hiding a part")
    await state().redo()
    expect(view().hidden).toEqual(["lid"])
    expect(turned).toEqual([])
  })

  it("can put back out of sight what Esc brought back", async () => {
    undoable()
    state().setHidden(["lid", "base"])
    expect(state().leave()).toBe(true)
    expect(view().hidden).toEqual([])
    await state().undo()
    expect(view().hidden).toEqual(["lid", "base"])
    expect(state().saying?.text).toBe("Undid showing 2 parts")
  })
})

describe("words picked out of the conversation", () => {
  const quotes = () => state().quotes.clock ?? []

  it("are kept for the next message, with what was said of them or nothing", () => {
    state().quote({ quote: "Which screws?" })
    expect(state().quoting).toEqual({ id: null, quote: "Which screws?" })
    const asked = state().writeRequests
    const first = state().keepQuote("  M3, four of them ")
    expect(quotes()).toMatchObject([
      { id: first, quote: "Which screws?", text: "M3, four of them" },
    ])
    expect(state()).toMatchObject({ quoting: null, noted: first })
    expect(state().writeRequests).toBe(asked + 1)
    state().quote({ quote: "Shall it have a lid?" })
    const second = state().keepQuote("")
    expect(quotes().map((one) => one.text)).toEqual(["M3, four of them", ""])
    expect(second).not.toBe(first)
    expect(state().keepQuote("Nothing")).toBeNull()
    state().quote({ quote: "" })
    expect(state().quoting).toBeNull()
    expect(quotes()).toHaveLength(2)
  })

  it("can have what was said of them changed, and be taken back", () => {
    state().quote({ quote: "Which screws?" })
    const id = state().keepQuote("M3") as string
    state().quote({ id })
    expect(state().quoting).toEqual({ id, quote: "Which screws?" })
    expect(state().keepQuote("M4, on second thoughts")).toBe(id)
    expect(quotes()).toMatchObject([
      { id, quote: "Which screws?", text: "M4, on second thoughts" },
    ])
    state().quote({ id })
    state().keepQuote(" ")
    expect(quotes()).toMatchObject([{ id, text: "" }])
    state().quote({ id: "nothing" })
    expect(state().quoting).toBeNull()
    state().quote({ id })
    state().dropQuote(id)
    expect(quotes()).toEqual([])
    expect(state().quoting).toBeNull()
  })

  it("go with the message, and are then no longer waiting", () => {
    useStore.setState({
      projects: [{ id: "clock", conversations: [] }] as never,
    })
    state().quote({ quote: "Which screws?" })
    state().keepQuote("M3")
    state().quote({ quote: "Something else" })
    state().send()
    expect(sent).toHaveLength(1)
    expect(message(0).projectId).toBe("clock")
    expect(message(0).quotes).toEqual([{ quote: "Which screws?", text: "M3" }])
    expect(message(0).board).toBeNull()
    expect(state()).toMatchObject({ quoting: null, quotes: { clock: [] } })
    state().send()
    expect(sent).toHaveLength(1)
  })
})

describe("a message that is turned away", () => {
  afterEach(() => {
    sending.into = "conversation"
  })

  it("comes back to the box with what went with it, and says why", async () => {
    sending.into = null
    useStore.setState({
      projects: [
        {
          id: "clock",
          conversations: [{ id: "other", status: "working", updatedAt: 0 }],
        },
      ] as never,
      // (a new conversation, begun while the agent is at work in the other)
      picked: { clock: null },
      drafts: { clock: "Make it taller" },
    })
    state().quote({ quote: "Which screws?" })
    state().keepQuote("M3")
    state().send()
    expect(sent).toHaveLength(1)
    expect(state().drafts.clock).toBe("")
    await vi.waitFor(() => expect(state().drafts.clock).toBe("Make it taller"))
    expect(state().quotes.clock).toEqual([
      expect.objectContaining({ quote: "Which screws?", text: "M3" }),
    ])
    expect(state().saying?.text).toMatch(/another conversation/)
  })

  it("goes before what was written since in the box", async () => {
    sending.into = null
    useStore.setState({
      projects: [{ id: "clock", conversations: [] }] as never,
      drafts: { clock: "Make it taller" },
    })
    state().send()
    useStore.setState({ drafts: { clock: "Or wider" } })
    await vi.waitFor(() => expect(state().saying).not.toBeNull())
    expect(state().drafts.clock).toBe("Make it taller\nOr wider")
    expect(state().saying?.text).toBe("The message could not be sent just now")
  })
})

describe("recolouring a project", () => {
  it("opens it, and asks the agent in the conversation its panel shows", () => {
    useStore.setState({
      projects: [
        { id: "clock", conversations: [] },
        { id: "lamp", conversations: [] },
      ] as never,
    })
    state().recolour("lamp")
    expect(state()).toMatchObject({ activeId: "lamp", threadOpen: true })
    expect(sent).toHaveLength(1)
    expect(message(0).projectId).toBe("lamp")
    expect(message(0).conversationId).toBeNull()
    expect(message(0).text).toBe(RECOLOUR)
  })
})
