// How a guide's parts stand at each place along it.
//
// A guide is gone through from before its first step to after its last, and where that
// has got to is one number: -1 is the thing whole, as it is shown before anything is
// begun; each whole number from 0 is that step done, counted from the first; and the
// number of steps is the thing finished. Between two of them a step is under way: its
// parts are on their way in. So what the page draws is all told by that number, and
// going back through a guide is the same as going on through it, the other way.
//
// A step is seen with what it is done to and nothing else: the thing itself, as far as
// it has got, or something that is made up apart before it goes on (see
// shared/assembly-format.ts). So a part is not only on or not yet: in each step it is
// out of sight, on already, or what the step puts on. Where one step is done to another
// thing than the step before, what was seen goes and what is to be seen comes, and
// then the step's parts come in.
import { scenesOf, type Guide } from "@shared/assembly-format"

/** How a part is in one step: out of sight, on already, or what the step puts on. */
export type Stand = "away" | "on" | "coming"

/**
 * How the parts of a guide are in each of its steps, by id; and of each step, whether
 * it is done to another thing than the one before it, so that what is seen changes.
 * (That has one more than there are steps: the last is for the thing finished, which
 * is the thing itself.)
 */
export function stoodIn(guide: Pick<Guide, "already" | "steps">): {
  stands: Map<string, Stand[]>
  cuts: boolean[]
} {
  const scenes = scenesOf(guide)
  const stands = new Map<string, Stand[]>()
  const of = (id: string) => {
    let one = stands.get(id)
    if (!one) stands.set(id, (one = scenes.map((): Stand => "away")))
    return one
  }
  for (const id of guide.already) of(id)
  scenes.forEach(({ there, coming }, index) => {
    for (const id of there) of(id)[index] = "on"
    for (const id of coming) of(id)[index] = "coming"
  })
  const subs = [...guide.steps.map((step) => step.sub), null]
  return {
    stands,
    cuts: subs.map((sub, index) => index > 0 && sub !== subs[index - 1]),
  }
}

/** How one part stands: all of these from 0 to 1. */
export type Standing = {
  /** how much of it is there to be seen: nothing, of a part that has not come yet */
  there: number
  /** how far it still is from its place: 1 where it comes from, 0 in place */
  out: number
  /** how much it is lit, as what the step under way is about */
  lit: number
  /** how much it is in its own colour, as the thing is before the steps and after them */
  own: number
}

/** How much of the way from the thing whole to the first step the whole is still seen for. */
const WHOLE_GOES = 0.4
/** How much of a step what was seen goes over, and what is to be seen comes, where the step is done to another thing. */
const CHANGES = 0.3
/** How much of a part's way in it takes to be all there. */
const APPEARS = 0.3
/** How much of the next step a part stays lit into, going out. */
const DIMS = 0.6

const clamp = (n: number) => Math.min(1, Math.max(0, n))
/** Evenly from 0 at `from` to 1 at `to`, setting off slowly and arriving slowly. */
function smooth(n: number, from: number, to: number): number {
  const share = clamp((n - from) / (to - from))
  return share * share * (3 - 2 * share)
}
/** Quick away, and slow into place: how a part is put on. */
const settle = (share: number) => 1 - (1 - share) ** 3

/**
 * How a part stands with the guide at `at`. `stands` is how it is in each step, counted
 * from 0, and `cuts` says which of the steps are done to another thing than the one
 * before (see `stoodIn`).
 */
export function standing(
  at: number,
  stands: Stand[],
  cuts: boolean[] = []
): Standing {
  const steps = stands.length
  const whole = at < 0 ? 1 - smooth(at + 1, 0, WHOLE_GOES) : 0
  const own = Math.max(whole, smooth(at, steps - 1, steps))
  // the step it is at, or last left, and how far on it is to the one after: whole, the
  // thing has every part on
  const last = Math.min(steps, Math.max(-1, Math.floor(at)))
  const share = clamp(at - last)
  const was = stands[last] ?? "on"
  const will = stands[last + 1] ?? "on"
  if (share === 0)
    return {
      there: was === "away" ? 0 : 1,
      out: 0,
      lit: was === "coming" ? 1 : 0,
      own,
    }
  // What is seen changes on the way to the first step, which the whole goes before,
  // and to a step done to another thing: what was there and is not to be goes, and
  // what is to be there comes.
  const changes = last < 0 ? WHOLE_GOES : cuts[last + 1] ? CHANGES : 0
  const going = changes > 0 ? 1 - smooth(share, 0, changes) : 0
  const dims = was === "coming" ? 1 - smooth(share, 0, DIMS) : 0
  if (will === "coming") {
    // on its way in, once what was seen has gone: its own self too, where it was there
    const coming = clamp((share - changes) / (1 - changes))
    return {
      there: Math.max(was === "away" ? 0 : going, smooth(coming, 0, APPEARS)),
      out: coming > 0 ? 1 - settle(coming) : 0,
      lit: last < 0 || was === "coming" || coming > 0 ? 1 : 0,
      own,
    }
  }
  if (will === "on")
    return { there: was === "away" ? 1 - going : 1, out: 0, lit: dims, own }
  return { there: was === "away" ? 0 : going, out: 0, lit: dims, own }
}

/**
 * Where the guide is, a moment on from `at`, on its way to `to`: a step takes `takes`
 * seconds, and what is further off than a step is gone to faster, by as much as it is
 * further, so that a guide gone through at a run keeps up.
 */
export function towards(
  at: number,
  to: number,
  seconds: number,
  takes: number
): number {
  const left = to - at
  if (left === 0) return to
  const by = (seconds / takes) * Math.max(1, Math.abs(left))
  return Math.abs(left) <= by ? to : at + Math.sign(left) * by
}
