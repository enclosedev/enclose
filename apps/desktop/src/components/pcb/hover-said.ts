// What is said, beside the pointer, of what it is over on a board in 3D: a part, by its
// name and what it is; a pad, by the names its pin has; a hole, by how big it is drilled;
// a trace, by what it is and how long. As the technical view says them (inspecting.tsx),
// in a line, and under it a quieter one where there is more to say.
import { holeSaid, mmSaid, type Under } from "./inspect"
import type { BoardPart } from "./parts"

/** What is said of something: its line, and a quieter one under it, if any. */
export type Said = { title: string; detail: string | null }

/** What each part on the board is, by its name there ("U1"): from the list of its parts. */
export const titlesOf = (parts: BoardPart[]) =>
  new Map(parts.flatMap((part) => part.names.map((name) => [name, part.title])))

/** A part, by its name on the board, and what it is where that is known. */
export const partSaid = (name: string, titles: Map<string, string>): Said => ({
  title: name,
  detail: titles.get(name) ?? null,
})

/** What is under the pointer on the board, said: null where there is nothing to say. */
export function underSaid(
  under: Under,
  titles: Map<string, string>
): Said | null {
  if (under.kind === "pad") {
    const part = under.part?.name ?? null
    if (under.pad.names.length > 0)
      return {
        title: under.pad.names.join(", "),
        detail: part ? (titles.get(part) ?? null) : null,
      }
    return part ? partSaid(part, titles) : { title: "Pad", detail: null }
  }
  if (under.kind === "hole")
    return { title: holeSaid(under.hole), detail: null }
  if (under.kind === "trace")
    return {
      title: under.trace.name ?? "Trace",
      detail: mmSaid(under.trace.length),
    }
  return under.part.name ? partSaid(under.part.name, titles) : null
}
