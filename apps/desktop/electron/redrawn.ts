// A picture of a kind the window cannot read, drawn again as one it can: a photo off an
// iPhone, in HEIC, or a scan, in TIFF, which Chromium has no way to open. On a Mac the
// system's own sips draws it again, as it does any picture the Mac can open: a photo as
// a JPEG, and anything else as a PNG, which may have parts to be seen through. The window
// then makes it fit to be kept, as it does any picture (see src/lib/pictures.ts).
// Elsewhere there is nothing to draw it with.
import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { types } from "node:util"

/** The most a picture to be drawn again can be, in bytes. */
const MOST_BYTES = 100_000_000
/** How long it is given, ms. */
const REDRAW_MS = 30_000

/** The kinds that are photos, and are drawn again as photos. */
const PHOTOS = new Set(["image/heic", "image/heif"])

/** Runs a program with these arguments: rejects where it fails. */
export type Run = (program: string, args: string[]) => Promise<void>

const sips: Run = (program, args) =>
  new Promise((resolve, reject) =>
    execFile(program, args, { timeout: REDRAW_MS }, (error) =>
      error ? reject(error) : resolve()
    )
  )

/** A picture drawn again as a JPEG or a PNG: null where it cannot be. */
export async function redrawn(
  given: { name?: unknown; mimeType?: unknown; data?: unknown } | null,
  run: Run = sips,
  platform: NodeJS.Platform = process.platform
): Promise<{ mimeType: string; data: Buffer } | null> {
  const { name, mimeType, data } = given ?? {}
  if (platform !== "darwin" || typeof mimeType !== "string") return null
  if (!mimeType.startsWith("image/")) return null
  if (!(types.isArrayBuffer(data) || ArrayBuffer.isView(data))) return null
  const bytes = ArrayBuffer.isView(data)
    ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    : Buffer.from(data)
  if (bytes.length === 0 || bytes.length > MOST_BYTES) return null
  const photo = PHOTOS.has(mimeType)
  // (sips goes by what is in the file, and not by its name: the name is only kept tidy)
  const ending =
    typeof name === "string" ? path.extname(name).replace(/[^.\w]/g, "") : ""
  const folder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "enclose-redrawn-")
  )
  try {
    const from = path.join(folder, `picture${ending}`)
    const to = path.join(folder, photo ? "drawn.jpg" : "drawn.png")
    await fs.promises.writeFile(from, bytes)
    await run("/usr/bin/sips", [
      "-s",
      "format",
      photo ? "jpeg" : "png",
      ...(photo ? ["-s", "formatOptions", "90"] : []),
      from,
      "--out",
      to,
    ])
    const drawn = await fs.promises.readFile(to)
    return drawn.length > 0
      ? { mimeType: photo ? "image/jpeg" : "image/png", data: drawn }
      : null
  } catch {
    return null
  } finally {
    await fs.promises.rm(folder, { recursive: true, force: true })
  }
}
