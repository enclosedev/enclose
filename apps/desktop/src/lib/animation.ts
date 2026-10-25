// An animated picture's frames, as the agent is shown them: an agent sees a GIF as its
// first frame and no more, so what moves in it is shown as some of its frames, spread
// over its running time, on one sheet, numbered in order, left to right and then down.
// The board keeps the GIF itself, which moves there (see shared/inspiration-format.ts).
import { MOST_BYTES, MOST_SIDE } from "@shared/pictures"

/** The most frames on a sheet. */
export const MOST_FRAMES = 9
/**
 * The room between frames on a sheet, px, and its colour: dark, as on a contact sheet,
 * for each frame to be seen as a whole picture of its own, and not as part of one.
 */
const GAP = 16
const GUTTER = "#1f1f1f"
/** How good the sheet is kept, the best first. */
const QUALITIES = [0.85, 0.7]

/** What a frame lasts where its file says nothing, µs: as browsers play such a frame. */
const UNSAID_US = 100_000

/**
 * Which frames go on a sheet, by number: as many as there are room for, at even steps
 * through the running time, from the first. Each frame lasts so long (any unit).
 */
export function pickedFrames(lasting: number[], most = MOST_FRAMES): number[] {
  if (lasting.length <= most) return lasting.map((_, index) => index)
  const total = lasting.reduce((sum, each) => sum + each, 0)
  const picked: number[] = []
  let at = 0
  let frame = 0
  for (let step = 0; step < most; step++) {
    const wanted = (total * step) / most
    while (frame < lasting.length - 1 && at + lasting[frame] <= wanted)
      at += lasting[frame++]
    if (picked.at(-1) !== frame) picked.push(frame)
  }
  return picked
}

/**
 * How a sheet of so many frames is laid out: its columns and rows, and how big a frame
 * is on it, never bigger than its own, with the sheet no longer than `longest` either way.
 */
export function sheetOf(
  count: number,
  width: number,
  height: number,
  longest = MOST_SIDE
) {
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  const scale = Math.min(
    1,
    (longest - GAP * (columns + 1)) / (columns * width),
    (longest - GAP * (rows + 1)) / (rows * height)
  )
  const w = Math.max(1, Math.floor(width * scale))
  const h = Math.max(1, Math.floor(height * scale))
  return {
    columns,
    rows,
    w,
    h,
    width: columns * w + GAP * (columns + 1),
    height: rows * h + GAP * (rows + 1),
  }
}

/** An animated picture's sheet of frames, as a JPEG, and what it says of the frames. */
export type Sheet = {
  data: ArrayBuffer
  /** how many frames are on it, and how many there are */
  shown: number
  of: number
  /** how long the picture runs once through, s */
  seconds: number
}

/** The sheet of an animated picture's frames: null for a still, or one that cannot be read. */
export async function framesOf(file: Blob): Promise<Sheet | null> {
  if (typeof ImageDecoder === "undefined") return null
  let decoder: ImageDecoder | null = null
  try {
    decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type })
    await decoder.tracks.ready
    await decoder.completed
    const of = decoder.tracks.selectedTrack?.frameCount ?? 0
    if (of < 2) return null
    const lasting: number[] = []
    for (let index = 0; index < of; index++) {
      const { image } = await decoder.decode({ frameIndex: index })
      lasting.push(image.duration || UNSAID_US)
      image.close()
    }
    const picked = pickedFrames(lasting)
    const first = (await decoder.decode({ frameIndex: 0 })).image
    const sheet = sheetOf(picked.length, first.displayWidth, first.displayHeight)
    first.close()
    const canvas = new OffscreenCanvas(sheet.width, sheet.height)
    const context = canvas.getContext("2d")
    if (!context) return null
    context.fillStyle = GUTTER
    context.fillRect(0, 0, sheet.width, sheet.height)
    context.imageSmoothingQuality = "high"
    const size = Math.max(12, Math.round(sheet.h * 0.09))
    context.font = `600 ${size}px system-ui, sans-serif`
    context.textBaseline = "middle"
    for (const [place, index] of picked.entries()) {
      const x = GAP + (place % sheet.columns) * (sheet.w + GAP)
      const y = GAP + Math.floor(place / sheet.columns) * (sheet.h + GAP)
      const { image } = await decoder.decode({ frameIndex: index })
      // (a frame with parts to be seen through is on white, as it is on the board)
      context.fillStyle = "#fff"
      context.fillRect(x, y, sheet.w, sheet.h)
      context.drawImage(image, x, y, sheet.w, sheet.h)
      image.close()
      // its number, on a dark tab in its corner, to be read on any frame
      const said = String(place + 1)
      const pad = Math.round(size * 0.4)
      context.fillStyle = "rgba(0,0,0,0.75)"
      context.fillRect(
        x,
        y,
        context.measureText(said).width + pad * 2,
        size + pad
      )
      context.fillStyle = "#fff"
      context.fillText(said, x + pad, y + (size + pad) / 2)
    }
    for (const quality of QUALITIES) {
      const made = await canvas.convertToBlob({ type: "image/jpeg", quality })
      if (made.size <= MOST_BYTES)
        return {
          data: await made.arrayBuffer(),
          shown: picked.length,
          of,
          seconds:
            Math.round(lasting.reduce((sum, each) => sum + each, 0) / 1e4) /
            100,
        }
    }
    return null
  } catch {
    return null
  } finally {
    decoder?.close()
  }
}
