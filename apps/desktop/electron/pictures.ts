// The pictures put with messages, as they are kept on disk: a folder for each project,
// and in it a file for each picture. One is kept from when it is put on a message, so
// that a message waiting to be sent still has it when the window is loaded again, and
// for as long as the project is on the list, so that the conversation can show it.
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { types } from "node:util"

import type { Attached } from "../shared/api"
import { MOST_AT_ONCE, MOST_BYTES, PICTURE_TYPES } from "../shared/pictures"

/** A picture as it is handed to an agent: what it is kept as, and what is in its file. */
export type Shown = Attached & { data: string }

/** What a picture is kept as: a name of the app's making, ending as its kind of file does. */
const KEPT_AS = /^[0-9a-f]{16}\.(png|jpg|webp|gif)$/

const typeOf = (id: string) =>
  Object.keys(PICTURE_TYPES).find(
    (type) => PICTURE_TYPES[type] === path.extname(id)
  )

/** The most letters of what a picture was called that are kept. */
const NAME_LENGTH = 120

export class Pictures {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  /** Where a project's pictures are kept. */
  folder(projectId: string): string {
    return path.join(this.dir, projectId)
  }

  private file(projectId: string, id: unknown): string | null {
    return typeof id === "string" && KEPT_AS.test(id)
      ? path.join(this.folder(projectId), id)
      : null
  }

  /**
   * Keep a picture. Gives back what it is kept as, or null where it is of no kind an
   * agent takes, or is bigger than one takes.
   */
  add(
    projectId: string,
    given: {
      name?: unknown
      path?: unknown
      mimeType?: unknown
      data?: unknown
    } | null
  ): Omit<Attached, "number"> | null {
    const { name, path: from, mimeType, data } = given ?? {}
    const ending = typeof mimeType === "string" && PICTURE_TYPES[mimeType]
    if (!ending || !(types.isArrayBuffer(data) || ArrayBuffer.isView(data)))
      return null
    const bytes = ArrayBuffer.isView(data)
      ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      : Buffer.from(data)
    if (bytes.length === 0 || bytes.length > MOST_BYTES) return null
    const id = randomBytes(8).toString("hex") + ending
    fs.mkdirSync(this.folder(projectId), { recursive: true })
    fs.writeFileSync(path.join(this.folder(projectId), id), bytes)
    return {
      id,
      name: called(name),
      ...(fileAt(from) ? { path: from as string } : {}),
      mimeType: mimeType as string,
      bytes: bytes.length,
    }
  }

  /** Forget one picture: it was taken back off its message before that was sent. */
  drop(projectId: string, id: unknown) {
    const file = this.file(projectId, id)
    if (file) fs.rmSync(file, { force: true })
  }

  /**
   * The pictures a message is sent with, from what the window says they are: those of
   * them that are kept, each with what is in its file. What kind each is and how big
   * are read off the file, and not taken from what was said.
   */
  read(projectId: string, given: unknown): Shown[] {
    const found: Shown[] = []
    for (const one of Array.isArray(given) ? given : []) {
      const { id, name, path: from, number } = (one ?? {}) as Partial<Attached>
      const file = this.file(projectId, id)
      const mimeType = file && typeOf(id as string)
      if (
        !file ||
        !mimeType ||
        !Number.isInteger(number) ||
        (number as number) < 1 ||
        found.some((other) => other.id === id || other.number === number)
      )
        continue
      try {
        const data = fs.readFileSync(file)
        if (data.length === 0 || data.length > MOST_BYTES) continue
        found.push({
          id: id as string,
          name: called(name),
          // (said only while its file is still there)
          ...(fileAt(from) && fs.existsSync(from as string)
            ? { path: from as string }
            : {}),
          mimeType,
          bytes: data.length,
          number: number as number,
          data: data.toString("base64"),
        })
      } catch {
        // it is not there any more: the message goes without it
      }
      if (found.length === MOST_AT_ONCE) break
    }
    return found.sort((a, b) => a.number - b.number)
  }

  /**
   * Keep some of a project's pictures for another as well: the message they came with
   * is said there too. One that is not there any more is gone without.
   */
  share(from: string, to: string, ids: string[]) {
    for (const id of ids) {
      const file = this.file(from, id)
      if (!file || !fs.existsSync(file)) continue
      fs.mkdirSync(this.folder(to), { recursive: true })
      fs.copyFileSync(file, path.join(this.folder(to), id))
    }
  }

  /** Forget every picture of a project: it is being taken off the list. */
  forget(projectId: string) {
    fs.rmSync(this.folder(projectId), { recursive: true, force: true })
  }
}

/** Whether what was said of where a picture's file is could be where one is: a whole path. */
function fileAt(said: unknown): boolean {
  return (
    typeof said === "string" &&
    said.length < 4096 &&
    !/[\n\r]/.test(said) &&
    path.isAbsolute(said)
  )
}

/** What a picture was called where it came from, in one line and no longer than is kept. */
function called(name: unknown): string {
  const said = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : ""
  return said.slice(0, NAME_LENGTH) || "image"
}
