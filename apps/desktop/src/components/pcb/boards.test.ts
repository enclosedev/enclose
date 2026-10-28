import { describe, expect, it, vi } from "vitest"

import type { BoardSummary, ConversationSummary } from "@shared/api"
import { AT_BOARD_MS, boardAtWork, sizeSaid, withRouting } from "./boards"

// the window's store, which the hooks beside it read: sizeSaid needs none of it
vi.mock("@/lib/store", () => ({ useStore: () => null }))

const sized = (size: BoardSummary["size"]) => ({ size }) as BoardSummary

describe("sizeSaid", () => {
  it("says how big a board is, across and then from top to bottom, in mm", () => {
    expect(sizeSaid(sized([40, 25]))).toBe("40 × 25 mm")
  })

  it("says it to a tenth of a mm, and no closer", () => {
    expect(sizeSaid(sized([40.04, 25.06]))).toBe("40 × 25.1 mm")
    expect(sizeSaid(sized([12.345, 0.25]))).toBe("12.3 × 0.3 mm")
  })

  it("says nothing while how big it is is not known", () => {
    expect(sizeSaid(sized(null))).toBeNull()
  })
})

describe("boardAtWork", () => {
  const board = (id: string, at: Partial<BoardSummary> = {}) =>
    ({ id, built: 1_000, preview: null, building: null, ...at }) as BoardSummary
  const turn = (since: number, job: string | null = null) =>
    ({
      status: "working",
      since,
      job: job && { board: job },
    }) as ConversationSummary
  const idle = { status: "idle", since: null, job: null } as ConversationSummary

  it("is the board built since the turn began, until a while after", () => {
    const built = board("main", { built: 5_000 })
    expect(boardAtWork([built], [turn(4_000)], 6_000)).toBe(built)
    expect(boardAtWork([built], [turn(4_000)], 5_000 + AT_BOARD_MS)).toBe(built)
    expect(boardAtWork([built], [turn(4_000)], 5_001 + AT_BOARD_MS)).toBeNull()
  })

  it("is the board written since the turn began, by its quick look", () => {
    const written = board("main", { preview: 5_000 })
    expect(boardAtWork([written], [turn(4_000)], 6_000)).toBe(written)
  })

  it("is a board being built, however long the build takes", () => {
    const building = board("main", {
      building: { since: 5_000 } as BoardSummary["building"],
    })
    expect(boardAtWork([building], [turn(4_000)], 60_000)).toBe(building)
  })

  it("is none built before the turn, or with no turn at all", () => {
    const built = board("main", { built: 3_000 })
    expect(boardAtWork([built], [turn(4_000)], 5_000)).toBeNull()
    expect(boardAtWork([board("main", { built: 5_000 })], [idle], 6_000)).toBe(
      null
    )
  })

  it("is the one the agent was at last, of several", () => {
    const first = board("first", { built: 5_000 })
    const last = board("last", { preview: 6_000 })
    expect(boardAtWork([first, last], [turn(4_000)], 7_000)).toBe(last)
    expect(boardAtWork([last, first], [turn(4_000)], 7_000)).toBe(last)
  })

  it("leaves out a board made in detail in the background", () => {
    const made = board("main", { built: 5_000 })
    expect(
      boardAtWork([made], [turn(4_000), turn(2_000, "main")], 6_000)
    ).toBeNull()
  })
})

describe("withRouting", () => {
  const part = (x: number) => [
    { type: "source_component", source_component_id: "s1", name: "U1" },
    {
      type: "pcb_component",
      source_component_id: "s1",
      center: { x, y: 0 },
      rotation: 0,
    },
  ]
  const board = {
    type: "pcb_board",
    center: { x: 0, y: 0 },
    width: 40,
    height: 30,
  }
  const trace = (id: string) => ({
    type: "pcb_trace",
    pcb_trace_id: id,
    route: [],
  })
  // the quick look: the trace written in the board's file, and artwork since
  const look = [
    board,
    ...part(5),
    trace("written"),
    { type: "pcb_silkscreen_graphic" },
  ]
  const built = [
    board,
    ...part(5),
    trace("written"),
    trace("routed"),
    { type: "pcb_via" },
    { type: "pcb_copper_pour" },
  ]

  it("draws the quick look with the routing of its build, where nothing has moved", () => {
    const { circuit, routed } = withRouting(look, built)
    expect(routed).toBe("as built")
    expect(circuit.map((element) => element.type).sort()).toEqual([
      "pcb_board",
      "pcb_component",
      "pcb_copper_pour",
      "pcb_silkscreen_graphic",
      "pcb_trace",
      "pcb_trace",
      "pcb_via",
      "source_component",
    ])
  })

  it("carries none where a part has moved, or the board", () => {
    const moved = [board, ...part(6), trace("written")]
    expect(withRouting(moved, built)).toEqual({ circuit: moved, routed: "not" })
    const grown = [{ ...board, width: 50 }, ...part(5)]
    expect(withRouting(grown, built).routed).toBe("not")
  })

  it("says nothing where the build was not routed either", () => {
    const unrouted = [board, ...part(5), trace("written")]
    expect(withRouting(look, unrouted)).toEqual({ circuit: look, routed: null })
  })
})
