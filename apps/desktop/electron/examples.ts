// Starting from an example. The app has projects to try things on (shared/examples.ts
// says which). One is never opened where it is: a project is made of it in a folder
// where new projects go, and that is the user's to change. Run from its source, the app
// has them beside it, in examples/, and copies one. Otherwise it fetches the example's
// archive from where they are kept and unpacks it there.
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { BOARD_FOLDER } from "../shared/board-format"
import type { Example } from "../shared/examples"
import { LEFT_BEHIND, type Filed } from "./archive"
import { SCRIPT } from "./imports"
import { folderName, makeFolder, resolveInside } from "./projects"

/** How long an archive may send nothing before it is given up on, in ms. */
const STALLED = 30_000

/**
 * An example's archive, fetched from `url`: `onProgress` is told how many bytes of it
 * have come, as they come. It is the example only if it is the bytes the app was made to
 * expect, by their number and their sum; anything else is thrown away.
 */
export async function fetched(
  url: string,
  example: Example,
  onProgress: (received: number) => void,
  get: typeof fetch = fetch,
  stalled = STALLED
): Promise<Buffer> {
  const giveUp = new AbortController()
  let waiting: ReturnType<typeof setTimeout> | undefined
  const heard = () => {
    clearTimeout(waiting)
    waiting = setTimeout(() => giveUp.abort(), stalled)
  }
  try {
    heard()
    const response = await get(url, { signal: giveUp.signal })
    if (!response.ok || !response.body)
      throw new Error(`${url} answered ${response.status}`)
    const sum = createHash("sha256")
    const chunks: Uint8Array[] = []
    let received = 0
    onProgress(0)
    for await (const chunk of response.body) {
      heard()
      received += chunk.length
      // more than there is of the example is not the example
      if (received > example.bytes) break
      sum.update(chunk)
      chunks.push(chunk)
      onProgress(received)
    }
    if (received !== example.bytes || sum.digest("hex") !== example.sha256)
      throw new Error("What was downloaded is not the example")
    return Buffer.concat(chunks)
  } catch (error) {
    if (giveUp.signal.aborted)
      throw new Error("The download stopped coming", { cause: error })
    throw error
  } finally {
    clearTimeout(waiting)
    giveUp.abort()
  }
}

/**
 * An example's model.py finds the exporter in the app, two folders up from it. A project
 * has its own copy beside its model.py, which Python finds with nothing said: the line
 * that points at the app comes out.
 */
export function ownExporter(script: string): string {
  return script.replace(/^sys\.path\.insert\(.*"kit"\)\)\r?\n/m, "")
}

/**
 * Everything in a project's pcb/ stamped as written at the one moment. A board is out of
 * date where its file is newer than what was built of it, and a project made of an
 * example has had each of its files written a moment ago, in no order that says which
 * was made first: the example's boards come built as they are.
 */
function boardsTogether(dir: string, at = new Date()) {
  const folder = path.join(dir, BOARD_FOLDER)
  if (!fs.existsSync(folder)) return
  for (const entry of fs.readdirSync(folder, {
    recursive: true,
    withFileTypes: true,
  }))
    if (entry.isFile())
      fs.utimesSync(path.join(entry.parentPath, entry.name), at, at)
}

/** The app's library of screws, beside its exporter: what a model that has screws reads. */
const SCREWS = "screws.py"
const USES_SCREWS = /^(?:from screws import|import screws)\b/m

/**
 * Make a project of an example, in `into`, and return where it is. The example is its
 * folder, which is copied, or the files unpacked from its archive, which are written:
 * its model with it if it has been built. The project gets the app's exporter (`kit`)
 * beside its model.py as any project has, and the app's screws where its model is made
 * with them.
 */
export function startFrom(
  example: string | Filed[],
  name: string,
  into: string,
  kit: string,
  now = new Date(),
  /** what of a folder that is copied is not, by name, wherever it is in it */
  leaving: Set<string> = LEFT_BEHIND
): string {
  const dir = makeFolder(into, folderName(name, now))
  try {
    if (typeof example === "string")
      fs.cpSync(example, dir, {
        recursive: true,
        // where the disk can, a copy that shares the original's blocks: no wait, no room
        mode: fs.constants.COPYFILE_FICLONE,
        filter: (from) => !leaving.has(path.basename(from)),
      })
    else
      for (const file of example) {
        const to = resolveInside(dir, file.path)
        if (!to) throw new Error(`"${file.path}" is not a place in a project`)
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.writeFileSync(to, file.data)
      }
    fs.copyFileSync(kit, path.join(dir, "enclose.py"))
    const script = path.join(dir, SCRIPT)
    if (fs.existsSync(script)) {
      const written = fs.readFileSync(script, "utf8")
      fs.writeFileSync(script, ownExporter(written))
      if (USES_SCREWS.test(written))
        fs.copyFileSync(
          path.join(path.dirname(kit), SCREWS),
          path.join(dir, SCREWS)
        )
    }
    boardsTogether(dir)
  } catch (error) {
    // half a project is no project: the folder was made a moment ago, and is all copies
    fs.rmSync(dir, { recursive: true, force: true })
    throw error
  }
  return dir
}
