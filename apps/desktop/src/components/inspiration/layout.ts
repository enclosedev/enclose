// Where the pictures of an inspiration board lie, and how they move: where a new one is
// put, how a group lies in its pile and how it spreads out, and how what is in the way
// is pushed aside when a picture is gone up to or a group spread out. All of it in the
// board's own units, which are pixels while the board is seen at its own size.
import type {
  InspirationGroup,
  InspirationImage,
} from "@shared/inspiration-format"

/** A box on the board: where its middle is, and how wide and tall it is. */
export type Box = { x: number; y: number; w: number; h: number }

/** How tall a picture is on the board, for how wide it is there. */
export const heightOf = (pixels: [number, number], width: number) =>
  (width * pixels[1]) / pixels[0]

/** The box a picture lies in, where it lies by itself. */
export const boxOf = (image: InspirationImage): Box => ({
  x: image.at[0],
  y: image.at[1],
  w: image.width,
  h: heightOf(image.pixels, image.width),
})

/** Whether two boxes cover any of each other, kept `gap` apart. */
export const overlaps = (a: Box, b: Box, gap = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap &&
  Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap

/** The box round all of these: null for none. */
export function boundsOf(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.x - box.w / 2))
  const right = Math.max(...boxes.map((box) => box.x + box.w / 2))
  const top = Math.min(...boxes.map((box) => box.y - box.h / 2))
  const bottom = Math.max(...boxes.map((box) => box.y + box.h / 2))
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    w: right - left,
    h: bottom - top,
  }
}

const clamp = (value: number, least: number, most: number) =>
  Math.min(most, Math.max(least, value))

/**
 * About how much of the board a new picture covers, in square units: whatever its shape,
 * so that a tall one and a wide one look alike in weight.
 */
const NEW_AREA = 300 * 260
/** How much a new picture's size is let vary, either way, for the board not to look ruled. */
const VARY = 0.16

/** How wide a new picture is on the board, by its shape: `random` is from 0 to 1. */
export function widthFor(pixels: [number, number], random: number): number {
  const aspect = pixels[0] / pixels[1]
  const plain = Math.sqrt(NEW_AREA * aspect)
  return Math.round(clamp(plain * (1 - VARY + 2 * VARY * random), 170, 520))
}

/** How far apart pictures put on the board are kept, at the least. */
export const GAP = 28
/** How far each try at a place for a new picture is from the last, outwards. */
const STEP = 46
/** The angle between one try and the next: the golden one, so that they spread evenly. */
const TURN = Math.PI * (3 - Math.sqrt(5))

/**
 * Where new pictures go: as near a place as there is room, each where it covers nothing
 * on the board (`taken`) nor any other new one, kept a little apart, and not quite in
 * rows. The first that fits round the place, out along a spiral; `random` gives what
 * each is moved off it by, from 0 to 1.
 */
export function placed(
  taken: Box[],
  sizes: { w: number; h: number }[],
  around: [number, number],
  random: () => number
): [number, number][] {
  const there = [...taken]
  return sizes.map(({ w, h }) => {
    for (let tries = 0; tries < 4000; tries++) {
      const out = STEP * Math.sqrt(tries)
      const angle = tries * TURN
      const jitter = tries === 0 ? 0 : STEP * 0.6
      const box = {
        x: around[0] + out * Math.cos(angle) + (random() - 0.5) * jitter,
        y: around[1] + out * Math.sin(angle) * 0.8 + (random() - 0.5) * jitter,
        w,
        h,
      }
      if (there.some((other) => overlaps(box, other, GAP))) continue
      there.push(box)
      return [Math.round(box.x), Math.round(box.y)]
    }
    // (a board as full as that has room further out than any of it)
    const all = boundsOf(there)!
    const box = { x: all.x + all.w / 2 + w / 2 + GAP, y: all.y, w, h }
    there.push(box)
    return [Math.round(box.x), Math.round(box.y)]
  })
}

/** How wide each picture of a group is in its pile. */
export const PILE_WIDTH = 300
/** How many of a pile's pictures show their edges: the rest lie under them, out of sight. */
const SHOWN_IN_PILE = 4
/** How each of the pictures that show lies, off the one on top, and how far it is turned. */
const LAID: { dx: number; dy: number; turn: number }[] = [
  { dx: 0, dy: 0, turn: 0 },
  { dx: -34, dy: 14, turn: -3.5 },
  { dx: 30, dy: 22, turn: 3 },
  { dx: -10, dy: -18, turn: 1.5 },
]

/**
 * How each picture of a group lies in its pile, the first on top: how far off the
 * middle of the pile, and how far turned, in degrees. Those under the first few lie
 * under the last of them.
 */
export function pileOf(
  count: number
): { dx: number; dy: number; turn: number }[] {
  return Array.from(
    { length: count },
    (_, index) => LAID[Math.min(index, SHOWN_IN_PILE - 1)]
  )
}

/** How tall the pictures of a group stand once it is spread out, and how far apart. */
const SPREAD_HEIGHT = 240
const SPREAD_GAP = 24

/**
 * A group spread out: its pictures in rows about where its pile lies, each as tall as
 * the rest and as wide as its shape has it, the rows about as wide as they are tall
 * all told, and each row in the middle under the one before.
 */
export function spreadOf(
  images: { pixels: [number, number] }[],
  at: [number, number]
): Box[] {
  if (images.length === 0) return []
  const widths = images.map(
    ({ pixels }) => (SPREAD_HEIGHT * pixels[0]) / pixels[1]
  )
  const total = widths.reduce((all, width) => all + width + SPREAD_GAP, 0)
  // about square: as wide as the rows it makes are tall, together
  const across = Math.max(
    Math.max(...widths),
    Math.sqrt(total * (SPREAD_HEIGHT + SPREAD_GAP)) * 1.25
  )
  const rows: number[][] = [[]]
  let used = 0
  widths.forEach((width, index) => {
    const row = rows.at(-1)!
    if (row.length > 0 && used + width > across) {
      rows.push([index])
      used = width + SPREAD_GAP
    } else {
      row.push(index)
      used += width + SPREAD_GAP
    }
  })
  const tall = rows.length * SPREAD_HEIGHT + (rows.length - 1) * SPREAD_GAP
  const boxes: Box[] = []
  rows.forEach((row, line) => {
    const wide =
      row.reduce((all, index) => all + widths[index], 0) +
      (row.length - 1) * SPREAD_GAP
    let left = at[0] - wide / 2
    const y =
      at[1] - tall / 2 + line * (SPREAD_HEIGHT + SPREAD_GAP) + SPREAD_HEIGHT / 2
    for (const index of row) {
      boxes[index] = {
        x: left + widths[index] / 2,
        y,
        w: widths[index],
        h: SPREAD_HEIGHT,
      }
      left += widths[index] + SPREAD_GAP
    }
  })
  return boxes
}

/** How tall a row of pictures is, about, once the board is organized. */
const ROW_HEIGHT = 260
/** And the most a row is let be made taller than that, for it to be as wide as the rest. */
const ROW_STRETCH = 1.6

/**
 * What is laid in rows when the board is organized: a picture, which is made as big as
 * its row has room for, by its shape (how wide it is for how tall), or a pile, which is
 * as big as it is. Each as the box it takes now.
 */
export type Shelved = { id: string; box: Box; aspect?: number }

/** These in the order they are read in: along each band of the board, top to bottom. */
const readOrder = (items: Shelved[]) =>
  [...items].sort(
    (a, b) =>
      Math.round(a.box.y / ROW_HEIGHT) - Math.round(b.box.y / ROW_HEIGHT) ||
      a.box.x - b.box.x
  )

/**
 * The board organized: everything in rows, in the order it is read in now, from where
 * what is on the board begins, top left. The piles first, in rows of their own, as big
 * as they are; then the pictures, each row as wide as the rest and its pictures all
 * one height, about ROW_HEIGHT (but the last row, which is left as short as it is). All
 * told, about as wide as `aspect` (width for height) has it, for it to fit the view.
 * Gives each one's middle, and how wide it is.
 */
export function organized(
  items: Shelved[],
  aspect: number
): Map<string, { at: [number, number]; width: number }> {
  const out = new Map<string, { at: [number, number]; width: number }>()
  const bounds = boundsOf(items.map((item) => item.box))
  if (!bounds) return out
  const piles = readOrder(items.filter((item) => item.aspect === undefined))
  const pictures = readOrder(items.filter((item) => item.aspect !== undefined))
  const natural = pictures.map((item) => ROW_HEIGHT * item.aspect!)

  // as wide as the whole, with the gaps, is for its height as the view is
  const area =
    natural.reduce(
      (sum, width) => sum + (width + GAP) * (ROW_HEIGHT + GAP),
      0
    ) +
    piles.reduce(
      (sum, pile) => sum + (pile.box.w + GAP) * (pile.box.h + GAP),
      0
    )
  const across = Math.max(
    Math.sqrt(area * aspect),
    ...natural,
    ...piles.map((pile) => pile.box.w)
  )
  const left = bounds.x - bounds.w / 2
  let top = bounds.y - bounds.h / 2

  // the piles, as many to a row as fit
  let x = left
  let tallest = 0
  for (const pile of piles) {
    if (x > left && x + pile.box.w > left + across) {
      top += tallest + GAP
      x = left
      tallest = 0
    }
    out.set(pile.id, {
      at: [Math.round(x + pile.box.w / 2), Math.round(top + pile.box.h / 2)],
      width: pile.box.w,
    })
    x += pile.box.w + GAP
    tallest = Math.max(tallest, pile.box.h)
  }
  if (piles.length > 0) top += tallest + GAP

  // the pictures, a row at a time: full where one more would not fit, with it or
  // without it, whichever leaves the row nearer the height it is meant to be
  const rows: { members: number[]; full: boolean }[] = []
  let row: number[] = []
  let wide = 0
  const rowHeight = (count: number, sum: number) =>
    (ROW_HEIGHT * (across - (count - 1) * GAP)) / sum
  natural.forEach((width, index) => {
    if (row.length === 0 || wide + width + row.length * GAP <= across) {
      row.push(index)
      wide += width
      return
    }
    const without = rowHeight(row.length, wide)
    const withIt = rowHeight(row.length + 1, wide + width)
    if (Math.abs(withIt - ROW_HEIGHT) < Math.abs(without - ROW_HEIGHT)) {
      rows.push({ members: [...row, index], full: true })
      row = []
      wide = 0
    } else {
      rows.push({ members: row, full: true })
      row = [index]
      wide = width
    }
  })
  if (row.length > 0) rows.push({ members: row, full: false })

  for (const { members, full } of rows) {
    const sum = members.reduce((sum, index) => sum + natural[index], 0)
    const height = full
      ? Math.min(rowHeight(members.length, sum), ROW_HEIGHT * ROW_STRETCH)
      : ROW_HEIGHT
    let at = left
    for (const index of members) {
      const width = Math.round((natural[index] * height) / ROW_HEIGHT)
      out.set(pictures[index].id, {
        at: [Math.round(at + width / 2), Math.round(top + height / 2)],
        width,
      })
      at += width + GAP
    }
    top += height + GAP
  }
  return out
}

/**
 * How far each of these is moved to be out of the way of a place being cleared, by
 * what it is known by: straight out from the middle of the place, as far as it takes to
 * be `margin` clear of it. What is clear of it already is not moved, and is not in what
 * comes back.
 */
export function pushedAside(
  items: { id: string; box: Box }[],
  clear: Box,
  margin: number
): Map<string, [number, number]> {
  const moved = new Map<string, [number, number]>()
  items.forEach(({ id, box }, index) => {
    if (!overlaps(box, clear, margin)) return
    let dx = box.x - clear.x
    let dy = box.y - clear.y
    // right on the middle: out at an angle of its own, so that two do not go together
    if (Math.hypot(dx, dy) < 1) {
      dx = Math.cos(index * TURN)
      dy = Math.sin(index * TURN)
    }
    const length = Math.hypot(dx, dy)
    const ux = dx / length
    const uy = dy / length
    // out until it is clear across, or up and down: whichever comes first
    const reachX = (clear.w + box.w) / 2 + margin
    const reachY = (clear.h + box.h) / 2 + margin
    const tx =
      Math.abs(ux) > 1e-6
        ? (reachX - Math.abs(box.x - clear.x)) / Math.abs(ux)
        : Infinity
    const ty =
      Math.abs(uy) > 1e-6
        ? (reachY - Math.abs(box.y - clear.y)) / Math.abs(uy)
        : Infinity
    const t = Math.max(0, Math.min(tx, ty))
    moved.set(id, [ux * t, uy * t])
  })
  return moved
}

/**
 * Which of these a box drawn across the board takes in: those wholly within it, or,
 * drawn from right to left, any it so much as touches (as a box drawn across the view of
 * the model does).
 */
export function takenIn(
  drawn: Box,
  items: { id: string; box: Box }[],
  touching: boolean
): string[] {
  return items
    .filter(({ box }) =>
      touching
        ? overlaps(box, drawn)
        : Math.abs(box.x - drawn.x) + box.w / 2 <= drawn.w / 2 &&
          Math.abs(box.y - drawn.y) + box.h / 2 <= drawn.h / 2
    )
    .map(({ id }) => id)
}

/** How the board is looked at: the place in the middle of the view, and how near. */
export type Camera = { x: number; y: number; zoom: number }

/** How far out the board can be seen, and how far in: as much of a unit as a pixel shows. */
export const ZOOM = { least: 0.05, most: 6 }

/** How much of the view is kept clear at each edge, for what floats over the board, px. */
export type Edges = { top: number; right: number; bottom: number; left: number }

/**
 * The camera that shows the whole of a box in what the edges leave of a view, so much of
 * it filled (`fill`), and never nearer than `nearest`.
 */
export function fitting(
  box: Box,
  view: { width: number; height: number },
  edges: Edges,
  fill: number,
  nearest = 1
): Camera {
  const width = Math.max(1, view.width - edges.left - edges.right)
  const height = Math.max(1, view.height - edges.top - edges.bottom)
  const zoom = clamp(
    Math.min(
      (width * fill) / Math.max(box.w, 1),
      (height * fill) / Math.max(box.h, 1),
      nearest
    ),
    ZOOM.least,
    ZOOM.most
  )
  // what the edges leave is off the middle of the view, by half what they differ
  return {
    x: box.x - (edges.left - edges.right) / 2 / zoom,
    y: box.y - (edges.top - edges.bottom) / 2 / zoom,
    zoom,
  }
}

/** Where on the board a place in the view is, by its pixels from the view's top left. */
export const onBoard = (
  camera: Camera,
  view: { width: number; height: number },
  px: number,
  py: number
): [number, number] => [
  camera.x + (px - view.width / 2) / camera.zoom,
  camera.y + (py - view.height / 2) / camera.zoom,
]

/**
 * The camera zoomed by so much on a place in the view, which stays where it is under the
 * pointer, as far as the camera can go.
 */
export function zoomedOn(
  camera: Camera,
  view: { width: number; height: number },
  by: number,
  px: number,
  py: number
): Camera {
  const zoom = clamp(camera.zoom * by, ZOOM.least, ZOOM.most)
  const [x, y] = onBoard(camera, view, px, py)
  return {
    x: x - (px - view.width / 2) / zoom,
    y: y - (py - view.height / 2) / zoom,
    zoom,
  }
}

/** The pictures of a group, in the order the board has them: the first is on top of its pile. */
export const picturesOf = (
  images: InspirationImage[],
  group: InspirationGroup
) => images.filter((image) => image.group === group.id)
