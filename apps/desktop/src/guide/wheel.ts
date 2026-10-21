// How a wheel goes through a guide's steps: one step to a turn of it, however far it is
// turned.
//
// A step is gone to, and the wheel then not heard for a while. After that it has to be
// turned afresh: a trackpad goes on saying it is turned for a good while after the
// fingers have left it, each time by a little less, and that is no asking for the step
// after. (A mouse's wheel says the same each click: that is afresh too.)

/**
 * How long the wheel is not heard for once a step is gone to, ms; how long it has to
 * have been still to be turned afresh; the least it is turned by to be a turn at all,
 * in px; and what a mouse's wheel says at each click, at the least.
 */
export const WHEEL = { rests: 480, still: 140, least: 4, click: 50 }

type Turned = Pick<WheelEvent, "deltaX" | "deltaY" | "timeStamp">

/**
 * What hears a wheel. It is told each time the wheel says it is turned, and says
 * whether that asks for a step: the one after, the one before, or neither.
 */
export function wheelHeard(): (event: Turned) => "on" | "back" | null {
  /** when a step was last gone to, when the wheel was last heard, and by how much */
  const wheel = { turned: -Infinity, heard: -Infinity, by: 0 }
  return (event) => {
    const by = Math.abs(event.deltaY)
    const afresh =
      event.timeStamp - wheel.heard > WHEEL.still ||
      by > wheel.by * 1.4 + 2 ||
      (by === wheel.by && by >= WHEEL.click)
    wheel.heard = event.timeStamp
    wheel.by = by
    if (by < WHEEL.least || Math.abs(event.deltaX) > by) return null
    if (event.timeStamp - wheel.turned < WHEEL.rests || !afresh) return null
    wheel.turned = event.timeStamp
    return event.deltaY > 0 ? "on" : "back"
  }
}
