// The Enclose mark, and how it moves: the model's three axes as a camera sees them, as the
// brand draws it. The drawing and the moves are the brand's own (enclose-brand: lib/mark.ts,
// lib/glyphs.ts, lib/motion.ts): the mark with the numbers of its preset 2026-10-09-3, as
// its app icon has it and in one colour, and the moves as its preset 2026-10-06-6 sets them.

export type Axis = "x" | "y" | "z"

/** Where the mark is seen from: round the vertical, then above or below the ground. */
export type View = { azimuth: number; elevation: number }

/**
 * The mark's measures, in its own units: it reaches `EXTENT` from its middle, whichever
 * way it is turned. An axis is a line to the end it points to, and to the end it points
 * away from a row of dots as wide as that line is thick, about `gap` apart. Both ends
 * have a dot, `dot` in radius.
 *
 * The mark letters nothing. The letters measured here are for wherever the axes are
 * named, the widget in the corner of the view for one: a letter's height is a share of
 * the dot it stands on; its strokes, and the uprights its diagonals start and end with,
 * are shares of that height.
 */
export const MARK = {
  length: 45,
  weight: 3,
  gap: 3.75,
  dot: 5,
  labelSize: 0.4,
  labelWeight: 0.14,
  labelRise: 0.3,
}
export const EXTENT = MARK.length + MARK.dot

/**
 * Where it rests, and where its icon has it: the isometric view from below, the six dots
 * evenly round the middle, the ends the axes point to at the top and to either side below.
 */
export const REST: View = { azimuth: -135, elevation: -35.26 }

/**
 * How wide the mark is at rest, as a share of the square it turns in (which is `EXTENT`
 * either way from the middle): there the dots stand at the corners of a hexagon, a
 * point up, and it is narrower across than the square by this much.
 */
export const RESTING_WIDTH =
  (MARK.length *
    Math.cos((REST.elevation * Math.PI) / 180) *
    Math.cos(Math.PI / 6) +
    MARK.dot) /
  EXTENT

/**
 * Tumbling, as it is while something is waited for: round and over at once, and
 * smoothly, the seconds a whole turn of each takes. Neither a share of the other, so it
 * turns on all its axes together, and back as it began every `TUMBLE.home` seconds.
 */
export const TUMBLE = { around: 2.4, over: 3.6, home: 7.2 }

/** Where the tumbling mark is seen from, `seconds` after it set off from `start`. */
export function tumbling(start: View, seconds: number): View {
  return {
    azimuth: start.azimuth + (360 * seconds) / TUMBLE.around,
    elevation: start.elevation + (360 * seconds) / TUMBLE.over,
  }
}

const AXES: Axis[] = ["x", "y", "z"]
const RADIANS = Math.PI / 180

/**
 * The six ends of the axes on the page, one unit long before they are foreshortened,
 * with y running down. A parallel projection: each end exactly opposite its other.
 * Furthest first, so the nearer ends are drawn over them.
 */
export function ends({ azimuth, elevation }: View) {
  const turn = azimuth * RADIANS
  const lift = elevation * RADIANS
  // the page's right and up, and the way to the camera, in the model's frame
  const right = [-Math.sin(turn), Math.cos(turn), 0]
  const up = [
    -Math.cos(turn) * Math.sin(lift),
    -Math.sin(turn) * Math.sin(lift),
    Math.cos(lift),
  ]
  const toward = [
    Math.cos(turn) * Math.cos(lift),
    Math.sin(turn) * Math.cos(lift),
    Math.sin(lift),
  ]
  return AXES.flatMap((axis, index) =>
    ([1, -1] as const).map((sign) => ({
      axis,
      sign,
      x: sign * right[index],
      y: -sign * up[index],
      depth: sign * toward[index],
    }))
  ).sort((a, b) => a.depth - b.depth)
}

/**
 * The half of an axis that runs to the end it points away from, as the dots it is broken
 * into: how far each is from the middle, in the mark's units, the outermost first. `seen`
 * is how much of its length the axis keeps on the page, from 1 flat on to 0 pointing at
 * the camera.
 *
 * The dots are set out along the axis as it is when seen flat on: as many as come nearest
 * the gap asked for, with the gaps then evened out so that the row is whole. Seen at an
 * angle, the row is squeezed into what is left of the axis. So the dots are as many
 * however the mark is turned, and none slides in or out as it turns.
 */
export function beads(seen: number): number[] {
  // a dot is as wide as the line is thick
  const width = MARK.weight
  const flat = MARK.length - MARK.dot
  const left = seen * MARK.length - MARK.dot
  // what the dots and the gaps between them have to share: from the edge of the dot at
  // the end to the round end the lines have in the middle
  const room = flat - width / 2
  // nothing is left of an axis that points at the camera, nor of one its dot all but covers
  if (left <= 0 || room <= width) return []
  const count = Math.min(
    Math.floor(room / width),
    Math.max(1, Math.round((room - MARK.gap) / (MARK.gap + width)))
  )
  const gap = (room - count * width) / (count + 1)
  const squeeze = left / flat
  return Array.from(
    { length: count },
    (_, index) => (flat - gap - width / 2 - index * (gap + width)) * squeeze
  )
}

// --- the letters ----------------------------------------------------------------------

// Drawn rather than set in a typeface: single strokes of one thickness, where every
// diagonal starts and ends with a short upright before it turns. Each letter is the
// lines its strokes run along, in a box `h` tall with its top left at the origin; `s`
// is how thick they are drawn, and `rise` how long the uprights are.

type Point = [x: number, y: number]

/** All three are as wide: this share of their height. */
export const LETTER_WIDTH = 0.8

const LETTERS: Record<Axis, (h: number, s: number, rise: number) => Point[][]> =
  {
    x(h, s, rise) {
      const left = s / 2
      const right = LETTER_WIDTH * h - s / 2
      return [
        [
          [left, 0],
          [left, rise],
          [right, h - rise],
          [right, h],
        ],
        [
          [right, 0],
          [right, rise],
          [left, h - rise],
          [left, h],
        ],
      ]
    },
    y(h, s, rise) {
      const left = s / 2
      const right = LETTER_WIDTH * h - s / 2
      const middle = (LETTER_WIDTH * h) / 2
      // the arms meet the stem half way down, and both carry on down it
      return [
        [
          [left, 0],
          [left, rise],
          [middle, h / 2],
          [middle, h],
        ],
        [
          [right, 0],
          [right, rise],
          [middle, h / 2],
          [middle, h],
        ],
      ]
    },
    z(h, s, rise) {
      const left = s / 2
      const right = LETTER_WIDTH * h - s / 2
      const top = s / 2
      const bottom = h - s / 2
      // the uprights hang from the bars, so they cannot be shorter than the bars are thick
      const turn = Math.max(rise, top)
      return [
        [
          [0, top],
          [right, top],
          [right, turn],
          [left, h - turn],
          [left, bottom],
          [LETTER_WIDTH * h, bottom],
        ],
      ]
    },
  }

const n = (value: number) => String(Math.round(value * 100) / 100)

/**
 * The path of an axis' letter, `height` tall with its middle at (cx, cy), to be drawn
 * `stroke` thick with square ends and sharp corners.
 */
export function letter(
  axis: Axis,
  cx: number,
  cy: number,
  height: number,
  stroke: number,
  rise: number
): string {
  const left = cx - (LETTER_WIDTH * height) / 2
  const top = cy - height / 2
  return LETTERS[axis](height, stroke, rise)
    .map((line) =>
      line
        .map(([x, y]) => `${n(left + x)} ${n(top + y)}`)
        // an upright can come out with no length: a corner through the same point
        // twice is no corner at all
        .filter((point, index, points) => point !== points[index - 1])
        .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
        .join("")
    )
    .join("")
}
