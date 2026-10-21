// What a drawing says of which part is which: the name of each part that shows, written
// to one side of the drawing, with a line of dots from it to the part that ends in a
// bigger dot on one of the part's own lines. The way a diagram in a manual has them.
// (Or of each piece of a model that is pulled apart into its pieces, which are what it
// is seen to be made of then: see Blueprint.)
//
// The names stand in two columns, one at either side of the sheet, each as near the
// height of its part as the others leave it room to be: so the lines to the parts are
// short, and seldom cross. A name is on the side its part is on, and a part in the
// middle of the drawing on whichever side has fewer. A sheet with the names on it keeps
// more of its width clear of the drawing than one without, which is where they go.
import type { Stroke } from "./lines"
import {
  MARGIN,
  onSheet,
  paperOf,
  WRITING,
  type Label,
  type Placing,
} from "./sheet"

/** How wide a column of names can be, at the most, in mm: a longer name is cut short. */
const COLUMN = 40
/** And how wide it is at the least, however short the names. */
const NARROW = 12
/** How far in from the edge of the sheet a column begins. */
const EDGE = 5
/**
 * How far a drawing is kept from the column beside it: and with the model's size said
 * round it too, which is said in that room.
 */
const GAP = { plain: 5, measured: 17 }
/** How far in from the top and the foot of the sheet the names keep. */
const ENDS = 10
/** How far it is from the foot of one name to the foot of the next under it. */
const PITCH = WRITING * 1.5
/** How tall a capital of the names is. */
const CAPITAL = 0.727 * WRITING
/**
 * How wide a letter is taken to be, as a share of how big it is written: on the wide
 * side of what one comes to, since what opens the file sets the names in its own letters.
 */
const LETTER = 0.58
/** How far a name's line begins from the name, and how far it goes level before it turns to the part. */
const BESIDE = 1.5
const LEVEL = 3
/** How near the middle of the sheet a part is that is on neither side of the drawing. */
const MIDDLE = 3

/** How wide the columns are for these names: as wide as the longest of them, within bounds. */
export function columnFor(names: string[]): number {
  const longest = Math.max(0, ...names.map((name) => name.length))
  return Math.min(COLUMN, Math.max(NARROW, longest * LETTER * WRITING))
}

/** How tall paper has to be for this many names to be written on it, half of them in each column. */
export const heightFor = (names: number) =>
  names > 0 ? 2 * ENDS + CAPITAL + (Math.ceil(names / 2) - 1) * PITCH : 0

/** How much of a sheet's width is kept clear of the drawing at either side, with names in columns this wide. */
export const clearFor = (column: number, measured: boolean) =>
  Math.max(MARGIN, EDGE + column + (measured ? GAP.measured : GAP.plain))

/** A name as there is room to write it: cut short, where it is longer than the column is wide. */
function fitted(name: string, column: number): string {
  const most = Math.max(2, Math.floor(column / (LETTER * WRITING)))
  return name.length <= most ? name : `${name.slice(0, most - 1).trimEnd()}…`
}

/**
 * Feet of names in one column, each as near where it would be as the rest leave it room:
 * on paper this high.
 */
function stacked(wanted: number[], height: number): number[] {
  const top = ENDS + CAPITAL
  const foot = height - ENDS
  const at = [...wanted]
  for (let i = 0; i < at.length; i++)
    at[i] = Math.max(at[i], i === 0 ? top : at[i - 1] + PITCH)
  for (let i = at.length - 1; i >= 0; i--)
    at[i] = Math.min(at[i], i === at.length - 1 ? foot : at[i + 1] - PITCH)
  return at
}

/**
 * The names of the parts on a sheet: `parts` are the ones drawn, each with its lines as
 * the sheet's side has them, and a part with no line to show has no name there. Where
 * there are more than the sheet has room to name, the smallest are left unnamed.
 */
export function labelsOf(
  parts: { label: string; strokes: Stroke[] }[],
  placing: Placing,
  column: number
): Label[] {
  type Shown = {
    label: string
    left: [number, number]
    right: [number, number]
    middle: [number, number]
    across: number
  }
  const shown: Shown[] = []
  for (const { label, strokes } of parts) {
    let left: [number, number] | null = null
    let right: [number, number] | null = null
    let top = Infinity
    let bottom = -Infinity
    for (const { points } of strokes)
      for (let i = 0; i + 1 < points.length; i += 2) {
        const at = onSheet(points[i], points[i + 1], placing)
        if (!left || at[0] < left[0]) left = at
        if (!right || at[0] > right[0]) right = at
        top = Math.min(top, at[1])
        bottom = Math.max(bottom, at[1])
      }
    if (!left || !right) continue
    shown.push({
      label,
      left,
      right,
      middle: [(left[0] + right[0]) / 2, (top + bottom) / 2],
      across: Math.hypot(right[0] - left[0], bottom - top),
    })
  }

  const paper = paperOf(placing)
  const rows = Math.floor((paper.height - 2 * ENDS - CAPITAL) / PITCH) + 1
  const named =
    shown.length <= 2 * rows
      ? shown
      : [...shown].sort((a, b) => b.across - a.across).slice(0, 2 * rows)

  // A part is named on the side of the drawing it is on, and one in the middle of it on
  // whichever side has fewer names so far: gone through from the top, so that parts
  // one over another are named turn about.
  const centre = paper.width / 2
  const sides: Record<"left" | "right", Shown[]> = { left: [], right: [] }
  const between: Shown[] = []
  for (const part of named)
    if (part.middle[0] < centre - MIDDLE) sides.left.push(part)
    else if (part.middle[0] > centre + MIDDLE) sides.right.push(part)
    else between.push(part)
  between.sort((a, b) => a.middle[1] - b.middle[1])
  for (const part of between)
    (sides.left.length <= sides.right.length ? sides.left : sides.right).push(
      part
    )
  // and no more on a side than it has room for: those nearest the other go over to it
  for (const [full, other] of [
    ["left", "right"],
    ["right", "left"],
  ] as const)
    while (sides[full].length > rows) {
      sides[full].sort((a, b) => a.middle[0] - b.middle[0])
      sides[other].push(
        full === "left" ? sides.left.pop()! : sides.right.shift()!
      )
    }

  const labels: Label[] = []
  for (const side of ["left", "right"] as const) {
    const out = side === "left" ? -1 : 1
    const edge = side === "left" ? EDGE + column : paper.width - EDGE - column
    const ordered = sides[side]
      .map((part) => ({ part, at: part[side] }))
      .sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0])
    // each name level with where its line ends, as near as may be
    const feet = stacked(
      ordered.map(({ at }) => at[1] + CAPITAL / 2),
      paper.height
    )
    ordered.forEach(({ part, at }, index) => {
      const level = feet[index] - CAPITAL / 2
      const from = edge - out * BESIDE
      labels.push({
        said: fitted(part.label, column),
        line: [from, level, from - out * LEVEL, level, at[0], at[1]],
        at,
        text: { x: edge, y: feet[index], side },
      })
    })
  }
  return labels
}
