// Which of the app's colours a part is drawn in, given what its model says of its colour.
import { PALETTE, type PaletteName } from "@shared/palette"

/**
 * The colours given in turn to things that come with none of their own, such as the
 * groups of a model that leaves colour out: each as unlike the one before as can be.
 */
const IN_TURN: PaletteName[] = [
  "blue",
  "orange",
  "green",
  "pink",
  "cyan",
  "yellow",
  "violet",
  "lime",
  "red",
  "indigo",
]

/**
 * The colour a project's circuit boards are drawn in, as the list of them pictures them.
 * In a model with a board in it, it is the boards' alone: what else would be drawn in it
 * is drawn in its stand-in, cool between the warm colours either side of it in turn, and
 * one that only a model of ten groups would be given otherwise.
 */
export const BOARD: PaletteName = "green"
const BOARD_STAND_IN: PaletteName = "indigo"

/** How little colour a colour can have, of 1, and still be one: under it, it is a grey. */
const GREY_UNDER = 0.12

/** "#rrggbb" as red, green and blue, each 0 to 1; nothing, if it is not that. */
function parts(hex: string): [number, number, number] | null {
  const found = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!found) return null
  const value = parseInt(found[1], 16)
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

/** Where round the circle of colour a colour is, in degrees; nothing, for a grey. */
function hueOf([r, g, b]: [number, number, number]): number | null {
  const most = Math.max(r, g, b)
  const spread = most - Math.min(r, g, b)
  if (spread < GREY_UNDER) return null
  const sixth =
    most === r
      ? ((g - b) / spread) % 6
      : most === g
        ? (b - r) / spread + 2
        : (r - g) / spread + 4
  return (sixth * 60 + 360) % 360
}

/** The colours that are colours, and where each is round the circle: not its greys or its white. */
const HUE_AT = (Object.keys(PALETTE) as PaletteName[]).flatMap((name) => {
  const at = hueOf(parts(PALETTE[name])!)
  return at === null ? [] : [{ name, at }]
})

/**
 * The palette's colours as they are drawn, in the light look and in the dark: the app's
 * own, or a theme's in place of some of them (see themes.ts). It is the palette's names
 * that a model gives and that are worked out below; what each is drawn in is this.
 */
let drawing: Record<"light" | "dark", Record<PaletteName, string>> = {
  light: PALETTE,
  dark: PALETTE,
}

/** Have the palette drawn in these colours, in each look. */
export function setPalettes(
  light: Record<PaletteName, string>,
  dark: Record<PaletteName, string>
) {
  drawing = { light, dark }
}

/** The palette's colours as the window is drawn now: of the look it is in. */
export function currentPalette(): Record<PaletteName, string> {
  const dark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  return drawing[dark ? "dark" : "light"]
}

/**
 * The colour a thing is drawn in. `given` is what its model says: one of the palette's
 * names, or "#rrggbb", or nothing. A name is that colour. Any other colour is drawn as
 * the colour of the palette nearest it round the circle, unless it is a grey (or white,
 * or black), which is left as it is: greys are not what the palette is for. And a thing
 * with no colour given takes the palette's colours in turn, by `turn`. `boards` is for
 * a thing in a model with a circuit board in it that is not one: what it would be drawn
 * in, were that the boards' colour, it is drawn in another.
 */
export function drawnIn(
  given: string | null,
  turn: number,
  boards = false
): string {
  const found = ofPalette(given, turn)
  if (typeof found !== "object") return found
  const name = boards && found.name === BOARD ? BOARD_STAND_IN : found.name
  return currentPalette()[name]
}

/**
 * Which of the palette's colours a thing is drawn in (see `drawnIn`); or the colour as it
 * was given, where it is drawn as it is.
 */
function ofPalette(
  given: string | null,
  turn: number
): { name: PaletteName } | string {
  if (given === null) return { name: IN_TURN[turn % IN_TURN.length] }
  const named = given.trim().toLowerCase().replace("gray", "grey")
  if (named in PALETTE) return { name: named as PaletteName }
  const colour = parts(given)
  if (!colour) return given
  const hue = hueOf(colour)
  if (hue === null) return given
  const apart = (at: number) =>
    Math.min(Math.abs(at - hue), 360 - Math.abs(at - hue))
  const nearest = HUE_AT.reduce((a, b) => (apart(b.at) < apart(a.at) ? b : a))
  return { name: nearest.name }
}
