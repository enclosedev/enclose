// A project's circuit boards, as the window has them: the list of them, read again
// whenever one is written or built, and what is built of each, loaded from the project's
// folder (see shared/board-format.ts).
import * as React from "react"

import {
  BOARD_HOST,
  MODEL_SCHEME,
  type BoardSummary,
  type ConversationSummary,
  type Project,
} from "@shared/api"
import { builtOf } from "@shared/board-format"
import { useStore } from "@/lib/store"
import type { BoardJob } from "./making"

/** Stable while a project has no boards. */
const NONE: BoardSummary[] = []

/**
 * Where one of a board's built files is had from: as it was last built, and loaded again
 * whenever it is built again.
 */
export const boardUrl = (
  projectId: string,
  board: BoardSummary,
  file: keyof ReturnType<typeof builtOf>
) =>
  `${MODEL_SCHEME}://${projectId}.${BOARD_HOST}/${builtOf(board.id)[file]}?r=${(file === "preview" ? board.preview : board.built) ?? 0}`

/**
 * A project's boards, in the order of their files: none if it has none. Null until they
 * have been read for it, and of no project. Read again whenever one is written or built.
 */
export function useBoards(project: Project | null): BoardSummary[] | null {
  const [read, setRead] = React.useState<{
    of: string
    boards: BoardSummary[]
  } | null>(null)
  const id = project?.id ?? null
  const revision = project?.boards ?? null
  React.useEffect(() => {
    if (id === null) return
    let over = false
    void (
      revision === null ? Promise.resolve(NONE) : window.cad.boards.read(id)
    ).then((boards) => {
      // (those it had stay up until the ones it has now are read)
      if (!over) setRead({ of: id, boards })
    })
    return () => {
      over = true
    }
  }, [id, revision])
  return id !== null && read?.of === id ? read.boards : null
}

/** A board as tscircuit has it: a list of what is in it, each a plain object. */
export type Circuit = Record<string, unknown>[]

/** The boards as tscircuit has them, by where each was had from: the last few. */
const circuits = new Map<string, Promise<Circuit>>()
const KEPT = 6

/** A board as tscircuit has it, as it was last built: loaded once for each time it is. */
function loadCircuit(url: string): Promise<Circuit> {
  const had = circuits.get(url)
  if (had) return had
  const loading = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error("The board has not been built.")
      return response.json() as Promise<unknown>
    })
    .then((read) => {
      if (!Array.isArray(read)) throw new Error("The board does not read.")
      return read as Circuit
    })
  circuits.set(url, loading)
  for (const old of [...circuits.keys()].slice(0, -KEPT)) circuits.delete(old)
  // it would not load: the next asking tries again
  loading.catch(() => {
    if (circuits.get(url) === loading) circuits.delete(url)
  })
  return loading
}

/** What the router makes of a board: the build has it, and a quick look at it does not. */
const ROUTED = new Set(["pcb_trace", "pcb_via", "pcb_copper_pour"])

/**
 * A quick look at a board, which is never routed, with the routing of its last build
 * (`built`), and how it stands to that (see `Routed`). The routing is carried over only
 * where every part is where it was then, on the same board, so that what was routed
 * still goes where it went; and there is none to carry where the build was not routed
 * either.
 */
export function withRouting(
  look: Circuit,
  built: Circuit
): { circuit: Circuit; routed: Routed } {
  const count = (circuit: Circuit, type: string) =>
    circuit.filter((element) => element.type === type).length
  // (a quick look has the traces and vias written into the board's file, and no more)
  if (
    count(built, "pcb_trace") <= count(look, "pcb_trace") &&
    count(built, "pcb_via") <= count(look, "pcb_via")
  )
    return { circuit: look, routed: null }
  if (placings(look) !== placings(built))
    return { circuit: look, routed: "not" }
  return {
    circuit: [
      ...look.filter((element) => !ROUTED.has(element.type as string)),
      ...built.filter((element) => ROUTED.has(element.type as string)),
    ],
    routed: "as built",
  }
}

/** Where each part of a board is, and the board itself, in a line: the same while none has moved. */
function placings(circuit: Circuit): string {
  const names = new Map(
    circuit
      .filter((element) => element.type === "source_component")
      .map((element) => [element.source_component_id, element.name])
  )
  const at = (point: unknown) => {
    const { x, y } = (point ?? {}) as { x?: number; y?: number }
    return `${(x ?? 0).toFixed(3)},${(y ?? 0).toFixed(3)}`
  }
  return circuit
    .flatMap((element) =>
      element.type === "pcb_component"
        ? [
            `${String(names.get(element.source_component_id))} ${at(element.center)} ${String(element.rotation ?? 0)} ${String(element.layer ?? "top")}`,
          ]
        : element.type === "pcb_board"
          ? [
              `board ${at(element.center)} ${String(element.width)} ${String(element.height)} ${JSON.stringify(element.outline ?? null)}`,
            ]
          : []
    )
    .sort()
    .join("\n")
}

/**
 * How what is drawn of a board stands to its routing, where it is a quick look at it
 * written since it was last built: routed as it was then (every part is where it was),
 * or not routed, as something has moved. Null where it is the board as built.
 */
export type Routed = "as built" | "not" | null

/**
 * A board as tscircuit has it, for as long as it is wanted: null until it is loaded, and
 * while there is nothing built of it. While it is built again, the one before stays. A
 * quick look at it, newer than its build, is drawn with the build's routing, where that
 * still holds (see `withRouting`).
 */
export function useCircuit(
  projectId: string,
  board: BoardSummary | null
): { circuit: Circuit | null; trouble: string | null; routed: Routed } {
  // a quick look at it as it is being written, where there is one newer than its build
  const url = !board
    ? null
    : board.preview !== null
      ? boardUrl(projectId, board, "preview")
      : board.built !== null
        ? boardUrl(projectId, board, "circuit")
        : null
  // and its build, for the routing, which the quick look has none of
  const builtUrl =
    board && board.preview !== null && board.built !== null
      ? boardUrl(projectId, board, "circuit")
      : null
  const id = board?.id ?? null
  const [had, setHad] = React.useState<{
    of: string
    board: string | null
    circuit: Circuit | null
    trouble: string | null
    routed: Routed
  } | null>(null)
  React.useEffect(() => {
    if (!url) return
    let over = false
    void loadCircuit(url)
      .then(async (circuit): Promise<{ circuit: Circuit; routed: Routed }> => {
        if (!builtUrl) return { circuit, routed: null }
        // (a build that will not load leaves the quick look as it is)
        const built = await loadCircuit(builtUrl).catch(() => null)
        return built ? withRouting(circuit, built) : { circuit, routed: null }
      })
      .then(
        ({ circuit, routed }) => {
          if (!over)
            setHad({ of: url, board: id, circuit, trouble: null, routed })
        },
        (error: unknown) => {
          if (!over)
            setHad({
              of: url,
              board: id,
              circuit: null,
              trouble: error instanceof Error ? error.message : String(error),
              routed: null,
            })
        }
      )
    return () => {
      over = true
    }
  }, [url, builtUrl, id])
  if (!url) return { circuit: null, trouble: null, routed: null }
  // the board as it was before, while it is built again or looked at as it is being
  // written: but not another board's
  const same = had && had.board === id
  return same
    ? {
        circuit: had.circuit,
        trouble: had.of === url ? had.trouble : null,
        routed: had.routed,
      }
    : { circuit: null, trouble: null, routed: null }
}

/** How big a board is, as it is said under its name: "40 × 25 mm". */
export function sizeSaid(board: BoardSummary): string | null {
  if (!board.size) return null
  const round = (mm: number) => String(Math.round(mm * 10) / 10)
  return `${round(board.size[0])} × ${round(board.size[1])} mm`
}

/** The agent making a board in detail in the background: null while none is. */
export function useJobOn(
  projectId: string,
  board: BoardSummary
): BoardJob | null {
  return useStore(
    (state) =>
      state.projects
        .find((project) => project.id === projectId)
        ?.conversations.find(
          (conversation) => conversation.job?.board === board.id
        )?.job ?? null
  )
}

/**
 * Whether there is still work being done on a board: an agent making it in detail in
 * the background, or a build of it under way. What is shown of it meanwhile is not what
 * it is going to be, and is shown so.
 */
export function useBeingMade(projectId: string, board: BoardSummary): boolean {
  return useJobOn(projectId, board) !== null || board.building !== null
}

/**
 * How long after the last sign of it an agent is still taken to be at a board, ms: it
 * looks over what one build made before it writes or builds the board again, and what
 * says it is at it is not to come and go in between.
 */
export const AT_BOARD_MS = 10_000

/**
 * The board an agent at work in the project is at just now, `now`, in a turn of a
 * conversation: one it is building, or has written or built since the turn began, until
 * a while after the last of that. Where it is at several, the one it was at last. A
 * board made in detail in the background is not counted, as its card in the
 * conversation says how that is going.
 */
export function boardAtWork(
  boards: readonly BoardSummary[],
  conversations: readonly ConversationSummary[],
  now: number
): BoardSummary | null {
  const turns = conversations.flatMap((conversation) =>
    conversation.status !== "idle" && conversation.since !== null
      ? [conversation.since]
      : []
  )
  if (turns.length === 0) return null
  const began = Math.min(...turns)
  const inDetail = new Set(
    conversations.flatMap((conversation) =>
      conversation.job ? [conversation.job.board] : []
    )
  )
  let found: BoardSummary | null = null
  let latest = -Infinity
  for (const board of boards) {
    if (inDetail.has(board.id)) continue
    const last =
      board.building !== null
        ? Infinity
        : Math.max(board.built ?? -Infinity, board.preview ?? -Infinity)
    if (last < began || now - last > AT_BOARD_MS || last <= latest) continue
    found = board
    latest = last
  }
  return found
}
