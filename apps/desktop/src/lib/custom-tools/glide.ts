// A number on its way somewhere, as a well-made machine would take it there: off from
// rest gently, up to its pace, and gently to rest again where it was going, with no
// start or stop that could be seen as one, and never past the place.
//
// It is what a machine's own controller does. Where the number is to be (which may
// jump, as when a button is pressed, or wander, as a slider does under a hand) is
// averaged over the time just gone, and that average averaged, and that again. The
// first makes of a jump a move at one pace; the second gives the pace a rise and a
// fall; the third rounds those off. So a jump comes out as a move that takes the whole
// of the time and no longer, and a number that wanders is followed half that time
// behind. Being averages, what comes out is never beyond where it was told to be; and
// several numbers told to go at once, in the same time, get there together.

/** How many times over it is averaged: what rounds a move off at both ends. */
const TIMES = 3
/**
 * How fast the time a move takes may itself change, in seconds a second: a move under
 * way that is given another time comes round to it, and does not jump.
 */
const COMING_ROUND = 2

/** What something did for a while: went from one value to another, in so many seconds. */
type Piece = { from: number; to: number; lasted: number }

/** What something has been over the time just gone, to say what it was on average. */
class Averaged {
  /** the latest last */
  private pieces: Piece[] = []
  /** what it was before any of those */
  private before: number
  /** what it was last */
  private last: number
  /** it has been the one value for the whole of the time last looked over */
  still = true

  constructor(from: number) {
    this.before = from
    this.last = from
  }

  /**
   * It has come to `value` over `dt` seconds more: what it has been over the last
   * `span`. Between one frame and the next it is taken to have gone evenly, which is
   * what makes the answer the same however often the frames come.
   */
  next(value: number, dt: number, span: number): number {
    this.pieces.push({ from: this.last, to: value, lasted: dt })
    this.last = value
    let left = span
    let sum = 0
    let least = value
    let most = value
    let kept = this.pieces.length
    for (let index = this.pieces.length - 1; index >= 0 && left > 0; index--) {
      const { from, to, lasted } = this.pieces[index]
      const counted = Math.min(left, lasted)
      // of a piece that is only partly within the time, the later part
      const began = to - (to - from) * (counted / lasted)
      sum += (counted * (began + to)) / 2
      left -= counted
      least = Math.min(least, began, to)
      most = Math.max(most, began, to)
      kept = index
    }
    if (kept > 0) {
      this.before = this.pieces[kept - 1].to
      this.pieces.splice(0, kept)
    }
    if (left > 0) {
      sum += left * this.before
      least = Math.min(least, this.before)
      most = Math.max(most, this.before)
    }
    // At rest it is where it was told to be, to the last figure; and on the way it is
    // never beyond anywhere it was told to be, by however little.
    this.still = least === most
    if (this.still || span <= 0) return value
    return Math.max(least, Math.min(most, sum / span))
  }
}

/** A number on its way to where it is told to be. */
export class Glide {
  private stages: Averaged[]
  private at: number
  /** how long a move takes just now, in seconds */
  private seconds: number

  /** It starts at rest, where it is first told to be. */
  constructor(to: number, seconds: number) {
    this.stages = Array.from({ length: TIMES }, () => new Averaged(to))
    this.at = to
    this.seconds = seconds
  }

  /** Where it is, without any time having gone by. */
  now(): number {
    return this.at
  }

  /** Whether it is at rest where it was told to be, and not on its way there. */
  resting(): boolean {
    return this.stages.every((stage) => stage.still)
  }

  /** Where it is `dt` seconds on, told to be at `to` in `seconds` from when it is told. */
  next(to: number, dt: number, seconds: number): number {
    if (dt <= 0) return this.at
    const change = this.resting() ? Infinity : COMING_ROUND * dt
    this.seconds += Math.max(-change, Math.min(change, seconds - this.seconds))
    const span = this.seconds / TIMES
    this.at = this.stages.reduce(
      (value, stage) => stage.next(value, dt, span),
      to
    )
    return this.at
  }
}
