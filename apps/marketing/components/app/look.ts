import { WINDOW } from './data'

// How the model in the window is looked at: what the page's scroll changes, and the
// view draws (view.ts). It is here, and not with the view, so that the page can say
// it without fetching three.js, which the view is drawn with.

/** How the model is looked at, and how it stands. */
export type Look = {
  /** where the eye is: round the vertical, and above the ground, in degrees */
  azimuth: number
  elevation: number
  /** how far off, in the model's own radius */
  distance: number
  /** where in the window the model's middle is, in the window's px */
  x: number
  y: number
  /** how far it is pulled apart, of what its parts say */
  apart: number
  /** how much of the ground's grid shows, and of the cables, 0 to 1 */
  grid: number
  cables: number
  /** how dark the model's shadow is on the floor, 0 to 1 (only in a studio: view.ts) */
  shadow: number
  /**
   * The group that is picked in the list of parts, shown on its own: how much of the
   * rest of the model is there, 1 to 0, and how far the eye has gone in to the group,
   * 0 to 1.
   */
  others: number
  alone: number
  /** the arm's joints, in degrees from how it is built (the jaw: from shut) */
  turn: number
  shoulder: number
  elbow: number
  wrist: number
  roll: number
  grip: number
}

/** How far open the jaw is as built, in degrees from shut. */
export const BUILT = 20

/** The model as it opens in the window: folded, at rest, seen from the app's Home. */
export const REST: Look = {
  azimuth: -51.1,
  elevation: 37,
  distance: 3.6,
  x: (WINDOW.width - WINDOW.thread) / 2,
  y: WINDOW.height / 2,
  apart: 0,
  grid: 0,
  // (the cables are more than the page needs to show)
  cables: 0,
  shadow: 0,
  others: 1,
  alone: 0,
  turn: 0,
  shoulder: 0,
  elbow: 0,
  wrist: 0,
  roll: 0,
  grip: BUILT,
}
