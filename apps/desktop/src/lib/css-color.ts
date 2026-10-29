import * as React from "react"
import * as THREE from "three"

import type { PaletteName } from "@shared/palette"
import {
  PCB_SLOTS,
  takesAlpha,
  type PcbColours,
  type SlotId,
} from "@shared/theme-format"
import { currentPalette } from "./palette"

// The theme's tokens are oklch(), which THREE.Color can't parse. A 2D canvas can:
// paint the colour and read the pixel back.
let ctx: CanvasRenderingContext2D | null = null

/** A colour as CSS gives one, as its red, green, blue and how much of it shows, 0 to 255. */
function pixelOf(css: string): number[] {
  if (!ctx) {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    ctx = canvas.getContext("2d", { willReadFrequently: true })
  }
  if (!ctx) return [136, 136, 136, 255]
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  return [...ctx.getImageData(0, 0, 1, 1).data]
}

function resolve(css: string): THREE.Color {
  const [r, g, b] = pixelOf(css)
  return new THREE.Color().setRGB(
    r / 255,
    g / 255,
    b / 255,
    THREE.SRGBColorSpace
  )
}

/** A colour as CSS gives one (oklch(), a name, a var() that has been read), as "#rrggbb". */
export const hexOf = (css: string) => `#${resolve(css).getHexString()}`

/** Likewise, with how much of it shows as well, as "#rrggbbaa": "#rrggbb" if all of it. */
export function hexaOf(css: string): string {
  const [r, g, b, a] = pixelOf(css)
  const hex = (part: number) => part.toString(16).padStart(2, "0")
  return `#${[r, g, b].map(hex).join("")}${a === 255 ? "" : hex(a)}`
}

/** What a theme colours, as what has this style has it (see takesAlpha). */
export const slotColourOf = (
  style: CSSStyleDeclaration,
  { id, token }: { id: SlotId; token: string }
) => (takesAlpha(id) ? hexaOf : hexOf)(style.getPropertyValue(token).trim())

/** A circuit board's colours in PCB mode, as what has this style has them. */
export const pcbColoursOf = (style: CSSStyleDeclaration) =>
  Object.fromEntries(
    PCB_SLOTS.map((slot) => [slot.id, slotColourOf(style, slot)])
  ) as PcbColours

export type ThemeColors = {
  /** what the view is drawn over: the window's own colour behind it */
  backdrop: THREE.Color
  foreground: THREE.Color
  muted: THREE.Color
  destructive: THREE.Color
  /** what the surfaces of a picked part turn */
  picked: THREE.Color
  /** the plane a model is cut open along */
  section: THREE.Color
  /** the model's three axes */
  axes: { x: THREE.Color; y: THREE.Color; z: THREE.Color }
  /** the palette's colours, as the theme the window is in has them in its look */
  palette: Record<PaletteName, string>
  /** a circuit board's, in PCB mode, likewise */
  pcb: PcbColours
  dark: boolean
}

function read(): ThemeColors {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => resolve(style.getPropertyValue(name).trim())
  return {
    backdrop: token("--sidebar"),
    foreground: token("--foreground"),
    muted: token("--muted-foreground"),
    destructive: token("--destructive"),
    picked: token("--selection-fill"),
    section: token("--section"),
    axes: { x: token("--axis-x"), y: token("--axis-y"), z: token("--axis-z") },
    palette: currentPalette(),
    pcb: pcbColoursOf(style),
    dark: document.documentElement.classList.contains("dark"),
  }
}

/**
 * The theme's colours as THREE.Colors, re-read whenever light/dark flips, or the window
 * is put into another theme (see themes.ts).
 */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = React.useState(read)
  React.useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })
    return () => observer.disconnect()
  }, [])
  return colors
}
