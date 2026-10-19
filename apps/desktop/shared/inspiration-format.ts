// A project's inspiration board: the pictures the user gathers of what the thing they
// are making should be like, for the agent to design by. Products whose style they are
// after, materials, details, the rooms the thing is to live in.
//
// It is kept in the project's folder, in inspiration/ at the top of it: a copy of each
// picture, and board.json, which says where each picture is on the board, what the user
// noted on parts of it, how they grouped them and what each group stands for, and what
// the agent made of each picture when it was put there. The board is the project's, and
// not any one conversation's: every version of the project has the same (see LEFT_OUT in
// electron/changes.ts).
//
// Both sides go by this. The window lays the board out and writes the file; the app's
// own process has the agent look at each new picture, keeps what it says in the file,
// and tells the agent of the board as it changes.
import { INSPIRATION_HOST, MODEL_SCHEME } from "./api"
import { PICTURE_TYPES } from "./pictures"

/** The folder at the top of a project the board is kept in, and its file in that. */
export const INSPIRATION_FOLDER = "inspiration"
export const INSPIRATION_FILE = "board.json"

/** The most letters a group's title has: a few words, said on the board over its pictures. */
export const TITLE_LONGEST = 50
/** The most letters of a note, and the most notes on one picture. */
export const NOTE_LONGEST = 2000
export const MOST_NOTES = 60
/** The most pictures a board has, and the most letters of what the agent said of one. */
export const MOST_IMAGES = 400
export const OVERVIEW_LONGEST = 1600

/**
 * The kinds of picture put on a board now, and what a file of each ends in: a picture
 * of any other kind is drawn again as one of these on its way on. (A board from before
 * may still have others, which go on being read: see PICTURE_TYPES.)
 */
export const BOARD_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
}

/**
 * The link in what was pasted, where that is a link and nothing else: to a picture, or
 * to a page the picture is had from. Null for anything else.
 */
export function pastedLink(text: string): string | null {
  const trimmed = text.trim()
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null
  try {
    return new URL(trimmed).href
  } catch {
    return null
  }
}

/**
 * Something the user said of a part of a picture: where on it, as a share of its width
 * from the left and of its height from the top, and what they said.
 */
export type InspirationNote = {
  id: string
  at: [number, number]
  text: string
  /** when it was written, ms */
  added: number
}

/** A picture on the board. */
export type InspirationImage = {
  /** what it is known by: what its file is called, without the ending */
  id: string
  /** its file, in the board's folder */
  file: string
  /** what it was called where it came from: "rams-t3.jpg" */
  name: string
  /** how big it is, in its own pixels: across, and from top to bottom */
  pixels: [number, number]
  /** where its middle is on the board, in the board's own units */
  at: [number, number]
  /** how wide it is on the board, in those units: its height follows from its pixels */
  width: number
  /** the group it is in, by what that is known by; null for none */
  group: string | null
  notes: InspirationNote[]
  /** what the agent made of it, as an industrial designer would; null until it has looked */
  overview: string | null
  /** when it was put on the board, ms */
  added: number
}

/**
 * Pictures the user put together, and said what they stand for together: "Material
 * inspirations", "Look & feel". They lie in one pile on the board, where `at` is.
 */
export type InspirationGroup = {
  id: string
  title: string
  at: [number, number]
}

export type InspirationBoard = {
  /** when the user last changed it, ms; null for a board that has never had anything */
  updated: number | null
  images: InspirationImage[]
  groups: InspirationGroup[]
}

/** The board, as the window has it from the app: and which of its pictures the agent is looking at. */
export type InspirationState = {
  board: InspirationBoard
  /** the pictures being looked at, by id */
  analysing: string[]
}

export const EMPTY_BOARD: InspirationBoard = {
  updated: null,
  images: [],
  groups: [],
}

/** What a picture's file is called: what it is known by, and an ending a picture has. */
const FILE = /^([a-z0-9][a-z0-9-]{0,79})\.(png|jpg|webp|gif)$/
/** What a note or a group is known by. */
const ID = /^[\w-]{1,80}$/

const ENDINGS = new Set(Object.values(PICTURE_TYPES))

/** Whether a file in the board's folder could be one of its pictures, by its name. */
export const isPictureFile = (file: string) =>
  FILE.test(file) && ENDINGS.has(file.slice(file.lastIndexOf(".")))

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const pair = (value: unknown): [number, number] | null =>
  Array.isArray(value) &&
  value.length === 2 &&
  finite(value[0]) &&
  finite(value[1])
    ? [value[0], value[1]]
    : null

const share = (value: number) => Math.min(1, Math.max(0, value))

/** Words in one line, no longer than so many letters: nothing, where there are none. */
export const oneLine = (value: unknown, longest: number): string =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, longest).trim()
    : ""

/** Words as they were written, line breaks and all, but no longer than so many letters. */
const written = (value: unknown, longest: number): string =>
  typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        .replace(/[^\S\n]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, longest)
        .trim()
    : ""

function readNote(value: unknown): InspirationNote | null {
  const { id, at, text, added } = (value ?? {}) as Record<string, unknown>
  const where = pair(at)
  const said = written(text, NOTE_LONGEST)
  if (typeof id !== "string" || !ID.test(id) || !where || !said) return null
  return {
    id,
    at: [share(where[0]), share(where[1])],
    text: said,
    added: finite(added) ? added : 0,
  }
}

function readImage(value: unknown): InspirationImage | null {
  const given = (value ?? {}) as Record<string, unknown>
  const { file, pixels, at, width, group, notes, overview, added } = given
  if (typeof file !== "string" || !isPictureFile(file)) return null
  const size = pair(pixels)
  const where = pair(at)
  if (!size || size[0] <= 0 || size[1] <= 0 || !where) return null
  const seen = new Set<string>()
  const kept = (Array.isArray(notes) ? notes : [])
    .map(readNote)
    .filter((note): note is InspirationNote => {
      if (!note || seen.has(note.id)) return false
      seen.add(note.id)
      return true
    })
    .slice(0, MOST_NOTES)
  const said = written(overview, OVERVIEW_LONGEST)
  return {
    id: file.slice(0, file.lastIndexOf(".")),
    file,
    name: oneLine(given.name, 120) || file,
    pixels: [Math.round(size[0]), Math.round(size[1])],
    at: where,
    width: finite(width) && width > 0 ? width : 300,
    group: typeof group === "string" && ID.test(group) ? group : null,
    notes: kept,
    overview: said || null,
    added: finite(added) ? added : 0,
  }
}

function readGroup(value: unknown): InspirationGroup | null {
  const { id, title, at } = (value ?? {}) as Record<string, unknown>
  const where = pair(at)
  const called = oneLine(title, TITLE_LONGEST)
  if (typeof id !== "string" || !ID.test(id) || !where || !called) return null
  return { id, title: called, at: where }
}

/**
 * A board as a file says it, as written: the pictures that read as pictures, each once,
 * and the groups that have pictures in them. A picture in a group there is none of is in
 * none. Nothing, where the file says nothing that is a board.
 */
export function readInspiration(json: unknown): InspirationBoard {
  if (typeof json !== "object" || json === null || Array.isArray(json))
    return EMPTY_BOARD
  const { updated, images, groups } = json as Record<string, unknown>
  const files = new Set<string>()
  const pictures = (Array.isArray(images) ? images : [])
    .map(readImage)
    .filter((image): image is InspirationImage => {
      if (!image || files.has(image.id)) return false
      files.add(image.id)
      return true
    })
    .slice(0, MOST_IMAGES)
  const ids = new Set<string>()
  const read = (Array.isArray(groups) ? groups : [])
    .map(readGroup)
    .filter((group): group is InspirationGroup => {
      if (!group || ids.has(group.id)) return false
      ids.add(group.id)
      return true
    })
  const held = new Set(pictures.map((image) => image.group))
  const kept = read.filter((group) => held.has(group.id))
  const known = new Set(kept.map((group) => group.id))
  return {
    updated: finite(updated) ? updated : null,
    images: pictures.map((image) =>
      image.group && !known.has(image.group) ? { ...image, group: null } : image
    ),
    groups: kept,
  }
}

/** What the file says: as the board is, written out to be read by people and agents too. */
export function inspirationFile(board: InspirationBoard): string {
  return `${JSON.stringify(board, null, 2)}\n`
}

/** Where the window loads a picture on a project's board from. */
export const inspirationUrl = (projectId: string, file: string) =>
  `${MODEL_SCHEME}://${projectId}.${INSPIRATION_HOST}/${file}`
