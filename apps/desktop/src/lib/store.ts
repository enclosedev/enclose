// Everything the window knows: the projects, their conversations, and how the model is
// being looked at.
import { create } from "zustand"

import {
  NOT_ARRANGED,
  readArrangement,
  type Arrangement,
  type Named,
} from "@/lib/arrange"
import { finishedNow, follows, stackOf, type Stack } from "@/lib/conversations"
import { asideFor, carried } from "@/lib/versions"
import { cutsOf, readCuts } from "@/lib/cuts"
import { mannerOf, savedAccess } from "@/lib/manner"
import { answering, offeredModels, updatedSaid, usable } from "@/lib/providers"
import { callingOn, notCalledOn } from "@/lib/mentions"
import { connectInspiration } from "@/lib/inspiration"
import { fitted } from "@/lib/pictures"
import { keptAsWas } from "@/lib/same"
import { usePreferences } from "@/lib/preferences"
import {
  askedAgain,
  back,
  coloured,
  forth,
  hiddenWith,
  hidingSaid,
  later,
  NO_HISTORY,
  rearranged,
  record,
  recolour,
  rehidden,
  saidOf,
  type Change,
  type History,
} from "@/lib/undo"
import { MAC } from "@/lib/platform"
import { PALETTE, type PaletteName } from "@shared/palette"
import { MOST_AT_ONCE, PICTURE_TYPES, withoutMark } from "@shared/pictures"

import {
  COMPACT,
  EFFORTS,
  PROVIDERS,
  type Access,
  type Attached,
  type Commands,
  type ConversationSummary,
  type Effort,
  type ObjectRef,
  type PartNote,
  type PartRef,
  type Project,
  type Provider,
  type Quote,
  type ProviderId,
  type ProviderSettings,
  type Seen,
  type ThreadItem,
  type Turned,
  type GitHubState,
  type Update,
  type Vec3,
} from "@shared/api"
import type { Turn } from "@/lib/orient"

/**
 * solid: as built. glass: all of it is seen through. wireframe: lines only, as far as
 * the model itself does not hide them. outline: every line, the hidden ones too.
 * pattern: as wireframe, with every face ruled into squares.
 */
export type DisplayMode =
  "solid" | "glass" | "wireframe" | "outline" | "pattern"

/** A flat cut through the model, with one side of it hidden. */
export type Section = {
  /** a point the cut passes through, model mm */
  position: Vec3
  /** how the cut is turned: the turn that carries +Z to the side that is kept */
  turn: Turn
  /** keep the other side instead */
  flipped: boolean
}

export type View = {
  mode: DisplayMode
  exploded: boolean
  /**
   * pulled apart, every part goes by itself, and not with the rest of the piece it is
   * of: what a model that is pulled apart is pulled apart into next. It is still so
   * while the model goes back together, and is not until it is pulled apart again.
   */
  alone: boolean
  /** how far apart the parts are pulled, as a multiple of the model's own distances */
  spread: number
  section: Section | null
  /** what the view is cut down to; null shows everything */
  only: Only | null
  /**
   * The parts put out of sight, by id: what was picked out when H was pressed. They are
   * not drawn, whatever else the view is cut down to, until they are brought back.
   */
  hidden: string[]
  /** whether the ground is ruled into squares, and the world's axes drawn across it */
  grid: boolean
  /**
   * Whether it is the model's blueprint that is looked at, and not the model: the sheets
   * it is drawn on, one to each side, in place of the view of it.
   */
  blueprint: boolean
  /**
   * The sheet of a blueprint that is shown by itself, with all of the view for its
   * paper: its place in the row. Null while the sheets stand in their row.
   */
  sheet: number | null
  /** whether a blueprint says how big the model is: its width, height and depth */
  dimensions: boolean
  /** and whether it says which part is which: the name of each, with a line to it */
  labels: boolean
  /**
   * Whether it is the model's assembly guides that are looked at, and not the model:
   * their covers, in a row, in place of the view of it, as a blueprint's sheets are.
   * Never with the blueprint: one or the other has the view's place.
   */
  assembly: boolean
  /**
   * The reference scene the model is set in, by what it is known by: things of a known
   * real size drawn round it, so that how big it is can be seen (see lib/reference).
   * Null while it is set in none.
   */
  reference: string | null
  /**
   * Whether the project's own tools are at work on the model: the ones made for it, to
   * move it and try it out (see lib/custom-tools). While they are, its parts are where
   * the tools have them, and not where it is built.
   */
  tools: boolean
  /**
   * They have been at work since the project was opened, by themselves, and not brought
   * up: Esc, meant for something else, does not let go of them. Once they are brought
   * up it does, as it does of whatever else the view was put into.
   */
  toolsQuiet: boolean
  /**
   * The circuit board that is looked at, by what it is known by, and not the model: PCB
   * mode, which has the view's place as a blueprint's sheets do. Never with the
   * blueprint or the guides: one of them at a time has the view's place. Null while it
   * is the model that is looked at.
   */
  board: string | null
  /** and how a board is looked at there: drawn as it is made, as its schematic, or in 3D */
  boardAs: BoardAs
  /**
   * which of its layers of copper the drawing of it as it is made is of, counted from
   * its top: 1 is the top, with everything on it; its last is the bottom, turned over
   * to be seen as it is from under the board; one between is seen from the top, with
   * the others faded
   */
  boardLayer: number
  /**
   * Whether it is the project's inspiration board that is looked at, and not the model:
   * the pictures of what the thing should be like (see components/inspiration), which
   * have the view's place as a board does in PCB mode. Never with the blueprint, the
   * guides or a board: one of them at a time has the view's place.
   */
  inspiration: boolean
}

/** The ways a circuit board is looked at, in PCB mode, in the order their buttons stand in. */
export const BOARD_AS = ["pcb", "3d", "schematic"] as const
export type BoardAs = (typeof BOARD_AS)[number]

/**
 * The key that brings up each way a board is looked at: T for the technical view, B for
 * the board in 3D, S for its schematic. (In the technical view the numbers bring up
 * its layers of copper, the top's 1.)
 */
export const BOARD_KEYS: Record<BoardAs, string> = {
  pcb: "t",
  "3d": "b",
  schematic: "s",
}

/**
 * What is picked out of the model, to be shown on its own: one part, a group of them,
 * several parts picked out together in the view, or the keep-outs, which are not parts
 * but are listed with them. What is picked out in the view, with I, is gone up to as
 * well: the camera is brought to it, and taken back when the rest is shown again.
 */
export type Only =
  | { kind: "part" | "group" | "keepouts"; id: string; near?: boolean }
  | { kind: "parts"; ids: string[]; near?: boolean }

/** Exploding starts at the model's own distances and can be pushed this much further. */
export const SPREAD = { min: 1, max: 4 }

/**
 * What the key for Explode does to the view the next time it is pressed. A model put
 * together is pulled apart, into its pieces. One that is pulled apart, and comes apart
 * again (`further`: some piece of it is of more than one part), goes from its pieces to
 * its parts and back, turn about, as far apart as it is: the key goes round the ways it
 * comes apart, and does not put it together, which is Esc's to do. A model that comes
 * apart only the one way has nothing to go round, and the key puts it together.
 */
export function exploding(view: View, further: boolean): Partial<View> {
  if (!view.exploded)
    return { exploded: true, alone: false, spread: SPREAD.min }
  if (further) return { alone: !view.alone }
  return { exploded: false }
}

/**
 * How much of what is over the view is put away (Cmd+.): the cards of the other projects,
 * or all of it. Null: none of it.
 */
export type Cleared = "others" | "all" | null

/** How wide the conversation is, px: at the least, and until its edge is dragged. */
export const THREAD_WIDTH = { min: 320, initial: 400 }
/** How much of the window's width the conversation leaves the view, at the least. */
export const VIEW_MIN = 480

/** The nearest to a width that the conversation can have in a window this wide. */
export function fitThread(width: number, windowWidth: number): number {
  const most = Math.max(THREAD_WIDTH.min, windowWidth - VIEW_MIN)
  return Math.round(Math.min(most, Math.max(THREAD_WIDTH.min, width)))
}

/**
 * A part that is picked out: or, where the part says so (`part.piece`), the piece of the
 * model it is of, picked out as one thing at that place on it. `at` is where on screen
 * it was clicked, and is what the prompt opens beside.
 */
export type Selection = { part: PartRef; at: { x: number; y: number } | null }

/** What a part that was picked out goes by: the name of its piece, if it was picked out as that. */
export const goesBy = (part: PartRef) => part.piece?.label ?? part.label
/** And the parts that are, by id: the one, or all those of its piece. */
export const allOf = (part: PartRef) => part.piece?.parts ?? [part.id]

/** Stable while no parts are picked out together, or none are hidden. */
const NONE: string[] = []

const ACTIVE_KEY = "enclose:project"
const ACCESS_KEY = "enclose:access"
const PROVIDER_KEY = "enclose:provider"
const MODEL_KEY = "enclose:model"
const EFFORT_KEY = "enclose:effort"
/**
 * What is kept of one agent is kept under its name: all but Claude Code's, which was
 * kept before there were others.
 */
const keyOf = (key: string, provider: ProviderId) =>
  provider === "claude" ? key : `${key}:${provider}`
/** Something of each agent, by agent. */
const each = <Value>(of: (provider: ProviderId) => Value) =>
  Object.fromEntries(PROVIDERS.map((id) => [id, of(id)])) as Record<
    ProviderId,
    Value
  >
const MODE_KEY = "enclose:mode"
const GRID_KEY = "enclose:grid"
const DIMENSIONS_KEY = "enclose:dimensions"
const LABELS_KEY = "enclose:labels"
const THREAD_WIDTH_KEY = "enclose:thread-width"
const CUTS_KEY = "enclose:cuts"
const FINISHED_KEY = "enclose:finished"
const COLOURS_KEY = "enclose:colours"
const ARRANGED_KEY = "enclose:arranged"
const REFERENCE_KEY = "enclose:reference"
const FIGURE_KEY = "enclose:figure"
const WAITING_KEY = "enclose:waiting"
const KEPT_MESHES_KEY = "enclose:kept-meshes"

/** What is asked of the agent when a model made of a mesh is to be built again as code. */
export const REBUILD = "Rebuild this model as an editable design."

/** What is asked of the agent when a board was changed after its Gerbers were made. */
export const REBUILD_BOARD = "Build this board again: its Gerbers are outdated."

/**
 * What is asked of the agent when a project's model is to be drawn in the app's colours
 * as they are now, by its own copy of the exporter and what its scripts name.
 */
export const RECOLOUR = "Recolor this model in the app's current colors."

/** What was saved under a key. */
const saved = (key: string) => localStorage.getItem(key)

const savedMode = (): DisplayMode => {
  const mode = saved(MODE_KEY)
  return mode === "glass" ||
    mode === "wireframe" ||
    mode === "outline" ||
    mode === "pattern"
    ? mode
    : "solid"
}
const savedThreadWidth = (): number => {
  const width = Number(saved(THREAD_WIDTH_KEY))
  return width >= THREAD_WIDTH.min ? width : THREAD_WIDTH.initial
}
const savedKeptMeshes = (): string[] => {
  try {
    const kept: unknown = JSON.parse(saved(KEPT_MESHES_KEY) ?? "[]")
    return Array.isArray(kept)
      ? kept.filter((id): id is string => typeof id === "string")
      : []
  } catch {
    return []
  }
}
/**
 * The colours given by hand, as the window kept them itself before they were kept in
 * the projects' folders: by project, and put aside for a conversation (see
 * lib/versions.ts). Read once, to be put in the folders.
 */
const savedColours = (): Record<string, Record<string, PaletteName>> => {
  try {
    const kept: unknown = JSON.parse(saved(COLOURS_KEY) ?? "{}")
    if (!kept || typeof kept !== "object") return {}
    return Object.fromEntries(
      Object.entries(kept).map(([project, parts]) => [
        project,
        Object.fromEntries(
          Object.entries((parts ?? {}) as Record<string, unknown>).filter(
            (entry): entry is [string, PaletteName] =>
              typeof entry[1] === "string" && entry[1] in PALETTE
          )
        ),
      ])
    )
  } catch {
    return {}
  }
}
/**
 * How each project's parts were put into groups by hand, as it was kept: and the names
 * Claude gave the groups that were made so.
 */
const savedArranged = (): {
  arranged: Record<string, Arrangement>
  named: Record<string, Named>
} => {
  const arranged: Record<string, Arrangement> = {}
  const named: Record<string, Named> = {}
  try {
    const kept: unknown = JSON.parse(saved(ARRANGED_KEY) ?? "{}")
    if (!kept || typeof kept !== "object") return { arranged, named }
    for (const [project, one] of Object.entries(kept)) {
      const read = readArrangement(one)
      if (read !== NOT_ARRANGED) arranged[project] = read
      const names = (one as { named?: unknown } | null)?.named
      if (names && typeof names === "object")
        named[project] = Object.fromEntries(
          Object.entries(names).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
    }
  } catch {
    // nothing kept that can be read: nothing was done by hand
  }
  return { arranged, named }
}
/** Keep how the projects' parts are arranged by hand, with the names given for it. */
function keepArranged(
  arranged: Record<string, Arrangement>,
  named: Record<string, Named>
) {
  const projects = new Set([...Object.keys(arranged), ...Object.keys(named)])
  localStorage.setItem(
    ARRANGED_KEY,
    JSON.stringify(
      Object.fromEntries(
        [...projects].map((project) => [
          project,
          {
            ...(arranged[project] ?? NOT_ARRANGED),
            named: named[project] ?? {},
          },
        ])
      )
    )
  )
}

/** The reference scene picked for each project by hand, as it was kept. */
const savedScenes = (): Record<string, string> => {
  try {
    const kept: unknown = JSON.parse(saved(REFERENCE_KEY) ?? "{}")
    if (!kept || typeof kept !== "object") return {}
    return Object.fromEntries(
      Object.entries(kept).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    )
  } catch {
    return {}
  }
}

/**
 * What was waiting to be sent when the window was last up: what was said of parts and of
 * words picked out of the conversations, the parts called on from the view, the pictures
 * put on the message boxes, and what was written in them. Whatever of it does not read
 * as that is dropped.
 */
function savedWaiting(): Pick<
  State,
  "notes" | "quotes" | "drafts" | "called" | "pictures"
> {
  const nothing = {
    notes: {},
    quotes: {},
    drafts: {},
    called: {},
    pictures: {},
  }
  try {
    const kept = JSON.parse(saved(WAITING_KEY) ?? "null") as {
      notes?: unknown
      quotes?: unknown
      drafts?: unknown
      called?: unknown
      pictures?: unknown
    } | null
    if (!kept || typeof kept !== "object") return nothing
    const notes = Object.fromEntries(
      Object.entries((kept.notes ?? {}) as Record<string, unknown>).map(
        ([project, said]) => [
          project,
          (Array.isArray(said) ? said : []).filter(
            (note: Partial<Note> | null): note is Note =>
              typeof note?.id === "string" &&
              typeof note.text === "string" &&
              typeof note.part?.id === "string" &&
              typeof note.part.label === "string" &&
              (note.at === undefined || typeof note.at === "number") &&
              (note.part.piece === undefined ||
                (typeof note.part.piece?.label === "string" &&
                  Array.isArray(note.part.piece.parts)))
          ),
        ]
      )
    )
    const quotes = Object.fromEntries(
      Object.entries((kept.quotes ?? {}) as Record<string, unknown>).map(
        ([project, said]) => [
          project,
          (Array.isArray(said) ? said : []).filter(
            (one: Partial<Quoted> | null): one is Quoted =>
              typeof one?.id === "string" &&
              typeof one.quote === "string" &&
              one.quote !== "" &&
              typeof one.text === "string" &&
              typeof one.at === "number"
          ),
        ]
      )
    )
    const drafts = Object.fromEntries(
      Object.entries((kept.drafts ?? {}) as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    )
    const called = Object.fromEntries(
      Object.entries((kept.called ?? {}) as Record<string, unknown>).map(
        ([project, parts]) => [
          project,
          (Array.isArray(parts) ? parts : []).filter(
            (part: Partial<Called> | null): part is Called =>
              typeof part?.id === "string" &&
              typeof part.label === "string" &&
              (part.parts === undefined || Array.isArray(part.parts)) &&
              (part.scene === undefined || typeof part.scene === "string") &&
              (part.at === undefined || typeof part.at === "number")
          ),
        ]
      )
    )
    const pictures = Object.fromEntries(
      Object.entries((kept.pictures ?? {}) as Record<string, unknown>).map(
        ([project, put]) => [
          project,
          (Array.isArray(put) ? put : []).filter(
            (picture: Partial<Attached> | null): picture is Attached =>
              typeof picture?.id === "string" &&
              typeof picture.name === "string" &&
              typeof picture.mimeType === "string" &&
              picture.mimeType in PICTURE_TYPES &&
              typeof picture.bytes === "number" &&
              Number.isInteger(picture.number)
          ),
        ]
      )
    )
    return { notes, quotes, drafts, called, pictures }
  } catch {
    return nothing
  }
}
const savedFinished = (): string[] => {
  try {
    const kept: unknown = JSON.parse(saved(FINISHED_KEY) ?? "[]")
    return Array.isArray(kept)
      ? kept.filter((id): id is string => typeof id === "string")
      : []
  } catch {
    return []
  }
}
/**
 * How a model is looked at when it opens: whole, assembled, in the mode last used, and
 * on the grid if that was last left on. (So with its blueprint, when that is brought up:
 * saying how big the model is, if it last did.)
 */
const homeView = (): View => ({
  mode: savedMode(),
  exploded: false,
  alone: false,
  spread: SPREAD.min,
  section: null,
  only: null,
  hidden: NONE,
  grid: saved(GRID_KEY) === "on",
  blueprint: false,
  sheet: null,
  dimensions: saved(DIMENSIONS_KEY) === "on",
  labels: saved(LABELS_KEY) === "on",
  assembly: false,
  reference: null,
  tools: false,
  toolsQuiet: false,
  board: null,
  // a board is first seen in 3D, whichever way it was looked at before
  boardAs: "3d",
  boardLayer: 1,
  inspiration: false,
})

/** What the view can be put into, and got back out of with Esc. */
export type Entered =
  | "section"
  | "explode"
  | "only"
  | "hidden"
  | "blueprint"
  | "assembly"
  | "reference"
  | "tools"
  | "board"
  | "inspiration"

/** Those of them that are on, in the order they were gone into: the last is the latest. */
function enteredNow(view: View, before: Entered[]): Entered[] {
  const on: Record<Entered, boolean> = {
    section: view.section !== null,
    explode: view.exploded,
    only: view.only !== null,
    hidden: view.hidden.length > 0,
    blueprint: view.blueprint,
    assembly: view.assembly,
    reference: view.reference !== null,
    tools: view.tools && !view.toolsQuiet,
    board: view.board !== null,
    inspiration: view.inspiration,
  }
  const still = before.filter((name) => on[name])
  const fresh = (Object.keys(on) as Entered[]).filter(
    (name) => on[name] && !still.includes(name)
  )
  return [...still, ...fresh]
}

type State = {
  ready: boolean
  projects: Project[]
  /**
   * The projects whose folders are not where they were (see Project["missing"]): on the
   * list, and in nothing else the window does, until their folders are back.
   */
  missing: Project[]
  activeId: string | null
  /**
   * The examples a project is being made of, by example: how many bytes of each have
   * been fetched so far. One that is not being made into anything is not in here.
   */
  starting: Record<string, number>
  /**
   * what has been said in the conversations that have been looked at lately, and in any
   * being answered, by conversation
   */
  items: Record<string, ThreadItem[]>
  /**
   * The conversation turned to in each project, by project: one of its conversations, or
   * a new one (null). A project not in here shows the one on its card.
   */
  picked: Record<string, string | null>
  /**
   * The conversations Claude has got to the end of a turn in without anyone seeing it:
   * what a card says "Done" of, until it is looked at.
   */
  finished: string[]
  threadOpen: boolean
  /** how wide the conversation was dragged to, px; a narrow window may show it narrower */
  threadWidth: number
  /** whether the list of parts is up */
  partsOpen: boolean
  /** whether the list of reference scenes is up, in the place the list of parts has */
  referenceOpen: boolean
  /**
   * Whether the panel of the project's own tools is up, in the place the list of parts
   * has. Put away, the tools are still at work on the model until they are left.
   */
  toolsOpen: boolean
  /** whether the list of the project's circuit boards is up, in the place the list of parts has */
  boardsOpen: boolean
  /** whether the list of what is on the board in PCB mode is up, in the same place */
  boardPartsOpen: boolean
  /**
   * The parts of the board in PCB mode that the camera is to be brought to, by the
   * names they have on it (C1, U1), and when that was asked: null once it is done.
   */
  boardFocus: { names: string[]; at: number } | null
  /** the parts of the board whose square in the list of them the pointer is over */
  boardHover: string[] | null
  /**
   * The part of the board in PCB mode that was clicked in 3D: what it is called on the
   * board, and the place on it that was clicked, in the view's own frame. Null for none.
   */
  boardPicked: { name: string; at: Vec3 } | null
  /**
   * What is being said of that part, where it is: something new ("new"), or what was
   * said of it already (that note's id). Null while nothing is.
   */
  boardWriting: string | null
  /**
   * The reference scene the user has picked for each project from that list, by what
   * the scene is known by: the one the project's model is set in from then on.
   */
  sceneOf: Record<string, string>
  /**
   * Whether the figure of a person is shown in a reference scene that has one to show:
   * not until it is asked for, and from then on in whatever project is open.
   */
  figure: boolean
  /** whether the settings are over the window */
  settingsOpen: boolean
  /**
   * How much of what is over the view has been put away, a step at a time (Cmd+.): the
   * cards of the other projects, with the button that adds one, so that the open
   * project's card is all there is of them; or all of it, so that the view has the
   * window to itself: the cards, with what is at their foot, and the buttons down its
   * right. The conversation is not the view's, and stays as it is.
   */
  cleared: Cleared
  /** where the app is with a newer version of itself, as the app last said */
  update: Update
  /** GitHub, as projects are backed up to it, and how far backing them all up has got */
  github: GitHubState
  access: Access
  /** the agents there are, once the app has said: Claude Code, Codex, Grok */
  providers: Provider[]
  /** whose agent a conversation is begun with: one carried on keeps the one it has */
  provider: ProviderId
  /** the model picked of each agent's, as it knows it; null leaves it to the agent */
  model: Record<ProviderId, string | null>
  /** how hard each is to think; null leaves that to the agent too */
  effort: Record<ProviderId, Effort | null>
  /** what Claude Code can be called on for in each project's folder, once it has said */
  commands: Record<string, Commands>
  view: View
  /** the cut each project was last left with: where cutting it open again starts from */
  cuts: Record<string, Section>
  /** what the view has been put into, latest last: Esc leaves that one */
  entered: Entered[]
  selection: Selection | null
  /**
   * The parts picked out together, by id: with a box drawn across the view, or one after
   * another with Shift held. While there are any, no one part is picked out with a click
   * (`selection`), and a hint of them shows through whatever of the model is in front.
   */
  several: string[]
  /**
   * The parts a box being drawn across the view takes in so far, by id; null while no
   * box is being drawn. While one is, they are solid and all the rest see-through.
   */
  sweep: string[] | null
  /** the part under the pointer, in the view or in the parts list */
  hoveredId: string | null
  /**
   * A part is being looked for by name, in a message. The view shows where it is: all
   * of the model goes see-through but the part the list is on, which is `hoveredId`.
   */
  seeking: boolean
  /**
   * Parts and groups are being looked for by name, in the view: this is the name, as far
   * as it has been typed. The view shows what goes by it, lit up, through all the rest,
   * which goes see-through. Null while nothing is looked for. Nothing is picked out
   * meanwhile: looking begins by letting go of what was, and picking something ends it.
   */
  finding: string | null
  /**
   * The part picked out is shown in its own colour and not the selection's: a colour is
   * being chosen for it, or has just been, and is to be seen.
   */
  plain: boolean
  /**
   * What is being written of the part picked out, in the view beside it: a new note
   * ("new"), or one already made that is being changed (its id). Null when nothing is.
   */
  writing: string | null
  /**
   * What has been said of parts of each project's model and not yet sent: it goes with
   * the next message, and until then shows on the message box and on the parts.
   */
  notes: Record<string, Note[]>
  /**
   * What has been said of words picked out of each project's conversations and not yet
   * sent: it goes with the next message, and until then shows on the message box.
   */
  quotes: Record<string, Quoted[]>
  /**
   * The words picked out of the conversation that something is being said of, in a box
   * beside them: words just picked out (`id` null), or some already kept, where what was
   * said of them is being changed. Null when nothing is.
   */
  quoting: { id: string | null; quote: string } | null
  /**
   * The note just made, or the quote, by its id: its chip on the message box shimmers
   * for a moment, so that where it has gone is seen. Null once it has, and when none was
   * made.
   */
  noted: string | null
  /** what is written in each project's message box so far */
  drafts: Record<string, string>
  /**
   * The parts called on from the view for each project's next message, and the whole
   * objects. A part goes with the message by name, as if written in it with @, and an
   * object goes as one thing, with which parts it is. Until then each shows as a chip on
   * the message box.
   */
  called: Record<string, Called[]>
  /**
   * The pictures put on each project's message box, to go with its next message: a
   * photo of the thing to make, a sketch, a drawing. The app keeps each from when it is
   * put there. Until the message is sent each shows on the box.
   */
  pictures: Record<string, Attached[]>
  /** why a picture just put on a message was not taken, in a line; null when all were */
  pictureTrouble: string | null
  /**
   * The colour the user has given a part, by project and part: one of the app's own, by
   * name. It is how the app draws the part, whatever the model says of its colour. Kept
   * in the project's folder (see shared/colours-format.ts), and taken up from there
   * where it is found changed (see coloursOf).
   */
  colours: Record<string, Record<string, PaletteName>>
  /**
   * Whether the model on screen has parts made of a mesh (an STL or OBJ file), by
   * project, as the view last loaded it: what is offered to be built again as code.
   */
  meshes: Record<string, boolean>
  /** the projects whose user would rather keep the mesh: it is not offered again */
  keptMeshes: string[]
  /**
   * How the user has put each project's parts into groups by hand, over what its model
   * says: groups made, parts taken out of theirs, groups called something else.
   */
  arranged: Record<string, Arrangement>
  /** The names Claude has given groups that were made by hand, by project and group. */
  named: Record<string, Named>
  /** The groups made by hand that Claude is thinking of a name for, by id. */
  naming: string[]
  /**
   * What has been done by hand to each project's model, and can be taken back with
   * Cmd+Z: the colours given to its parts, how they are put into groups, and which are
   * out of sight. Kept for as long as the window is up.
   */
  history: Record<string, History>
  /**
   * The parts that went out of sight the last time some were put out of sight: what Esc
   * brings back by itself, before all the rest. None once it has, and in a project just
   * opened.
   */
  hidLast: string[]
  /**
   * What the app has to say of something just done that would otherwise go unsaid: what
   * Cmd+Z took back, or why it could not. It is shown at the foot of the view for a
   * moment, or as long as `ms` says. `key` tells one such thing from the next.
   */
  saying: { text: string; key: number; ms?: number } | null
  /** bumps to ask the viewport to return to its home view */
  homeRequests: number
  /** bumps to ask the message box to take the typing, after what is written in it */
  writeRequests: number

  activate(id: string): void
  /**
   * Turn to one of a project's conversations, or to a new one (null): the project is
   * opened, and the conversation panel with it.
   */
  openConversation(projectId: string, conversationId: string | null): void
  /**
   * Fetch what has been said in a conversation, the first time it is looked at, or the
   * first since it was let go of (see forget).
   */
  load(projectId: string, conversationId: string): void
  /**
   * Pick CAD files or a folder to open (or the one kind, where the picker cannot offer
   * both); true if a project came of it.
   */
  addProject(kind?: "file" | "folder"): Promise<boolean>
  /** Open what was dropped on the window, and turn to the project that came of it. */
  openPaths(paths: string[]): Promise<void>
  /** Make a new project's folder where new projects go, and open it. */
  createProject(): Promise<void>
  /** Make a project of one of the app's examples, fetching it first, and open it. */
  startExample(id: string): Promise<void>
  removeProject(id: string): Promise<void>
  setView(patch: Partial<View>): void
  /**
   * Cut the model open: the way it was last left cut, where that still `fits`; or, if it
   * never was, or that does not, the way `fresh` gives.
   */
  cutOpen(fresh: () => Section, fits?: (cut: Section) => boolean): void
  goHome(): void
  select(selection: Selection | null): void
  /** Pick parts out together, in place of whatever was picked out; or none, with none. */
  selectSeveral(partIds: string[]): void
  sweepOver(partIds: string[] | null): void
  hover(partId: string | null): void
  seek(seeking: boolean): void
  /** Look for parts and groups by this name, as far as it is typed; or (null) stop looking. */
  find(name: string | null): void
  showPlain(plain: boolean): void
  /**
   * Start writing of the part picked out ("new"), go back to a note already made (its
   * id), or stop writing (null).
   */
  write(note: string | null): void
  /**
   * Keep what was written: as a new note of the part picked out, or as what the note
   * being changed now says. Gives back the note's id, or null if there was nothing to keep.
   */
  keepNote(text: string): string | null
  dropNote(id: string): void
  /**
   * Start saying something of words picked out of the conversation, go back to what was
   * said of some already kept (their id), or stop (null).
   */
  quote(of: { quote: string } | { id: string } | null): void
  /**
   * Keep the words being quoted for the next message, with what was written of them,
   * which may be nothing: or, of some already kept, what is now said of them. Gives back
   * the quote's id, or null if nothing was being quoted.
   */
  keepQuote(text: string): string | null
  dropQuote(id: string): void
  setDraft(text: string): void
  /**
   * Call on parts and whole objects for the open project's next message, those of them
   * it does not name already, and bring the message up to be written in.
   */
  callOn(parts: Called[]): void
  dropCalled(id: string): void
  /**
   * Put pictures with the open project's next message: those of the files that are
   * pictures, each made no bigger than an agent takes. Resolves to the ones that were
   * put there. `bringUp` brings the message up to be written in as well.
   */
  attach(files: Blob[], bringUp?: boolean): Promise<Attached[]>
  /** Take a picture back off the message, and out of what is written in it. */
  dropPicture(id: string): void
  /** Give parts of the open project a colour of the app's, or (null) the model's own back. */
  setColour(partIds: string[], colour: PaletteName | null): void
  /**
   * Put the open project's parts into groups another way, as worked out from how they
   * are arranged now (see lib/arrange). `said` is what was done, as Cmd+Z will say it:
   * "a grouping".
   */
  rearrange(next: Arrangement, said: string): void
  /** Have a group made by hand shown as being named, or no longer. */
  setNaming(groupId: string, on: boolean): void
  /** The name Claude has come up with for a group that was made by hand. */
  nameGroup(projectId: string, groupId: string, name: string): void
  /**
   * Put these parts of the open project's model out of sight, and bring back the rest,
   * by hand: kept, so that Cmd+Z can take it back.
   */
  setHidden(hidden: string[]): void
  /**
   * Take back the last thing done to the open project's model: a colour given by hand,
   * the parts put into groups another way or out of sight, or what an agent did to its
   * files in a turn, whichever was later. A turn is taken back only at a second press
   * soon after the first, which says so: by then it is no habit of the hand's.
   */
  undo(): Promise<void>
  /** Put back what was last taken back. */
  redo(): Promise<void>
  /** Something else was done since a first Cmd+Z: a second one asks again. */
  letUndoGo(): void
  say(text: string, ms?: number): void
  setThreadOpen(open: boolean): void
  setThreadWidth(width: number): void
  setPartsOpen(open: boolean): void
  setReferenceOpen(open: boolean): void
  /** Bring the project's own tools up, which sets them to work on the model; or put them away. */
  setToolsOpen(open: boolean): void
  setBoardsOpen(open: boolean): void
  setBoardPartsOpen(open: boolean): void
  /** Bring the camera to these parts of the board in PCB mode, seen in 3D for it. */
  focusBoardParts(names: string[]): void
  /** The camera has been brought to the parts it was asked to be. */
  focusedBoardParts(): void
  hoverBoardParts(names: string[] | null): void
  pickBoardPart(picked: { name: string; at: Vec3 } | null): void
  /**
   * Start saying something of the part of the board picked out ("new"), go back to what
   * was said of one already (its note's id: the board is gone to, and the part picked
   * out again), or stop (null).
   */
  writeBoard(note: string | null): void
  /**
   * Keep what was written of the part of the board picked out, as `keepNote` keeps what
   * is said of a part of the model: `label` is what the part goes by. Gives back the
   * note's id, or null if there was nothing to keep.
   */
  keepBoardNote(text: string, label: string): string | null
  /**
   * Set the open project's model in a reference scene picked by hand, which is kept as
   * the one for that project.
   */
  pickScene(sceneId: string): void
  setFigure(shown: boolean): void
  setSettingsOpen(open: boolean): void
  /** Cmd+.: put away one more step of what is over the view, and after all of it, none. */
  clearView(): void
  /**
   * What Esc does: stop looking for parts by name, if they are being looked for; put the
   * parts list away, if it is up, or the list of reference scenes, the project's tools
   * or its boards; then get out of PCB mode, or the guides; and otherwise get out of
   * the last thing gone into, the blueprint, a reference scene and the tools' hold on
   * the model among them.
   * False if there was nothing to do.
   */
  leave(): boolean
  setAccess(access: Access): void
  setProvider(provider: ProviderId): void
  setModel(provider: ProviderId, model: string | null): void
  setEffort(provider: ProviderId, effort: Effort | null): void
  /** Send what is in the open project's message box, with what has been said of its parts. */
  send(): void
  /**
   * Have the conversation open in the active project compacted: its agent sums up what
   * was said so far, to make room. Waits its turn there as a message would.
   */
  compact(): void
  /**
   * Have Claude look over a project's model, of files just opened, from what the view
   * shows of it: answered the way a message would be, as far as that is chosen.
   */
  lookOver(projectId: string, seen: Seen): Promise<void>
  /** Say whether the model the view has loaded of a project has parts made of a mesh. */
  setMeshes(projectId: string, any: boolean): void
  /**
   * Have the agent build a model made of a mesh again, as code whose sizes can be
   * changed: asked in the conversation the panel shows, the way a message would be.
   */
  rebuild(projectId: string): void
  /**
   * Have the agent build one of a project's circuit boards again, changed since it was
   * last built, for its Gerbers to be of it as it is: asked about that board, in the
   * conversation the panel shows, the way a message would be.
   */
  rebuildBoard(projectId: string, board: string): void
  /**
   * Have the agent bring a project's model to the app's colours as they are now (see
   * `RECOLOUR`): the project is opened, and it is asked in the conversation its panel
   * shows, the way a message would be.
   */
  recolour(projectId: string): void
  /** Keep a project's mesh as it is: building it again is not offered for it any more. */
  keepMesh(projectId: string): void
  /**
   * Have an assembly guide made for the open project: of all of its model, or of the
   * one thing picked out of it. It is asked in the conversation the panel shows, the
   * way a message would be, and answered so.
   */
  assemble(of: ObjectRef | null): void
}

/** How many things the app has had to say: what tells one from the next. */
let said = 0
/** What Claude did is being taken back, or put back: one at a time. */
let turning = false
/**
 * A first Cmd+Z, where it would take back a turn: of which project, the turn by when it
 * was done, until when a second press takes it back, and what was said of it.
 */
let asked: {
  projectId: string
  at: number
  until: number
  said: number
} | null = null
/** How long a second Cmd+Z has, after the first, to take back a turn, ms. */
const AGAIN_MS = 4000
/** When a part picked out, shown in its own colour for a change to be seen, is to stop being. */
let seen: ReturnType<typeof setTimeout> | undefined
/** How long that is, ms: as long as a colour just given is seen for. */
const SEEN_FOR_MS = 1400

/**
 * Put some of a project's parts to the colours a change has for them, and keep what has
 * been done to it as it now stands. `shown`: let the change be seen on a part that is
 * picked out, which is drawn in the selection's colour and would not show it.
 */
function repaint(
  projectId: string,
  had: Record<string, PaletteName | null>,
  history: History,
  shown = false
) {
  const state = useStore.getState()
  const colours = {
    ...state.colours,
    [projectId]: coloured(state.colours[projectId] ?? {}, had),
  }
  void window.cad.colours.save(projectId, colours[projectId])
  useStore.setState({
    colours,
    history: { ...state.history, [projectId]: history },
  })
  const { selection } = state
  if (!shown || !selection) return
  if (!allOf(selection.part).some((id) => id in had)) return
  state.showPlain(true)
  clearTimeout(seen)
  seen = setTimeout(() => useStore.getState().showPlain(false), SEEN_FOR_MS)
}

/**
 * Have a project's parts in groups as an arrangement says, and keep what has been done
 * to the project as it now stands.
 */
function regroup(projectId: string, next: Arrangement, history: History) {
  const state = useStore.getState()
  const arranged = { ...state.arranged, [projectId]: next }
  keepArranged(arranged, state.named)
  useStore.setState({
    arranged,
    history: { ...state.history, [projectId]: history },
  })
}

/** Have what Claude last did to a project's files taken back, or put back, and say what came of it. */
async function turnBack(projectId: string, way: "undo" | "redo") {
  turning = true
  try {
    const saying = saidOf(way, await window.cad.changes[way](projectId), MAC)
    if (saying) useStore.getState().say(saying)
  } catch {
    useStore
      .getState()
      .say(`It could not be ${way === "undo" ? "undone" : "redone"}`)
  } finally {
    turning = false
  }
}

/**
 * Put a project's model as it was on one side of something done to it by hand, which
 * has been taken back (`undo`) or put back, and say so.
 */
function byHand(
  projectId: string,
  change: Change,
  history: History,
  way: "undo" | "redo"
) {
  const state = useStore.getState()
  const did = way === "undo" ? "Undid" : "Redid"
  if (change.kind === "colour") {
    repaint(
      projectId,
      way === "undo" ? change.before : change.after,
      history,
      true
    )
    state.say(`${did} a colour`)
  } else if (change.kind === "arrangement") {
    regroup(projectId, way === "undo" ? change.before : change.after, history)
    state.say(`${did} ${change.said}`)
  } else {
    // (what is out of sight is the view's, which is the open project's)
    const hidden = hiddenWith(state.view.hidden, change, way === "undo")
    state.setView({ hidden: hidden.length > 0 ? hidden : NONE })
    useStore.setState({ history: { ...state.history, [projectId]: history } })
    state.say(`${did} ${hidingSaid(change)}`)
  }
}

/**
 * Something said of a part, waiting to be sent: the part and point, and the words. And
 * when it was said, which is where its chip goes among the others: the last comes first.
 */
export type Note = PartNote & { id: string; at?: number }

/**
 * Words picked out of a conversation, waiting to be sent with what is said of them: and
 * when they were picked out, which is where their chip goes among the others.
 */
export type Quoted = Quote & { id: string; at: number }

/**
 * Something called on from the view for the next message: what it goes by, and is shown
 * as. A part, by its id; or a whole object, which has `parts`, the ids of all it is made
 * of, and an id made up for it; or the reference scene the model is set in, which has
 * `scene`, what that scene is known by, and makes the message one about the scene.
 */
export type Called = {
  id: string
  label: string
  parts?: string[]
  scene?: string
  /** when it was called on, as a note has when it was said */
  at?: number
}

/** A part called on by name, and not a whole object or the reference scene. */
const byName = (called: Called) =>
  called.parts === undefined && called.scene === undefined

/** The reference scene the model is set in, as something to call on. */
export const calledScene = (sceneId: string): Called => ({
  id: "reference-scene",
  label: "Reference scene",
  scene: sceneId,
})

/** A whole object as something to call on. Its parts are no other object's: one of them tells it apart. */
export const calledAs = (object: ObjectRef): Called => ({
  id: `object:${object.parts[0]}`,
  label: object.label,
  parts: object.parts,
})

/** The conversations whose items have been asked for, so that none is asked for twice. */
const fetched = new Set<string>()
/** The conversations whose items were last asked for, the latest first. */
const lately: string[] = []
/**
 * How many conversations' items are kept, of those looked at lately: more than these
 * (beside the one in front of the user, and any being answered) are let go of, and asked
 * for again if they are turned to again.
 */
const ITEMS_KEPT = 4

/**
 * Let go of the items of conversations not looked at lately: not the one in front of the
 * user, nor one being answered, nor any of the last few asked for.
 */
function forget() {
  const { items, projects } = useStore.getState()
  const kept = new Set(lately.slice(0, ITEMS_KEPT))
  const open = inView()
  if (open) kept.add(open)
  for (const project of projects)
    for (const conversation of project.conversations)
      if (conversation.status !== "idle") kept.add(conversation.id)
  for (const id of fetched) if (!kept.has(id)) fetched.delete(id)
  const gone = Object.keys(items).filter((id) => !kept.has(id))
  if (gone.length === 0) return
  const left = { ...items }
  for (const id of gone) delete left[id]
  useStore.setState({ items: left })
}

/** How long a cut is left to settle before it is kept, ms: dragged, it changes at every move. */
const CUTS_SETTLE_MS = 400
/** The cuts to be kept, once they have settled; null once they have been. */
let cutsDue: Record<string, Section> | null = null
let cutsTimer: ReturnType<typeof setTimeout> | undefined

/** Keep the cuts, for the next time each project is cut open, once they have settled. */
function keepCuts(cuts: Record<string, Section>) {
  cutsDue = cuts
  clearTimeout(cutsTimer)
  cutsTimer = setTimeout(cutsSettled, CUTS_SETTLE_MS)
}

/** Keep the cuts waiting to be, now. */
function cutsSettled() {
  clearTimeout(cutsTimer)
  if (cutsDue) localStorage.setItem(CUTS_KEY, JSON.stringify(cutsDue))
  cutsDue = null
}

export const useStore = create<State>()((set, get) => ({
  ready: false,
  projects: [],
  missing: [],
  activeId: null,
  starting: {},
  items: {},
  picked: {},
  finished: savedFinished(),
  threadOpen: false,
  threadWidth: savedThreadWidth(),
  partsOpen: false,
  referenceOpen: false,
  toolsOpen: false,
  boardsOpen: false,
  boardPartsOpen: false,
  boardFocus: null,
  boardHover: null,
  boardPicked: null,
  boardWriting: null,
  sceneOf: savedScenes(),
  figure: saved(FIGURE_KEY) === "shown",
  settingsOpen: false,
  cleared: null,
  update: { state: "none" },
  github: {
    connection: { state: "unavailable" },
    backingUp: null,
    failures: [],
  },
  access: savedAccess(saved(ACCESS_KEY)),
  providers: [],
  provider: PROVIDERS.find((one) => one === saved(PROVIDER_KEY)) ?? "claude",
  model: each((id) => saved(keyOf(MODEL_KEY, id)) || null),
  effort: each(
    (id) =>
      EFFORTS.find((effort) => effort === saved(keyOf(EFFORT_KEY, id))) ?? null
  ),
  commands: {},
  view: homeView(),
  cuts: readCuts(saved(CUTS_KEY)),
  entered: [],
  selection: null,
  several: NONE,
  sweep: null,
  hoveredId: null,
  seeking: false,
  finding: null,
  plain: false,
  writing: null,
  ...savedWaiting(),
  quoting: null,
  noted: null,
  pictureTrouble: null,
  // (from the projects' folders, as the projects come: see coloursOf)
  colours: {},
  meshes: {},
  keptMeshes: savedKeptMeshes(),
  ...savedArranged(),
  naming: NONE,
  history: {},
  hidLast: NONE,
  saying: null,
  homeRequests: 0,
  writeRequests: 0,

  activate(id) {
    if (get().activeId === id) return
    localStorage.setItem(ACTIVE_KEY, id)
    set((state) => ({
      activeId: id,
      selection: null,
      several: NONE,
      sweep: null,
      hoveredId: null,
      finding: null,
      writing: null,
      quoting: null,
      // (the tools are the project's own: another's are not up until asked for, and
      // its boards likewise)
      toolsOpen: false,
      boardsOpen: false,
      boardPartsOpen: false,
      boardFocus: null,
      boardHover: null,
      boardPicked: null,
      boardWriting: null,
      view: homeView(),
      entered: enteredNow(homeView(), state.entered),
      hidLast: NONE,
    }))
  },

  openConversation(projectId, conversationId) {
    get().activate(projectId)
    set((state) => ({
      picked: { ...state.picked, [projectId]: conversationId },
      threadOpen: true,
    }))
  },

  load(projectId, conversationId) {
    const at = lately.indexOf(conversationId)
    if (at >= 0) lately.splice(at, 1)
    lately.unshift(conversationId)
    lately.length = Math.min(lately.length, ITEMS_KEPT)
    forget()
    if (fetched.has(conversationId)) return
    fetched.add(conversationId)
    void window.cad.thread.items(projectId, conversationId).then((items) => {
      // (let go of again while they were on their way)
      if (!fetched.has(conversationId)) return
      set((state) => ({ items: { ...state.items, [conversationId]: items } }))
    })
  },

  async addProject(kind) {
    const project = await window.cad.projects.add(kind)
    if (project) get().activate(project.id)
    return project !== null
  },

  async openPaths(paths) {
    if (paths.length === 0) return
    const project = await window.cad.projects.open(paths)
    if (project) get().activate(project.id)
  },

  async createProject() {
    const project = await window.cad.projects.create()
    get().activate(project.id)
  },

  async startExample(id) {
    if (id in get().starting) return
    set({ starting: { ...get().starting, [id]: 0 } })
    const project = await window.cad.projects.example(id).catch(() => null)
    const starting = { ...get().starting }
    delete starting[id]
    set({ starting })
    if (project) get().activate(project.id)
  },

  async removeProject(id) {
    await window.cad.projects.remove(id)
  },

  setView(patch) {
    if (patch.mode) localStorage.setItem(MODE_KEY, patch.mode)
    if (patch.grid !== undefined)
      localStorage.setItem(GRID_KEY, patch.grid ? "on" : "off")
    if (patch.dimensions !== undefined)
      localStorage.setItem(DIMENSIONS_KEY, patch.dimensions ? "on" : "off")
    if (patch.labels !== undefined)
      localStorage.setItem(LABELS_KEY, patch.labels ? "on" : "off")
    const { activeId, cuts } = get()
    const kept =
      patch.section && activeId ? { ...cuts, [activeId]: patch.section } : cuts
    if (kept !== cuts) keepCuts(kept)
    const before = get().entered
    set((state) => {
      const view = { ...state.view, ...patch }
      // the blueprint, the guides, a board and the inspiration board have the view's
      // place by turns: gone into, one puts the others away
      if (patch.assembly) {
        view.blueprint = false
        view.board = null
        view.inspiration = false
      } else if (patch.blueprint) {
        view.assembly = false
        view.board = null
        view.inspiration = false
      } else if (patch.inspiration) {
        view.blueprint = false
        view.assembly = false
        view.board = null
      } else if (patch.board) {
        view.blueprint = false
        view.assembly = false
        view.inspiration = false
        if (patch.board !== state.view.board) {
          view.boardAs = patch.boardAs ?? "3d"
          view.boardLayer = patch.boardLayer ?? 1
        }
      }
      if (!view.blueprint) view.sheet = null
      return {
        view,
        cuts: kept,
        entered: enteredNow(view, state.entered),
        ...(view.board !== state.view.board && {
          boardPartsOpen: false,
          boardFocus: null,
          boardHover: null,
          boardPicked: null,
          boardWriting: null,
        }),
        ...(view.sheet !== null &&
          state.view.sheet === null && { partsOpen: false }),
        ...(patch.blueprint &&
          !state.view.blueprint && {
            referenceOpen: false,
            toolsOpen: false,
            selection: null,
            several: NONE,
            sweep: null,
            hoveredId: null,
            writing: null,
          }),
        // What is picked out is kept: a guide can be asked for of that alone.
        ...(view.assembly &&
          !state.view.assembly && {
            partsOpen: false,
            referenceOpen: false,
            toolsOpen: false,
            finding: null,
            sweep: null,
            hoveredId: null,
            writing: null,
          }),
        // A board is no view of the model at all, nor is the inspiration board.
        ...(((view.board !== null && state.view.board === null) ||
          (view.inspiration && !state.view.inspiration)) && {
          partsOpen: false,
          referenceOpen: false,
          toolsOpen: false,
          boardsOpen: false,
          finding: null,
          selection: null,
          several: NONE,
          sweep: null,
          hoveredId: null,
          writing: null,
        }),
      }
    })
    for (const name of get().entered)
      if (!before.includes(name)) window.cad.analytics.used(name)
  },

  cutOpen(fresh, fits) {
    const { activeId, cuts, setView } = get()
    const kept = activeId ? cuts[activeId] : undefined
    setView({ section: kept && (!fits || fits(kept)) ? kept : fresh() })
  },

  goHome() {
    set((state) => ({ homeRequests: state.homeRequests + 1 }))
  },

  select(selection) {
    set({
      selection,
      several: NONE,
      writing: null,
      ...(selection && { finding: null }),
    })
  },

  selectSeveral(partIds) {
    set({
      selection: null,
      several: partIds.length > 0 ? partIds : NONE,
      writing: null,
      ...(partIds.length > 0 && { finding: null }),
    })
  },

  sweepOver(sweep) {
    set({ sweep })
  },

  hover(hoveredId) {
    if (get().hoveredId !== hoveredId) set({ hoveredId })
  },

  seek(seeking) {
    if (get().seeking !== seeking) set({ seeking })
  },

  find(finding) {
    const was = get().finding
    if (was === finding) return
    // looking begins with nothing picked out: what is lit up is what is found
    if (was === null)
      set({ finding, selection: null, several: NONE, writing: null })
    else set({ finding })
  },

  showPlain(plain) {
    if (get().plain !== plain) set({ plain })
  },

  write(note) {
    const { activeId, notes, selection } = get()
    if (note === null || note === "new") {
      set({ writing: selection ? note : null })
      return
    }
    const made = (activeId ? notes[activeId] : undefined)?.find(
      (one) => one.id === note
    )
    if (made)
      set({
        selection: { part: made.part, at: null },
        several: NONE,
        writing: note,
        finding: null,
      })
  },

  keepNote(text) {
    const { activeId, notes, selection, writing } = get()
    const said = text.trim()
    if (!activeId || !selection || writing === null) return null
    const before = notes[activeId] ?? []
    const at = Date.now()
    const id = writing === "new" ? `note-${at}-${before.length}` : writing
    const next =
      writing === "new"
        ? said
          ? [...before, { id, part: selection.part, text: said, at }]
          : before
        : // one left with nothing in it is taken back
          before.flatMap((note) =>
            note.id !== id ? [note] : said ? [{ ...note, text: said }] : []
          )
    set({
      notes: { ...notes, [activeId]: next },
      writing: null,
      // a new one is pointed out on the message box; one changed was there already
      ...(writing === "new" && said !== "" && { noted: id }),
    })
    return said ? id : null
  },

  dropNote(id) {
    const { activeId, notes, writing } = get()
    if (!activeId) return
    set({
      notes: {
        ...notes,
        [activeId]: (notes[activeId] ?? []).filter((note) => note.id !== id),
      },
      writing: writing === id ? null : writing,
    })
  },

  quote(of) {
    const { activeId, quotes } = get()
    if (of === null) return set({ quoting: null })
    if ("quote" in of)
      return set({ quoting: of.quote ? { id: null, quote: of.quote } : null })
    const kept = (activeId ? quotes[activeId] : undefined)?.find(
      (one) => one.id === of.id
    )
    if (kept) set({ quoting: { id: kept.id, quote: kept.quote } })
  },

  keepQuote(text) {
    const { activeId, quotes, quoting } = get()
    if (!activeId || !quoting) return null
    const said = text.trim()
    const before = quotes[activeId] ?? []
    const at = Date.now()
    const id = quoting.id ?? `quote-${at}-${before.length}`
    set((state) => ({
      quotes: {
        ...quotes,
        [activeId]:
          quoting.id === null
            ? [...before, { id, quote: quoting.quote, text: said, at }]
            : // (words can be quoted with nothing said of them: they are still kept)
              before.map((one) =>
                one.id === id ? { ...one, text: said } : one
              ),
      },
      quoting: null,
      ...(quoting.id === null && {
        noted: id,
        writeRequests: state.writeRequests + 1,
      }),
    }))
    return id
  },

  dropQuote(id) {
    const { activeId, quotes, quoting } = get()
    if (!activeId) return
    set({
      quotes: {
        ...quotes,
        [activeId]: (quotes[activeId] ?? []).filter((one) => one.id !== id),
      },
      quoting: quoting?.id === id ? null : quoting,
    })
  },

  setDraft(text) {
    const { activeId, drafts } = get()
    if (activeId) set({ drafts: { ...drafts, [activeId]: text } })
  },

  callOn(parts) {
    const { activeId, called, drafts } = get()
    if (!activeId) return
    const before = called[activeId] ?? []
    // not those the message names as it is, in its own words or by a chip: an object
    // is named only by its chip, and so is the reference scene
    const unnamed = notCalledOn(
      drafts[activeId] ?? "",
      parts.filter(byName).map((part) => part.id)
    )
    const fresh = parts.filter(
      (part) =>
        (!byName(part) || unnamed.includes(part.id)) &&
        // (the scene called on is whichever was last: one that was is called on afresh)
        !before.some(
          (other) => other.id === part.id && other.scene === part.scene
        )
    )
    const kept = before.filter(
      (other) => !fresh.some((part) => part.id === other.id)
    )
    const at = Date.now()
    set((state) => ({
      called:
        fresh.length > 0
          ? {
              ...called,
              [activeId]: [...kept, ...fresh.map((part) => ({ ...part, at }))],
            }
          : called,
      threadOpen: true,
      writeRequests: state.writeRequests + 1,
    }))
  },

  dropCalled(id) {
    const { activeId, called } = get()
    if (!activeId) return
    set({
      called: {
        ...called,
        [activeId]: (called[activeId] ?? []).filter((part) => part.id !== id),
      },
    })
  },

  async attach(files, bringUp = false) {
    const projectId = get().activeId
    if (!projectId) return []
    const added: Attached[] = []
    let trouble: string | null = null
    for (const file of files) {
      if ((get().pictures[projectId] ?? []).length >= MOST_AT_ONCE) {
        trouble = `A message takes ${MOST_AT_ONCE} images at most.`
        break
      }
      const fit = await fitted(file)
      const kept =
        fit &&
        (await window.cad.pictures.add(projectId, {
          name: file instanceof File && file.name ? file.name : "image",
          path:
            (file instanceof File && window.cad.projects.pathOf(file)) ||
            undefined,
          ...fit,
        }))
      if (!kept) {
        trouble = "That image could not be read."
        continue
      }
      set((state) => {
        const before = state.pictures[projectId] ?? []
        // counted on from the last of them: no two on a message are called the same
        const picture = {
          ...kept,
          number: Math.max(0, ...before.map((one) => one.number)) + 1,
        }
        added.push(picture)
        return {
          pictures: { ...state.pictures, [projectId]: [...before, picture] },
        }
      })
    }
    set((state) => ({
      pictureTrouble: trouble,
      ...(bringUp && added.length > 0
        ? { threadOpen: true, writeRequests: state.writeRequests + 1 }
        : {}),
    }))
    return added
  },

  dropPicture(id) {
    const { activeId, pictures, drafts } = get()
    if (!activeId) return
    const picture = (pictures[activeId] ?? []).find((one) => one.id === id)
    if (!picture) return
    set({
      pictures: {
        ...pictures,
        [activeId]: (pictures[activeId] ?? []).filter((one) => one.id !== id),
      },
      drafts: {
        ...drafts,
        [activeId]: withoutMark(drafts[activeId] ?? "", picture.number),
      },
      pictureTrouble: null,
    })
    // it went with no message: the app has no more use for its copy
    void window.cad.pictures.drop(activeId, id)
  },

  setColour(partIds, colour) {
    const { activeId, colours, history } = get()
    if (!activeId) return
    const change = recolour(
      colours[activeId] ?? {},
      partIds,
      colour,
      Date.now()
    )
    if (!change) return
    repaint(
      activeId,
      change.after,
      record(history[activeId] ?? NO_HISTORY, change)
    )
  },

  rearrange(next, said) {
    const { activeId, arranged, history } = get()
    if (!activeId) return
    const before = arranged[activeId] ?? NOT_ARRANGED
    regroup(
      activeId,
      next,
      record(
        history[activeId] ?? NO_HISTORY,
        rearranged(before, next, said, Date.now())
      )
    )
  },

  setNaming(groupId, on) {
    const { naming } = get()
    const rest = naming.filter((id) => id !== groupId)
    set({ naming: on ? [...rest, groupId] : rest.length > 0 ? rest : NONE })
  },

  nameGroup(projectId, groupId, name) {
    const { arranged, named } = get()
    const next = {
      ...named,
      [projectId]: { ...named[projectId], [groupId]: name },
    }
    keepArranged(arranged, next)
    set({ named: next })
  },

  setHidden(hidden) {
    const { activeId, view, history, setView } = get()
    const change = rehidden(view.hidden, hidden, Date.now())
    if (!change) return
    setView({ hidden: hidden.length > 0 ? hidden : NONE })
    if (change.hid.length > 0) set({ hidLast: change.hid })
    if (activeId)
      set({
        history: {
          ...history,
          [activeId]: record(history[activeId] ?? NO_HISTORY, change),
        },
      })
  },

  async undo() {
    const { activeId, projects, history } = get()
    const project = projects.find((p) => p.id === activeId)
    if (!project || turning) return
    const kept = history[project.id] ?? NO_HISTORY
    const which = later(kept.done.at(-1)?.at ?? null, project.undo?.at ?? null)
    if (which === "mine") {
      const taken = back(kept, Date.now())
      if (!taken) return
      byHand(project.id, taken.change, taken.history, "undo")
      return
    }
    const turn = project.undo
    if (which !== "claudes" || !turn) return
    const now = Date.now()
    if (
      asked?.projectId === project.id &&
      asked.at === turn.at &&
      now < asked.until
    ) {
      get().letUndoGo()
      await turnBack(project.id, "undo")
      return
    }
    get().say(askedAgain(turn, MAC), AGAIN_MS)
    asked = { projectId: project.id, at: turn.at, until: now + AGAIN_MS, said }
  },

  async redo() {
    const { activeId, projects, history } = get()
    const project = projects.find((p) => p.id === activeId)
    if (!project || turning) return
    const kept = history[project.id] ?? NO_HISTORY
    const which = later(
      kept.undone.at(-1)?.undoneAt ?? null,
      project.redo?.at ?? null
    )
    if (which === "mine") {
      const put = forth(kept)
      if (!put) return
      byHand(project.id, put.change, put.history, "redo")
    } else if (which === "claudes") await turnBack(project.id, "redo")
  },

  letUndoGo() {
    if (!asked) return
    const { said: key } = asked
    asked = null
    set((state) => (state.saying?.key === key ? { saying: null } : {}))
  },

  say(text, ms) {
    set({ saying: { text, key: ++said, ...(ms ? { ms } : {}) } })
  },

  setThreadOpen(threadOpen) {
    set({ threadOpen })
  },

  setThreadWidth(threadWidth) {
    localStorage.setItem(THREAD_WIDTH_KEY, String(threadWidth))
    set({ threadWidth })
  },

  setPartsOpen(partsOpen) {
    // (the list of reference scenes has the same place, and the project's tools and its
    // boards: one of them at a time)
    set(
      partsOpen
        ? {
            partsOpen,
            referenceOpen: false,
            toolsOpen: false,
            boardsOpen: false,
          }
        : { partsOpen }
    )
  },

  setReferenceOpen(referenceOpen) {
    set(
      referenceOpen
        ? {
            referenceOpen,
            partsOpen: false,
            toolsOpen: false,
            boardsOpen: false,
          }
        : { referenceOpen }
    )
  },

  setToolsOpen(toolsOpen) {
    set(
      toolsOpen
        ? {
            toolsOpen,
            partsOpen: false,
            referenceOpen: false,
            boardsOpen: false,
          }
        : { toolsOpen }
    )
    // brought up, they are at work: and stay so, put away, until they are left
    const { view, setView } = get()
    if (toolsOpen && (!view.tools || view.toolsQuiet))
      setView({ tools: true, toolsQuiet: false })
  },

  setBoardsOpen(boardsOpen) {
    set(
      boardsOpen
        ? {
            boardsOpen,
            partsOpen: false,
            referenceOpen: false,
            toolsOpen: false,
            boardPartsOpen: false,
          }
        : { boardsOpen }
    )
  },

  setBoardPartsOpen(boardPartsOpen) {
    // (in the place the list of boards has, which PCB mode is gone on from)
    set(
      boardPartsOpen
        ? { boardPartsOpen, boardsOpen: false }
        : { boardPartsOpen }
    )
  },

  focusBoardParts(names) {
    // the camera is the 3D's: the board is turned to that, where it is drawn
    if (get().view.boardAs !== "3d") get().setView({ boardAs: "3d" })
    set({ boardFocus: { names, at: Date.now() } })
  },

  focusedBoardParts() {
    set({ boardFocus: null })
  },

  hoverBoardParts(boardHover) {
    set({ boardHover })
  },

  pickBoardPart(boardPicked) {
    set({ boardPicked, boardWriting: null })
  },

  writeBoard(note) {
    const { activeId, notes, boardPicked, view, setView } = get()
    if (note === null || note === "new") {
      set({ boardWriting: boardPicked ? note : null })
      return
    }
    const made = (activeId ? notes[activeId] : undefined)?.find(
      (one) => one.id === note
    )
    const board = made?.part.board
    if (!made || !board || !made.part.point) return
    if (view.board !== board) setView({ board })
    set({
      boardPicked: { name: made.part.id, at: made.part.point },
      boardWriting: note,
    })
  },

  keepBoardNote(text, label) {
    const { activeId, notes, boardPicked, boardWriting, view } = get()
    const said = text.trim()
    if (!activeId || !boardPicked || boardWriting === null || !view.board)
      return null
    const before = notes[activeId] ?? []
    const at = Date.now()
    const id =
      boardWriting === "new" ? `note-${at}-${before.length}` : boardWriting
    const part = {
      id: boardPicked.name,
      label,
      point: boardPicked.at,
      normal: null,
      face: null,
      board: view.board,
    }
    const next =
      boardWriting === "new"
        ? said
          ? [...before, { id, part, text: said, at }]
          : before
        : // one left with nothing in it is taken back
          before.flatMap((note) =>
            note.id !== id ? [note] : said ? [{ ...note, text: said }] : []
          )
    set({
      notes: { ...notes, [activeId]: next },
      boardWriting: null,
      ...(boardWriting === "new" && said !== "" && { noted: id }),
    })
    return said ? id : null
  },

  pickScene(sceneId) {
    const { activeId, sceneOf, setView } = get()
    if (!activeId) return
    const kept = { ...sceneOf, [activeId]: sceneId }
    localStorage.setItem(REFERENCE_KEY, JSON.stringify(kept))
    set({ sceneOf: kept })
    setView({ reference: sceneId })
  },

  setFigure(figure) {
    localStorage.setItem(FIGURE_KEY, figure ? "shown" : "hidden")
    set({ figure })
  },

  setSettingsOpen(settingsOpen) {
    set({ settingsOpen })
  },

  clearView() {
    set((state) => ({
      cleared:
        state.cleared === null
          ? "others"
          : state.cleared === "others"
            ? "all"
            : null,
    }))
  },

  leave() {
    const {
      finding,
      partsOpen,
      referenceOpen,
      toolsOpen,
      boardsOpen,
      boardPartsOpen,
      entered,
      setView,
    } = get()
    // what is being typed goes first, and then the list: both are things on top of the
    // view. What was picked in the list stays
    if (finding !== null) {
      set({ finding: null })
      return true
    }
    // a part of a board picked out, with its name and what can be done with it, is let
    // go of before anything else of PCB mode
    if (get().boardPicked !== null) {
      set({ boardPicked: null, boardWriting: null })
      return true
    }
    if (
      partsOpen ||
      referenceOpen ||
      toolsOpen ||
      boardsOpen ||
      boardPartsOpen
    ) {
      set({
        partsOpen: false,
        referenceOpen: false,
        toolsOpen: false,
        boardsOpen: false,
        boardPartsOpen: false,
      })
      return true
    }
    // The inspiration board is over everything else of the view, as a board is: it is
    // got out of before anything that was gone into under it. (What it has open of its
    // own, a picture gone up to or a group spread out, it closes itself, first.)
    if (get().view.inspiration) {
      setView({ inspiration: false })
      return true
    }
    // A board is over everything else of the view, as the guides are: PCB mode is got
    // out of before anything that was gone into under it.
    if (get().view.board !== null) {
      setView({ board: null })
      return true
    }
    // The guides are over everything else of the view: they are got out of before
    // anything that was gone into under them.
    if (get().view.assembly) {
      setView({ assembly: false })
      return true
    }
    // A model that is pulled apart is put together first, whatever else was gone into
    // and whenever: it is the one that is got out of at once.
    if (get().view.exploded) {
      setView({ exploded: false })
      return true
    }
    // a sheet that has the view to itself goes back among the others, before anything
    // else that was gone into is got out of
    if (get().view.sheet !== null) {
      setView({ sheet: null })
      return true
    }
    const last = entered.at(-1)
    if (!last) return false
    if (last === "section") setView({ section: null })
    else if (last === "hidden") {
      // what went out of sight last comes back first, by itself: what was hidden to see
      // what was under it, say. And then all the rest at once
      const { view, hidLast, setHidden } = get()
      const back = hidLast.filter((id) => view.hidden.includes(id))
      set({ hidLast: NONE })
      setHidden(
        back.length > 0 ? view.hidden.filter((id) => !back.includes(id)) : NONE
      )
    } else if (last === "blueprint") setView({ blueprint: false })
    else if (last === "assembly") setView({ assembly: false })
    else if (last === "reference") setView({ reference: null })
    else if (last === "tools") setView({ tools: false })
    else if (last === "board") setView({ board: null })
    else if (last === "inspiration") setView({ inspiration: false })
    else setView({ only: null })
    return true
  },

  setAccess(access) {
    localStorage.setItem(ACCESS_KEY, access)
    set({ access })
  },

  setProvider(provider) {
    localStorage.setItem(PROVIDER_KEY, provider)
    set({ provider })
  },

  setModel(provider, model) {
    localStorage.setItem(keyOf(MODEL_KEY, provider), model ?? "")
    set((state) => ({ model: { ...state.model, [provider]: model } }))
  },

  setEffort(provider, effort) {
    localStorage.setItem(keyOf(EFFORT_KEY, provider), effort ?? "")
    set((state) => ({ effort: { ...state.effort, [provider]: effort } }))
  },

  send() {
    const { activeId, projects, picked } = get()
    const project = projects.find((p) => p.id === activeId)
    if (!project) return
    const called = get().called[project.id] ?? []
    const message = callingOn(
      (get().drafts[project.id] ?? "").trim(),
      called.filter(byName).map((part) => part.id)
    )
    const objects = called.flatMap(({ label, parts }): ObjectRef[] =>
      parts ? [{ label, parts }] : []
    )
    const reference = called.find((one) => one.scene)?.scene ?? null
    const board = get().view.board
    const notes = get().notes[project.id] ?? []
    const quotes = get().quotes[project.id] ?? []
    const pictures = get().pictures[project.id] ?? []
    if (
      !message &&
      notes.length === 0 &&
      quotes.length === 0 &&
      objects.length === 0 &&
      !reference &&
      pictures.length === 0
    )
      return
    // into the conversation the panel is showing; if that is a new one, this begins it
    const { open } = stackOf(
      project.conversations,
      picked[project.id],
      usePreferences.getState().settleDays,
      Date.now()
    )
    // What was written, and what went with it, comes back to the box where the message
    // is turned away (the agent is at work in another of the project's conversations,
    // say), with whatever has been put there since: nothing written is lost to it.
    const written = get().drafts[project.id] ?? ""
    const refused = () => {
      set((state) => ({
        drafts: {
          ...state.drafts,
          [project.id]: state.drafts[project.id]?.trim()
            ? `${written}\n${state.drafts[project.id]}`
            : written,
        },
        notes: {
          ...state.notes,
          [project.id]: [...notes, ...(state.notes[project.id] ?? [])],
        },
        quotes: {
          ...state.quotes,
          [project.id]: [...quotes, ...(state.quotes[project.id] ?? [])],
        },
        called: {
          ...state.called,
          [project.id]: [...called, ...(state.called[project.id] ?? [])],
        },
        pictures: {
          ...state.pictures,
          [project.id]: [...pictures, ...(state.pictures[project.id] ?? [])],
        },
      }))
      get().say(
        project.conversations.some(
          (one) => one.id !== open?.id && one.status !== "idle"
        )
          ? "Not sent: the agent is at work in another conversation. Send it once that is done"
          : "The message could not be sent just now"
      )
    }
    set((state) => ({
      threadOpen: true,
      writing: null,
      quoting: null,
      drafts: { ...state.drafts, [project.id]: "" },
      notes: { ...state.notes, [project.id]: [] },
      quotes: { ...state.quotes, [project.id]: [] },
      called: { ...state.called, [project.id]: [] },
      // (the app keeps its copies of them: they are the conversation's now)
      pictures: { ...state.pictures, [project.id]: [] },
      pictureTrouble: null,
    }))
    void window.cad.thread
      .send(
        project.id,
        open?.id ?? null,
        message,
        notes.map(({ part, text }) => ({ part, text })),
        objects,
        mannerIn(get(), open),
        reference,
        pictures,
        quotes.map(({ quote, text }) => ({ quote, text })),
        board
      )
      .then(
        (id) => {
          // stay with it: a conversation that has just begun is not yet the one on the
          // card, and one that had settled is turned back to by being carried on
          if (id)
            set((state) => ({ picked: { ...state.picked, [project.id]: id } }))
          else refused()
        },
        () => refused()
      )
  },

  compact() {
    const { activeId, projects, picked } = get()
    const project = projects.find((p) => p.id === activeId)
    if (!project) return
    const { open } = stackOf(
      project.conversations,
      picked[project.id],
      usePreferences.getState().settleDays,
      Date.now()
    )
    if (!open) return
    const refused = () =>
      get().say("The conversation could not be compacted just now")
    set({ threadOpen: true })
    void window.cad.thread
      .send(project.id, open.id, COMPACT, [], [], mannerIn(get(), open))
      .then((id) => {
        if (!id) refused()
      }, refused)
  },

  setMeshes(projectId, any) {
    if ((get().meshes[projectId] ?? false) !== any)
      set((state) => ({ meshes: { ...state.meshes, [projectId]: any } }))
  },

  rebuild(projectId) {
    ask(projectId, REBUILD)
  },

  rebuildBoard(projectId, board) {
    ask(projectId, REBUILD_BOARD, board)
  },

  recolour(projectId) {
    get().activate(projectId)
    ask(projectId, RECOLOUR)
  },

  keepMesh(projectId) {
    const keptMeshes = [
      ...get().keptMeshes.filter((id) => id !== projectId),
      projectId,
    ]
    localStorage.setItem(KEPT_MESHES_KEY, JSON.stringify(keptMeshes))
    set({ keptMeshes })
  },

  async lookOver(projectId, seen) {
    const id = await window.cad.thread.lookOver(
      projectId,
      seen,
      mannerIn(get(), null)
    )
    if (id) set((state) => ({ picked: { ...state.picked, [projectId]: id } }))
  },

  assemble(of) {
    const { activeId, projects, picked } = get()
    const project = projects.find((p) => p.id === activeId)
    if (!project) return
    const { open } = stackOf(
      project.conversations,
      picked[project.id],
      usePreferences.getState().settleDays,
      Date.now()
    )
    void window.cad.assembly
      .make(project.id, open?.id ?? null, of, mannerIn(get(), open))
      .then((id) => {
        if (id)
          set((state) => ({ picked: { ...state.picked, [project.id]: id } }))
        else get().say("The guide could not be asked for just now")
      })
  },
}))

/**
 * Ask the agent something in the conversation a project's panel shows, the way a
 * message would be, apart from what is written in the message box: about one of its
 * boards, where one is given.
 */
function ask(projectId: string, text: string, board: string | null = null) {
  const { projects, picked } = useStore.getState()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return
  const { open } = stackOf(
    project.conversations,
    picked[project.id],
    usePreferences.getState().settleDays,
    Date.now()
  )
  useStore.setState({ threadOpen: true })
  void window.cad.thread
    .send(
      project.id,
      open?.id ?? null,
      text,
      [],
      [],
      mannerIn(useStore.getState(), open),
      null,
      [],
      [],
      board
    )
    .then((id) => {
      if (id)
        useStore.setState((state) => ({
          picked: { ...state.picked, [project.id]: id },
        }))
    })
}

/**
 * How a message said in a conversation will be answered, from what is picked: by the
 * agent the conversation is had with, or the one picked for a new one (null).
 */
function mannerIn(
  state: Pick<State, "providers" | "provider" | "model" | "effort" | "access">,
  conversation: Pick<ConversationSummary, "provider"> | null
) {
  const provider = answering(state.providers, state.provider, conversation)
  return mannerOf(
    provider,
    offeredModels(state.providers.find((one) => one.id === provider)),
    state.model[provider],
    state.effort[provider],
    state.access
  )
}

/** Change what is chosen about one of the agents. */
export async function changeProvider(
  id: ProviderId,
  patch: Partial<ProviderSettings>
) {
  useStore.setState({ providers: await window.cad.providers.change(id, patch) })
}

/** Have the agents looked at again: what is installed, who is signed in, what models. */
export async function checkProviders() {
  useStore.setState({ providers: await window.cad.providers.check() })
}

/**
 * Put in the newest version of one of the agents, and say what came of it. How it stands
 * meanwhile, and after, the window hears as the app finds it out.
 */
export async function updateProvider(id: ProviderId) {
  const updated = await window.cad.providers.update(id)
  useStore.getState().say(updatedSaid(id, updated))
}

/** The agents are being looked at again, for one that had not said what models it has. */
let asking: Promise<unknown> | null = null

/**
 * Have the agents looked at again if the one that is to answer has not said what models
 * it has: it may not have been ready when the app started.
 */
export async function askModels(provider: ProviderId) {
  const one = useStore.getState().providers.find((p) => p.id === provider)
  if (!one || !usable(one) || one.models.length > 0 || one.checking) return
  asking ??= checkProviders().finally(() => (asking = null))
  await asking
}

/** How long what Claude Code said it has in a folder is taken as still so, in ms. */
const COMMANDS_FRESH_MS = 60_000
/** When each project's commands were last asked for. */
const commandsAsked = new Map<string, number>()

/**
 * Ask Claude Code what commands and skills it has in a project's folder, unless it was
 * asked a moment ago. What it said before stays until it has said again.
 */
export async function askCommands(projectId: string) {
  const now = Date.now()
  if (now - (commandsAsked.get(projectId) ?? -Infinity) < COMMANDS_FRESH_MS)
    return
  commandsAsked.set(projectId, now)
  const found = await window.cad.claude.commands(projectId)
  if (found.commands.length + found.skills.length > 0)
    useStore.setState((state) => ({
      commands: { ...state.commands, [projectId]: found },
    }))
  // it would not say: it is asked again the next time
  else commandsAsked.delete(projectId)
}

/** Put an item into a thread, replacing the one with the same id if it is already there. */
function withItem(items: ThreadItem[], item: ThreadItem): ThreadItem[] {
  const index = items.findIndex((i) => i.id === item.id)
  if (index < 0) return [...items, item]
  const next = items.slice()
  next[index] = item
  return next
}

/** The revision of each project's colours given by hand that the window last took up. */
const coloursTaken = new Map<string, number>()

/**
 * The colours given by hand, with those taken up from each project's folder where they
 * are found changed there (see Project["colours"]): the window's own giving is no news.
 */
function coloursOf(
  colours: Record<string, Record<string, PaletteName>>,
  projects: Project[]
) {
  let next = colours
  for (const { id, colours: kept } of projects) {
    if (coloursTaken.get(id) === kept.revision) continue
    coloursTaken.set(id, kept.revision)
    next = { ...next, [id]: kept.parts }
  }
  return next
}

function reconcile(listed: Project[]) {
  const {
    activeId,
    activate,
    cuts,
    colours,
    projects: before,
  } = useStore.getState()
  // (one whose folder is not there keeps what was kept of it, for when it is back)
  const kept = cutsOf(cuts, listed)
  if (kept !== cuts) keepCuts(kept)
  // (the very projects there were, as far as they are the same: what is drawn of one
  // that has not changed is not drawn again)
  const projects = keptAsWas(
    before,
    listed.filter((p) => !p.missing)
  )
  useStore.setState({
    projects,
    missing: listed.filter((p) => p.missing),
    cuts: kept,
    colours: coloursOf(colours, projects),
  })
  tally(before)
  if (activeId && projects.some((p) => p.id === activeId)) return
  const wanted = /^#project=(.+)$/.exec(location.hash)?.[1] ?? saved(ACTIVE_KEY)
  const next = projects.find((p) => p.id === wanted) ?? projects[0]
  if (next) activate(next.id)
  else
    useStore.setState({
      activeId: null,
      selection: null,
      several: NONE,
      finding: null,
      writing: null,
    })
}

/** The conversation in front of the user: the one the panel shows, while it is up. */
function inView(): string | null {
  const { threadOpen, activeId, projects, picked } = useStore.getState()
  const project = projects.find((p) => p.id === activeId)
  if (!threadOpen || !project) return null
  return (
    stackOf(
      project.conversations,
      picked[project.id],
      usePreferences.getState().settleDays,
      Date.now()
    ).open?.id ?? null
  )
}

/** The conversation the app was last told is shown of each project, by project. */
const shown = new Map<string, string>()

/**
 * Tell the app which conversation is shown of the open project, where it has not been
 * told so already: the project's folder is that conversation's to be (see
 * electron/versions.ts). A new one, with nothing said in it yet, goes on from the
 * model as it is, and nothing is said of it.
 */
function show() {
  const { activeId, projects, picked } = useStore.getState()
  const project = projects.find((p) => p.id === activeId)
  if (!project) return
  const { open } = stackOf(
    project.conversations,
    picked[project.id],
    usePreferences.getState().settleDays,
    Date.now()
  )
  if (!open || shown.get(project.id) === open.id) return
  shown.set(project.id, open.id)
  window.cad.versions.show(project.id, open.id)
}

/**
 * Put the colours the window kept itself, before the projects' folders kept them, into
 * the folders: once, but for those that could not be written there, which are kept to
 * be tried again the next time the app opens. What was put aside for a conversation goes
 * into its version of the folder. A conversation's colours were what said that
 * something had been put aside for it at all: its names say so from here on (see
 * turned).
 */
function adoptColours() {
  if (saved(COLOURS_KEY) === null) return
  const kept = savedColours()
  const state = useStore.getState()
  const marked = Object.keys(kept).filter(
    (key) => key.includes("/") && !(key in state.named)
  )
  if (marked.length > 0) {
    const named = {
      ...state.named,
      ...Object.fromEntries(marked.map((key) => [key, {}])),
    }
    keepArranged(state.arranged, named)
    useStore.setState({ named })
  }
  void window.cad.colours.adopt(kept).then((left) => {
    if (left.length === 0) localStorage.removeItem(COLOURS_KEY)
    else
      localStorage.setItem(
        COLOURS_KEY,
        JSON.stringify(Object.fromEntries(left.map((key) => [key, kept[key]])))
      )
  })
}

/**
 * A project's folder became another conversation's: what was done to its model by hand
 * goes the same way (see lib/versions.ts). What was taken back or could be, of what was
 * done by hand, was of a model that is no longer the one on screen.
 */
function turned(projectId: string, how: Turned) {
  const state = useStore.getState()
  // (the colours given by hand are in the folder, and go with it: see coloursOf)
  // names are put aside even where there are none, which says that something was
  const left = asideFor(projectId, how.to) in state.named
  const arranged = carried(state.arranged, projectId, how, left)
  const named = carried(state.named, projectId, how, left, {})
  keepArranged(arranged, named)
  useStore.setState({
    arranged,
    named,
    ...(how.restored
      ? { history: { ...state.history, [projectId]: NO_HISTORY } }
      : {}),
  })
}

/**
 * The agent began a new version of a project, in a conversation of its own, as it was
 * asked to in another: the panel goes on to the new one, where it was showing the one
 * that was asked in (see lib/conversations.ts).
 */
function begun(projectId: string, from: string, to: string) {
  const { projects, picked } = useStore.getState()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return
  const { open } = stackOf(
    project.conversations,
    picked[projectId],
    usePreferences.getState().settleDays,
    Date.now()
  )
  if (!follows(open, from, to)) return
  useStore.setState((state) => ({
    picked: { ...state.picked, [projectId]: to },
  }))
}

/**
 * The agent started a new project, as it was asked to in a conversation about another:
 * the window turns to it, and to the conversation begun there, where it was showing the
 * one that was asked in.
 */
function started(
  from: { projectId: string; conversationId: string },
  to: { projectId: string; conversationId: string }
) {
  const { projects, picked, activeId } = useStore.getState()
  const project = projects.find((p) => p.id === from.projectId)
  if (!project || activeId !== from.projectId) return
  const { open } = stackOf(
    project.conversations,
    picked[from.projectId],
    usePreferences.getState().settleDays,
    Date.now()
  )
  if (open?.id !== from.conversationId) return
  useStore.getState().openConversation(to.projectId, to.conversationId)
}

/**
 * Bring the list of conversations finished and not yet seen up to date: with what has
 * just come to an end, given the projects as they were a moment ago, and without what
 * is now being looked at.
 */
function tally(before?: Project[]) {
  const { finished, projects } = useStore.getState()
  const now = projects.flatMap((p) => p.conversations)
  const next = finishedNow(
    finished,
    before ? before.flatMap((p) => p.conversations) : now,
    now,
    inView()
  )
  if (next === finished) return
  localStorage.setItem(FINISHED_KEY, JSON.stringify(next))
  useStore.setState({ finished: next })
}

/** Connect the store to the app's own process. Call once, before the first render. */
export function connect() {
  const { cad } = window
  cad.projects.onChange(reconcile)
  connectInspiration(() => useStore.getState().model.codex ?? null)
  window.addEventListener("pagehide", cutsSettled)
  adoptColours()
  // what is waiting to be sent is kept as it changes, so that the window can be loaded
  // again without losing it
  useStore.subscribe((state, was) => {
    if (
      state.notes !== was.notes ||
      state.quotes !== was.quotes ||
      state.drafts !== was.drafts ||
      state.called !== was.called ||
      state.pictures !== was.pictures
    )
      localStorage.setItem(
        WAITING_KEY,
        JSON.stringify({
          notes: state.notes,
          quotes: state.quotes,
          drafts: state.drafts,
          called: state.called,
          pictures: state.pictures,
        })
      )
  })
  // turning to a conversation, or bringing the panel up, is looking at what is in it
  useStore.subscribe((state, was) => {
    if (
      state.activeId !== was.activeId ||
      state.picked !== was.picked ||
      state.threadOpen !== was.threadOpen
    )
      tally()
  })
  // and it is the one the project's folder is to be
  useStore.subscribe((state, was) => {
    if (
      state.activeId !== was.activeId ||
      state.picked !== was.picked ||
      state.projects !== was.projects
    )
      show()
  })
  cad.versions.onTurned(turned)
  cad.versions.onBegun(begun)
  cad.projects.onStarted(started)
  cad.thread.onItem((_projectId, conversationId, item) => {
    useStore.setState((state) => ({
      items: {
        ...state.items,
        [conversationId]: withItem(state.items[conversationId] ?? [], item),
      },
    }))
  })
  void cad.projects.list().then((projects) => {
    reconcile(projects)
    useStore.setState({ ready: true })
  })
  cad.projects.onExampleProgress((id, received) => {
    useStore.setState(({ starting }) =>
      id in starting ? { starting: { ...starting, [id]: received } } : {}
    )
  })
  cad.providers.onChange((providers) => useStore.setState({ providers }))
  void cad.providers
    .list()
    .then((providers) => useStore.setState({ providers }))
  cad.update.onChange((update) => useStore.setState({ update }))
  void cad.update.get().then((update) => useStore.setState({ update }))
  cad.github.onChange((github) => useStore.setState({ github }))
  void cad.github.get().then((github) => useStore.setState({ github }))
}

// lets a script drive the app when it is being checked without a person at it
if (import.meta.env.DEV) Object.assign(window, { __store: useStore })

export const useActiveProject = () =>
  useStore(
    (state) => state.projects.find((p) => p.id === state.activeId) ?? null
  )

/**
 * How a project's conversations are laid out at a given moment: which is on its card,
 * which are under it, and which the conversation panel shows.
 */
export function useStack(project: Project | null, now: number): Stack {
  const picked = useStore((state) =>
    project ? state.picked[project.id] : undefined
  )
  const settleDays = usePreferences((state) => state.settleDays)
  return stackOf(project?.conversations ?? [], picked, settleDays, now)
}
