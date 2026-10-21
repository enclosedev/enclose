// What the user has chosen about how the view answers the hand, and how the window lays
// out what it shows. These are the window's own, kept in its storage; what the app's own
// process has to know (where new projects go) is kept by that process instead.
import { create } from "zustand"

import { SETTLE_DAYS } from "@/lib/conversations"
import { PRESETS, type Buttons, type Drag } from "@/lib/navigation"

/** auto: told apart by how the scroll moves. Or always the one, or always the other. */
export type Scrolling = "auto" | "trackpad" | "wheel"

/**
 * What stays where it is as the view is turned: what the camera looks at, in the middle
 * of the view; the middle of what is picked out; or the place on the model that was
 * under the pointer as the turn began.
 */
export type Pivot = "view" | "selection" | "pointer"

/** What a length is said in: millimetres, or inches. */
export type Unit = "mm" | "in"

/** What the model's files are saved as: STEP, for CAD; or a mesh, STL or OBJ. */
export type Format = "step" | "stl" | "obj"

export type Preferences = Buttons & {
  /** what a scroll is taken to come from */
  scrolling: Scrolling
  /** how fast the view turns under the hand, against the speed it comes with */
  turnSpeed: number
  /** and how fast it zooms */
  zoomSpeed: number
  /** a wheel zooms the other way round: out where it zoomed in */
  wheelReversed: boolean
  /** a turn stops straight above the model and straight below, and does not go on over */
  upright: boolean
  /** what the view turns about */
  pivot: Pivot
  /** how many days a conversation is left alone before it goes under its project's card */
  settleDays: number
  /** while Claude thinks, the conversation says about how many tokens it has thought */
  thinkingTokens: boolean
  /** what the lengths written on a blueprint are in */
  units: Unit
  /** a file that is saved has the day before its name: 2026_10_11_table-clock.step */
  datedFiles: boolean
  /** what the model's files are saved as, as last chosen where they are downloaded */
  format: Format
}

export const TURN_SPEED = { min: 0.4, max: 2.5 }
// (at 100% a zoom goes at three times the camera controls' own pace: at the least, at
// about a third of theirs)
export const ZOOM_SPEED = { min: 0.1, max: 2.5 }
const DEFAULTS: Preferences = {
  scrolling: "auto",
  ...PRESETS.enclose,
  turnSpeed: 1,
  zoomSpeed: 1,
  wheelReversed: false,
  upright: false,
  pivot: "view",
  settleDays: SETTLE_DAYS.initial,
  thinkingTokens: false,
  units: "mm",
  datedFiles: true,
  format: "step",
}
const KEY = "enclose:preferences"

const isDrag = (read: unknown): read is Drag =>
  read === "turn" || read === "pan" || read === "zoom"
/** A speed that was kept, within what it may be: or the speed it comes with. */
const speed = (read: unknown, { min, max }: { min: number; max: number }) =>
  typeof read === "number" && Number.isFinite(read)
    ? Math.min(max, Math.max(min, read))
    : 1

function saved(): Preferences {
  try {
    const read = JSON.parse(
      localStorage.getItem(KEY) ?? "{}"
    ) as Partial<Preferences>
    const scrolling =
      read.scrolling === "trackpad" || read.scrolling === "wheel"
        ? read.scrolling
        : DEFAULTS.scrolling
    const settleDays =
      typeof read.settleDays === "number" && Number.isInteger(read.settleDays)
        ? Math.min(SETTLE_DAYS.max, Math.max(SETTLE_DAYS.min, read.settleDays))
        : DEFAULTS.settleDays
    return {
      scrolling,
      middle: isDrag(read.middle) ? read.middle : DEFAULTS.middle,
      right:
        read.right === "turn" || read.right === "pan"
          ? read.right
          : DEFAULTS.right,
      shift: isDrag(read.shift) ? read.shift : DEFAULTS.shift,
      ctrl: isDrag(read.ctrl) ? read.ctrl : DEFAULTS.ctrl,
      turnSpeed: speed(read.turnSpeed, TURN_SPEED),
      zoomSpeed: speed(read.zoomSpeed, ZOOM_SPEED),
      wheelReversed: read.wheelReversed === true,
      upright: read.upright === true,
      pivot:
        read.pivot === "selection" || read.pivot === "pointer"
          ? read.pivot
          : DEFAULTS.pivot,
      settleDays,
      thinkingTokens: read.thinkingTokens === true,
      units: read.units === "in" ? "in" : DEFAULTS.units,
      datedFiles: read.datedFiles !== false,
      format:
        read.format === "stl" || read.format === "obj"
          ? read.format
          : DEFAULTS.format,
    }
  } catch {
    return DEFAULTS
  }
}

export const usePreferences = create<
  Preferences & { change(patch: Partial<Preferences>): void }
>()((set, get) => ({
  ...saved(),
  change(patch) {
    set(patch)
    const kept = Object.fromEntries(
      Object.entries(get()).filter(([key]) => key in DEFAULTS)
    )
    localStorage.setItem(KEY, JSON.stringify(kept))
  },
}))
