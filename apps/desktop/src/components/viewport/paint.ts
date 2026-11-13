// What colour a part is drawn in: the same in the view and in the small pictures of the
// parts list.
import * as THREE from "three"

import { BOARD, drawnIn } from "@/lib/palette"
import type { LoadedPart, Skin } from "./load"

/** Bare metal that is given no colour. */
const UNCOLOURED = "#aeb2b9"
// near-black metal would vanish on the dark theme; it goes steel instead
const STEEL = "#aab0b8"
export const EDGE = "#0e1012"
/** What a clear part is drawn in when no colour is given it: no colour, as glass has none. */
const CLEAR = "#ffffff"

/**
 * The colour of one of a part's skins. It is one of the app's own colours (see
 * shared/palette.ts): the one the user gave the part, or the one the model names, or the
 * nearest to the colour the model or its file gives, or, if none gives any, the one that
 * falls to the part's group. Metal is the exception, unless the user gave it a colour:
 * it is the colour of its metal. So is a circuit board: it is the boards' green, which no
 * other part in a model with one in it is drawn in.
 */
export function skinColour(
  { part, turn, boards }: Pick<LoadedPart, "part" | "turn" | "boards">,
  skin: Pick<Skin, "color">,
  dark: boolean,
  /** the colour the user has given the part, if they have given it one */
  chosen: string | null = null,
  /** the look whose palette it is in: the window's, unless another is asked for */
  look?: "light" | "dark"
): THREE.Color {
  // (one picked by hand is drawn as it was picked; one of the palette's as the palette is)
  if (chosen)
    return new THREE.Color(
      chosen.startsWith("#") ? chosen : drawnIn(chosen, turn, false, look)
    )
  const ofFile =
    part.paint === "bare" && skin.color ? `#${skin.color.getHexString()}` : null
  // what the file colours on a board is what is on it, not the board
  if (part.board)
    return new THREE.Color(drawnIn(ofFile ?? BOARD, turn, false, look))
  // what is clear has no colour but one it was given: its group's is not its own
  if (part.clear && !part.color) return new THREE.Color(CLEAR)
  if (part.metal) {
    const color = new THREE.Color(ofFile ?? part.color ?? UNCOLOURED)
    if (dark && color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.25) color.set(STEEL)
    return color
  }
  return new THREE.Color(drawnIn(ofFile ?? part.color, turn, boards, look))
}

/** How a part's surface takes the light. */
export const finish = ({ part }: Pick<LoadedPart, "part">) => ({
  metalness: part.metal ? 0.55 : 0.1,
  roughness: part.metal ? 0.45 : 0.62,
})

/**
 * What a picture of a part by itself comes out as, in a word, beyond its meshes: which
 * way it is turned where it stands (and not where that is, since the picture is closed
 * in on the part wherever it is), what colour each of its skins is drawn in and how its
 * surface takes the light, and the theme it is drawn for (see thumbnails.ts).
 */
export function drawingOf(
  part: Pick<LoadedPart, "part" | "skins" | "turn" | "boards" | "home">,
  dark: boolean,
  /** the colour the user has given it, if they have */
  chosen: string | undefined
): string {
  const { metalness, roughness } = finish(part)
  return [
    part.home.elements.slice(0, 11).join(),
    part.skins
      .map((skin) => skinColour(part, skin, dark, chosen).getHexString())
      .join(),
    metalness,
    roughness,
    dark,
  ].join(" ")
}
