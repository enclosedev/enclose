// The sheets a model is drawn on: one to each of four corners it can be looked at from,
// and to each side, upright and four wide to five high, with the drawing in the middle
// of it and nothing else. And a sheet as a file, an SVG, which is what is taken away of
// it: the lines, in millimetres, to be printed as they are or opened in something that
// draws.
import type { Vec3 } from "@shared/api"
import { viewFrom, VIEWS } from "@/lib/orient"
import type { Looking, Stroke } from "./lines"

/**
 * A sheet as it stands in the row, in mm: upright, as wide as A4, and four wide to five
 * high. It is the shape of what a drawing is shown on there, small; the drawing itself
 * is on paper of its own (see PAPER), which a sheet shows all of.
 */
export const SHEET = { width: 210, height: 262.5 }
/**
 * The most paper a drawing is given, in mm: A2, on its side. A drawing is made as big as
 * fits that, to a scale drawings are made to, and its paper is then no bigger than it
 * needs: so the model is most of what is on it, and what is written round it is small
 * beside the model, as on a drawing that is pinned to a wall.
 */
export const PAPER = { width: 594, height: 420 }
/** How much of the sheet is kept clear all round a drawing, at the least, in mm. */
export const MARGIN = 15
/**
 * How wide a line is drawn, in mm: a point and a half, which on a sheet shown a pixel to
 * the point is a pixel and a half.
 */
export const LINE = (1.5 * 25.4) / 72
/** What the lines are drawn in. */
export const INK = "#000000"

/**
 * One measurement as a sheet has it (see dimensions.ts), in mm of the sheet from its top
 * left corner.
 */
export type Dimension = {
  /** its thin lines, x1 y1 x2 y2 each: the two out from the model, and the one between */
  lines: number[][]
  /** its arrowheads, each the three corners of one */
  arrows: number[][]
  /**
   * What it says and where: the middle of the foot of the figure, and how far the
   * figure is turned, in degrees the way the clock goes.
   */
  text: { said: string; x: number; y: number; turn: number }
}

/** How wide the lines of a measurement are, in mm: three quarters of a point. */
export const THIN = (0.75 * 25.4) / 72
/** How big its figures are, in mm: nine points. */
export const FIGURES = (9 * 25.4) / 72
/** What measurements are drawn in: quieter than the drawing they are of. */
export const PENCIL = "#5c5c5c"

/**
 * The name of one part as a sheet has it (see labels.ts), in mm of the sheet from its top
 * left corner: written to one side of the drawing, with a line of dots from it to the part.
 */
export type Label = {
  said: string
  /** the line from the name to the part, x y for each place along it */
  line: number[]
  /** where the line ends, which is on the part: there is a dot there */
  at: [x: number, y: number]
  /**
   * Where the name is written: the foot of the end of it that is nearer the drawing.
   * It is written away from the drawing from there, on whichever side it is.
   */
  text: { x: number; y: number; side: "left" | "right" }
}

/** How big the names of parts are written, in mm: seven points, and half bold. */
export const WRITING = (7 * 25.4) / 72
/** How far across the dot is that a name's line ends in, in mm. */
export const DOT = 0.9
/** How far it is from one dot of a name's line to the next, in mm: the line is of dots. */
export const DOTTED = 0.9

/** How far down from straight above a corner of the model is looked at from, in radians. */
const CORNER = Math.acos(1 / Math.sqrt(3))

/**
 * Where a model is drawn from, in the order of their sheets. First four of its corners,
 * each showing three sides at once, all three turned equally from the eye: from above
 * and from below, with the front and the left side, or the front and the right. They
 * are the ones that look like the thing. Then its six sides: the set views, by the
 * names they go by, each seen square on (`flat`).
 */
export const SIDES: { name: string; looking: Looking; flat: boolean }[] = [
  ...(
    [
      ["Top Left", -1, CORNER],
      ["Top Right", 1, CORNER],
      ["Bottom Left", -1, Math.PI - CORNER],
      ["Bottom Right", 1, Math.PI - CORNER],
    ] as const
  ).map(([name, side, polar]) => ({
    name,
    // an eighth of a turn round from the front, towards that side
    looking: lookingFrom({ azimuth: (side * Math.PI) / 4, polar }),
    flat: false,
  })),
  ...["Front", "Back", "Top", "Bottom", "Left", "Right"].map((name) => {
    const { axis, sign } = VIEWS.find((view) => view.name === name)!
    return { name, looking: lookingFrom(viewFrom(axis, sign)), flat: true }
  }),
]

/**
 * How the camera looks from somewhere on the sphere round the model, as directions in
 * the model's own frame: the angles are three.js's, round its vertical (the model's Z)
 * and down from straight above (see lib/orient).
 */
export function lookingFrom({
  azimuth,
  polar,
}: {
  azimuth: number
  polar: number
}): Looking {
  // in three.js's frame, which has Y up: where the eye is, and what is to its right
  const back = [
    Math.sin(polar) * Math.sin(azimuth),
    Math.cos(polar),
    Math.sin(polar) * Math.cos(azimuth),
  ]
  const right = [Math.cos(azimuth), 0, -Math.sin(azimuth)]
  const up = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ]
  // the model's +Y is three.js's -Z, and its Z three.js's Y
  const model = ([x, y, z]: number[]): Vec3 => [x, -z || 0, y]
  return { right: model(right), up: model(up), back: model(back) }
}

/** How many times smaller than life a drawing can be, or bigger: the steps drawings are made in. */
const REDUCED = [1, 2, 5]
/** The most a drawing is made bigger than life: a thousand times, as ten to this. */
const ENLARGED = -3

/**
 * How many times smaller than life drawings are, so that the largest of them fits its
 * paper and no more than fits: the least that does, of the scales drawings are made to.
 * Less than one is bigger than life, which is what a small thing is drawn. The six sides
 * of a model are all to the one scale, so that a length on one is that length on the
 * next; and so are its four corners, which take more room and are not for measuring.
 */
export function reduction(
  sizes: { width: number; height: number }[],
  /** how much of the paper is kept clear of a drawing, at either side and at top and foot */
  clear: { x: number; y: number } = { x: MARGIN, y: MARGIN },
  /** the most paper there is for one */
  within: { width: number; height: number } = PAPER
): number {
  const most = Math.max(
    0,
    ...sizes.map(({ width, height }) =>
      Math.max(
        width / (within.width - 2 * clear.x),
        height / (within.height - 2 * clear.y)
      )
    )
  )
  if (!(most > 0)) return 1
  for (let tens = ENLARGED; ; tens++)
    for (const step of REDUCED) {
      // (ten to a power that is not whole comes out a hair off: said as one over the other)
      const by = tens < 0 ? step / 10 ** -tens : step * 10 ** tens
      if (by >= most) return by
    }
}

/** A scale as it is written: "1:2", or "5:1" of what is drawn bigger than life. */
export const scaleSaid = (by: number) =>
  by >= 1 ? `1:${by}` : `${Math.round(1 / by)}:1`

/** Where a drawing sits on its sheet: what of the model is at the sheet's middle, and the scale. */
export type Placing = {
  /** the middle of what is drawn, in the model's own measure, as it is looked at */
  middle: [x: number, y: number]
  /** how many times smaller than life it is drawn */
  by: number
  /**
   * The paper it is drawn on, in mm: no bigger than the drawing needs, with what is
   * said round it. Or, of one shown by itself, paper as big as the view has room for
   * (see Blueprint).
   */
  paper?: { width: number; height: number }
}

/** The paper a drawing is on, in mm: a sheet, unless it says otherwise. */
export const paperOf = (placing: Placing) => placing.paper ?? SHEET

/** The room a drawing takes up as one side sees it, in the model's own measure. */
export type Seen = { x0: number; x1: number; y0: number; y1: number }

/**
 * Where the drawing of each side sits on its paper, by the room each takes up, in the
 * order of the sides: in the middle of it, the sides to one scale and the corners to
 * one. `clear` is how much of the paper is kept clear of a drawing at its edges, and
 * the paper is the drawing and that much round it: or as tall as `tall` says, where
 * what is written beside the drawing needs more.
 */
export function placed(
  seen: Seen[],
  clear: { x: number; y: number } = { x: MARGIN, y: MARGIN },
  tall: number[] = []
): Placing[] {
  const scales = [true, false].map((flat) =>
    reduction(
      seen
        .filter((_, index) => SIDES[index].flat === flat)
        .map((room) => ({
          width: room.x1 - room.x0,
          height: room.y1 - room.y0,
        })),
      clear
    )
  )
  return seen.map((room, index) => {
    const by = scales[SIDES[index].flat ? 0 : 1]
    return {
      middle: [(room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2],
      by,
      paper: {
        width: (room.x1 - room.x0) / by + 2 * clear.x,
        height: Math.min(
          PAPER.height,
          Math.max((room.y1 - room.y0) / by + 2 * clear.y, tall[index] ?? 0)
        ),
      },
    }
  })
}

/** A point of a drawing as it falls on the sheet, in mm from its top left corner. */
export function onSheet(
  x: number,
  y: number,
  placing: Placing
): [number, number] {
  const { middle, by } = placing
  const paper = paperOf(placing)
  return [
    paper.width / 2 + (x - middle[0]) / by,
    paper.height / 2 - (y - middle[1]) / by,
  ]
}

/** A part's lines, as they go into a file: under the part's name. */
export type Drawn = { id: string; label: string; strokes: Stroke[] }

/** A number as a file has it: to the thousandth of a millimetre, and no longer than it need be. */
const short = (n: number) => String(Math.round(n * 1000) / 1000)

const escaped = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Names for the file's own use, each of them no other's: what a program that opens the
 * file shows its layers by.
 */
function named() {
  const taken = new Set<string>()
  return (wanted: string) => {
    const base =
      wanted.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^(?![A-Za-z_])/, "_") ||
      "_"
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base}_${n}`
    taken.add(name)
    return name
  }
}

/**
 * A drawing as an SVG, in mm and the size of its paper, with the lines of each part
 * together under the part's name, and the parts of each group together under the
 * group's. Nothing is filled in, and there is no paper in it: only the lines.
 */
export function svgOf(sheet: {
  /** what the file says it is of */
  title: string
  placing: Placing
  /** the groups of the model, with the parts of each that have any lines to show */
  groups: { id: string; label: string; parts: Drawn[] }[]
  /** what the sheet says of how big the model is, if it says */
  dimensions?: Dimension[]
  /** the names of the parts, each beside the drawing with a line to its part, if they are there */
  labels?: Label[]
}): string {
  const name = named()
  const paper = paperOf(sheet.placing)
  const [wide, high] = [short(paper.width), short(paper.height)]
  const out = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wide}mm" height="${high}mm" viewBox="0 0 ${wide} ${high}">`,
    `<title>${escaped(sheet.title)}</title>`,
    `<g fill="none" stroke="${INK}" stroke-width="${short(LINE)}" stroke-linecap="round" stroke-linejoin="round">`,
  ]
  for (const group of sheet.groups) {
    const parts = group.parts.filter((part) => part.strokes.length > 0)
    if (parts.length === 0) continue
    out.push(
      `<g id="${name(group.id)}">`,
      `<title>${escaped(group.label)}</title>`
    )
    for (const part of parts) {
      out.push(
        `<g id="${name(part.id)}">`,
        `<title>${escaped(part.label)}</title>`
      )
      for (const stroke of part.strokes)
        out.push(`<path d="${pathOf(stroke, sheet.placing)}"/>`)
      out.push(`</g>`)
    }
    out.push(`</g>`)
  }
  out.push(`</g>`)
  if (sheet.dimensions?.length) {
    out.push(
      `<g id="${name("dimensions")}" fill="none" stroke="${PENCIL}" stroke-width="${short(THIN)}" stroke-linecap="round">`
    )
    for (const { lines, arrows, text } of sheet.dimensions) {
      const drawn = lines
        .map(
          ([x1, y1, x2, y2]) =>
            `M${short(x1)} ${short(y1)}L${short(x2)} ${short(y2)}`
        )
        .join("")
      const heads = arrows
        .map(
          ([x1, y1, x2, y2, x3, y3]) =>
            `M${short(x1)} ${short(y1)}L${short(x2)} ${short(y2)}L${short(x3)} ${short(y3)}Z`
        )
        .join("")
      const turned = text.turn
        ? ` transform="rotate(${short(text.turn)} ${short(text.x)} ${short(text.y)})"`
        : ""
      out.push(
        `<g>`,
        `<path d="${drawn}"/>`,
        `<path d="${heads}" fill="${PENCIL}" stroke="none"/>`,
        `<text x="${short(text.x)}" y="${short(text.y)}"${turned} text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${short(FIGURES)}" fill="${PENCIL}" stroke="none">${escaped(text.said)}</text>`,
        `</g>`
      )
    }
    out.push(`</g>`)
  }
  if (sheet.labels?.length) {
    out.push(
      `<g id="${name("labels")}" fill="none" stroke="${PENCIL}" stroke-width="${short(THIN)}" stroke-linecap="round" stroke-linejoin="round">`
    )
    for (const { said, line, at, text } of sheet.labels) {
      let path = ""
      for (let i = 0; i + 1 < line.length; i += 2)
        path += `${i === 0 ? "M" : "L"}${short(line[i])} ${short(line[i + 1])}`
      out.push(
        `<g>`,
        `<title>${escaped(said)}</title>`,
        `<path d="${path}" stroke-dasharray="0 ${short(DOTTED)}"/>`,
        `<circle cx="${short(at[0])}" cy="${short(at[1])}" r="${short(DOT / 2)}" fill="${PENCIL}" stroke="none"/>`,
        `<text x="${short(text.x)}" y="${short(text.y)}" text-anchor="${text.side === "left" ? "end" : "start"}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${short(WRITING)}" font-weight="600" fill="${PENCIL}" stroke="none">${escaped(said)}</text>`,
        `</g>`
      )
    }
    out.push(`</g>`)
  }
  out.push(`</svg>`, ``)
  return out.join("\n")
}

/** A stroke as the path of it on the sheet. */
export function pathOf(stroke: Stroke, placing: Placing): string {
  let path = ""
  for (let i = 0; i + 1 < stroke.points.length; i += 2) {
    const [x, y] = onSheet(stroke.points[i], stroke.points[i + 1], placing)
    path += `${i === 0 ? "M" : "L"}${short(x)} ${short(y)}`
  }
  return stroke.closed ? `${path}Z` : path
}
