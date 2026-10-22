// Where a board lies in its drawing as it is made: what is drawn over the board, the
// router's work while it routes, goes by it to lie where it should. The drawing has a
// mark in it for that (see drawing.ts), which this reads, and takes out.

/** What the mark is known by in the drawing that says where the board lies in it. */
export const PLACE_MARK = "enclose-place"

/**
 * How the board's millimetres lie in a drawing of it as it is made, from its mark (see
 * `placeMark`), which is then taken out: x and y on the board come out at a·x + e and
 * d·y + f. Null where it has none. For a drawing of the board turned over (see
 * `turnedOver`), `turned` is how wide it is: the mark is drawn turned over with the rest.
 */
export function placeOf(
  svg: SVGSVGElement,
  turned: number | null = null
): { a: number; d: number; e: number; f: number } | null {
  const mark = svg.querySelector(`[data-pcb-note-line-id^="${PLACE_MARK}:"]`)
  if (!mark) return null
  const [x, y] = (mark.getAttribute("data-pcb-note-line-id") ?? "")
    .split(":")
    .slice(1)
    .map(Number)
  const at = (name: string) => Number(mark.getAttribute(name))
  const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(at)
  mark.remove()
  if (![x, y, x1, y1, x2, y2].every(Number.isFinite) || x1 === x2 || y1 === y2)
    return null
  const a = x2 - x1
  const d = y2 - y1
  const e = x1 - a * x
  const f = y1 - d * y
  return turned === null ? { a, d, e, f } : { a: -a, d, e: turned - e, f }
}
