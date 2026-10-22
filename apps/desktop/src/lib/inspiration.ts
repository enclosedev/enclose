// A project's inspiration board, as the window has it (see shared/inspiration-format.ts
// and components/inspiration): read from its folder when it is first looked at, changed
// here as the user lays it out, and written back a moment after each change. What the
// agent says of each picture comes from the app's own process as it is said, and is
// taken in here: the window never changes it.
import { create } from "zustand"

import {
  BOARD_TYPES,
  EMPTY_BOARD,
  MOST_IMAGES,
  type InspirationBoard,
  type InspirationImage,
  type InspirationState,
} from "@shared/inspiration-format"
import {
  boxOf,
  heightOf,
  organized,
  pileOf,
  picturesOf,
  PILE_WIDTH,
  placed,
  spreadBoxOf,
  widthFor,
  type Box,
} from "@/components/inspiration/layout"
import { fitted } from "./pictures"

/** How long after a change the board is written, ms: a drag is one change, not a hundred. */
const SAVE_AFTER_MS = 250

/** Where whether the notes are shown beside their marks is kept, from one run to the next. */
const NOTES_KEY = "enclose:inspiration-notes"

const NONE: string[] = []

type InspirationStore = {
  /** each project's board, once it has been read */
  boards: Record<string, InspirationBoard>
  /** the pictures the agent is looking at, by project */
  analysing: Record<string, string[]>
  /** and since when it has been at them, ms, while it is */
  since: Record<string, number>
  /** what was noted on the pictures is shown beside each mark, and not only when pointed at */
  notesShown: boolean
  /** the picture gone up to, on the board on screen, to be noted on; null for none */
  focused: string | null
  /**
   * Puts pictures dropped on the window on the board on screen, where they were dropped
   * (in the window's pixels): null while there is no board on screen.
   */
  dropping: ((files: File[], x: number, y: number) => void) | null
  /** Organizes the board on screen (see `organizedBoard`): null while there is none. */
  organizing: (() => void) | null
  /** every group on the board is spread out at once, and not only one at a time */
  expanded: boolean
  /**
   * Spreads every group of the board on screen out, or puts them all back in their
   * piles (see `expanded`): null while there is no board on screen.
   */
  expanding: ((on: boolean) => void) | null

  /** Read a project's board from its folder, if it has not been read yet. */
  load(projectId: string): Promise<void>
  /** The board as it is to be now: written a moment later. */
  change(projectId: string, next: InspirationBoard): void
  /**
   * Put these pictures on a project's board, as near a place on it as there is room for
   * them. Resolves to how many went on: those that are no pictures, or cannot be kept,
   * do not.
   */
  add(
    projectId: string,
    files: File[],
    around: [number, number]
  ): Promise<number>
  setNotesShown(on: boolean): void
  setFocused(id: string | null): void
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * The model chosen for Codex where a message is written: what Codex looks at the
 * pictures with, where it is Codex that looks (see connectInspiration).
 */
let codexModel: () => string | null = () => null

function saveNow(projectId: string) {
  clearTimeout(timers.get(projectId))
  timers.delete(projectId)
  const board = useInspiration.getState().boards[projectId]
  if (board) void window.cad.inspiration.save(projectId, board, codexModel())
}

/** How big a picture is, in its own pixels: null where it cannot be read as one. */
async function pixelsOf(
  data: ArrayBuffer,
  mimeType: string
): Promise<[number, number] | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([data], { type: mimeType }))
    const size: [number, number] = [bitmap.width, bitmap.height]
    bitmap.close()
    return size[0] > 0 && size[1] > 0 ? size : null
  } catch {
    return null
  }
}

/** The box a group's pile takes, with room round it for its pictures lying askew: null for none. */
function pileBoxOf(
  board: InspirationBoard,
  group: InspirationBoard["groups"][number]
): Box | null {
  const pictures = picturesOf(board.images, group)
  if (pictures.length === 0) return null
  const tallest = Math.max(
    ...pictures.map((image) => heightOf(image.pixels, PILE_WIDTH))
  )
  const askew = pileOf(pictures.length).reduce(
    (most, one) => Math.max(most, Math.abs(one.dx), Math.abs(one.dy)),
    0
  )
  return {
    x: group.at[0],
    y: group.at[1],
    w: PILE_WIDTH + 2 * askew + 40,
    h: tallest + 2 * askew + 60,
  }
}

/**
 * What lies on a board, each as the box it takes: a picture by itself, or the pile of a
 * group, with room round it for its pictures lying askew.
 */
export function takenOn(board: InspirationBoard): Box[] {
  const loose = board.images.filter((image) => image.group === null).map(boxOf)
  const piles = board.groups.flatMap((group) => pileBoxOf(board, group) ?? [])
  return [...loose, ...piles]
}

/**
 * A board organized (see `organized`): its piles and the pictures that lie by
 * themselves in rows, about as wide as `aspect` (width for height) has them. Or, with
 * every group `spread` out, its groups as they lie so, each with room over it for its
 * title.
 */
export function organizedBoard(
  board: InspirationBoard,
  aspect: number,
  spread = false
): InspirationBoard {
  const boxes = new Map(
    board.groups.flatMap((group) => {
      const box = spread
        ? spreadBoxOf(board.images, group)
        : pileBoxOf(board, group)
      return box ? [[group.id, box] as const] : []
    })
  )
  const placed = organized(
    [
      ...board.images
        .filter((image) => image.group === null)
        .map((image) => ({
          id: `i:${image.id}`,
          box: boxOf(image),
          aspect: image.pixels[0] / image.pixels[1],
        })),
      ...[...boxes].map(([id, box]) => ({ id: `g:${id}`, box })),
    ],
    aspect
  )
  return {
    ...board,
    images: board.images.map((image) => {
      const to = placed.get(`i:${image.id}`)
      return to ? { ...image, at: to.at, width: to.width } : image
    }),
    // (each group goes as far as its box went: spread out, that takes in the room over it
    // for its title, and so is not round where the group lies)
    groups: board.groups.map((group) => {
      const to = placed.get(`g:${group.id}`)
      const box = boxes.get(group.id)
      return to && box
        ? {
            ...group,
            at: [
              Math.round(group.at[0] + to.at[0] - box.x),
              Math.round(group.at[1] + to.at[1] - box.y),
            ],
          }
        : group
    }),
  }
}

export const useInspiration = create<InspirationStore>((set, get) => ({
  boards: {},
  analysing: {},
  since: {},
  notesShown: localStorage.getItem(NOTES_KEY) === "on",
  focused: null,
  dropping: null,
  organizing: null,
  expanded: false,
  expanding: null,

  async load(projectId) {
    if (get().boards[projectId]) return
    const state = await window.cad.inspiration.read(projectId, codexModel())
    // (read meanwhile by another asking, or changed here: what is here stays)
    if (get().boards[projectId]) return
    set((now) => ({ boards: { ...now.boards, [projectId]: state.board } }))
    took(projectId, state)
  },

  change(projectId, next) {
    set((now) => ({
      boards: { ...now.boards, [projectId]: { ...next, updated: Date.now() } },
    }))
    clearTimeout(timers.get(projectId))
    timers.set(
      projectId,
      setTimeout(() => saveNow(projectId), SAVE_AFTER_MS)
    )
  },

  async add(projectId, files, around) {
    const room = MOST_IMAGES - (get().boards[projectId]?.images.length ?? 0)
    const kept = await Promise.all(
      files.slice(0, Math.max(0, room)).map(async (file) => {
        const fit = await fitted(file, BOARD_TYPES)
        const pixels = fit && (await pixelsOf(fit.data, fit.mimeType))
        if (!fit || !pixels) return null
        const name = file.name || "image"
        const filed = await window.cad.inspiration
          .add(projectId, { name, mimeType: fit.mimeType, data: fit.data })
          .catch(() => null)
        return filed && { ...filed, name, pixels }
      })
    )
    const fresh = kept.filter((one) => one !== null)
    if (fresh.length === 0) return 0
    // as the board is now, which it may not have been when they were dropped
    const board = get().boards[projectId] ?? EMPTY_BOARD
    const widths = fresh.map((one) => widthFor(one.pixels, Math.random()))
    const spots = placed(
      takenOn(board),
      fresh.map((one, index) => ({
        w: widths[index],
        h: heightOf(one.pixels, widths[index]),
      })),
      around,
      Math.random
    )
    const now = Date.now()
    const images: InspirationImage[] = fresh.map((one, index) => ({
      id: one.id,
      file: one.file,
      name: one.name,
      pixels: one.pixels,
      at: spots[index],
      width: widths[index],
      group: null,
      notes: [],
      overview: null,
      added: now,
    }))
    get().change(projectId, { ...board, images: [...board.images, ...images] })
    // written at once: the agent looks at them as soon as the board says they are there
    saveNow(projectId)
    return images.length
  },

  setNotesShown(on) {
    localStorage.setItem(NOTES_KEY, on ? "on" : "off")
    set({ notesShown: on })
  },

  setFocused(id) {
    set({ focused: id })
  },
}))

/**
 * What the app's own process says of a board: which of its pictures the agent is at,
 * and, where the window has the board, what the agent has said of each, taken into it.
 * Nothing else of what it says is: the window's is the board as the user has laid it.
 */
function took(projectId: string, state: InspirationState) {
  useInspiration.setState((now) => {
    const had = now.boards[projectId]
    const said = new Map(
      state.board.images.map((image) => [image.id, image.overview])
    )
    const board = had && {
      ...had,
      images: had.images.map((image) => {
        const overview = said.get(image.id)
        return overview && overview !== image.overview
          ? { ...image, overview }
          : image
      }),
    }
    const analysing = state.analysing.length > 0 ? state.analysing : NONE
    const since = { ...now.since }
    if (analysing.length === 0) delete since[projectId]
    else since[projectId] ??= Date.now()
    return {
      ...(board && { boards: { ...now.boards, [projectId]: board } }),
      analysing: { ...now.analysing, [projectId]: analysing },
      since,
    }
  })
}

/**
 * Connect the boards to the app's own process. Call once, before the first render, with
 * where the model chosen for Codex is had from.
 */
export function connectInspiration(chosenForCodex: () => string | null) {
  codexModel = chosenForCodex
  window.cad.inspiration.onChange(took)
  window.addEventListener("pagehide", () => {
    for (const projectId of [...timers.keys()]) saveNow(projectId)
  })
}
