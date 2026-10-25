// A picture on its way onto a message: whether what was pasted, dropped or picked is
// one, and the picture made fit to be kept, which is no bigger than an agent takes.

import { MOST_BYTES, MOST_SIDE, PICTURE_TYPES } from "@shared/pictures"

/** Whether a file says it is a picture. */
export const isPicture = (file: Blob) => file.type.startsWith("image/")

/** A picture as it is kept: of a kind every agent takes, and what is in its file. */
export type Fitted = { mimeType: string; data: ArrayBuffer }

/** How good a photo that had to be made smaller is kept, the best first. */
const QUALITIES = [0.9, 0.75]

/**
 * A picture made fit to be kept. One that is of a kind an agent takes (or of `kinds`,
 * where only some of those will do), and no bigger than it takes, is kept as it is. Any
 * other is drawn again, smaller where it has to be: a photo as a photo, and anything
 * else (a drawing, a screenshot) as it is, sharp, unless that comes to too much. One the
 * window cannot read (HEIC, TIFF) is drawn again by the system first, where it can be.
 * Null where it cannot be read as a picture at all.
 */
export async function fitted(
  file: Blob,
  kinds: Record<string, string> = PICTURE_TYPES
): Promise<Fitted | null> {
  const fit = await fittedHere(file, kinds)
  if (fit !== undefined) return fit
  const drawn = await window.cad?.pictures
    .redrawn({
      name: file instanceof File ? file.name : "",
      mimeType: file.type,
      data: await file.arrayBuffer(),
    })
    .catch(() => null)
  if (!drawn) return null
  return (
    (await fittedHere(new Blob([drawn.data], { type: drawn.mimeType }), kinds)) ??
    null
  )
}

/** A picture made fit to be kept, as `fitted` says: undefined where the window cannot read it. */
async function fittedHere(
  file: Blob,
  kinds: Record<string, string>
): Promise<Fitted | null | undefined> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    const read = await image.decode().then(
      () => true,
      () => false
    )
    if (!read) return undefined
    const { naturalWidth: width, naturalHeight: height } = image
    if (width === 0 || height === 0) return null
    const longest = Math.max(width, height)
    if (file.type in kinds && file.size <= MOST_BYTES && longest <= MOST_SIDE)
      return { mimeType: file.type, data: await file.arrayBuffer() }

    const scale = Math.min(1, MOST_SIDE / longest)
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale))
    )
    const context = canvas.getContext("2d")
    if (!context) return null
    context.imageSmoothingQuality = "high"
    if (file.type !== "image/jpeg") {
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const sharp = await canvas.convertToBlob({ type: "image/png" })
      if (sharp.size <= MOST_BYTES)
        return { mimeType: sharp.type, data: await sharp.arrayBuffer() }
    }
    // a photo has nothing to be seen through: what was is drawn on white
    context.globalCompositeOperation = "copy"
    context.fillStyle = "#fff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.globalCompositeOperation = "source-over"
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of QUALITIES) {
      const photo = await canvas.convertToBlob({ type: "image/jpeg", quality })
      if (photo.size <= MOST_BYTES)
        return { mimeType: photo.type, data: await photo.arrayBuffer() }
    }
    return null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** How big a file is, as it is said to someone: "486 KB", "1.2 MB". */
export function sizeOf(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 999_500) return `${Math.round(bytes / 1000)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
