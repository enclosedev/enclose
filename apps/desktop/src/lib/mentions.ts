// What a message can call on by name as it is written: a part of the model with @, a
// skill of Claude Code's with $, and one of its commands with / at the very start.

import type { ThreadItem } from "@shared/api"

/** The three kinds of thing a message calls on, and the mark each is written with. */
export type Calling = "part" | "skill" | "command"
export const MARK: Record<Calling, string> = {
  part: "@",
  skill: "$",
  command: "/",
}
const KIND: Record<string, Calling> = {
  "@": "part",
  $: "skill",
  "/": "command",
}

/** A name being written: which kind, where it stands in the text, and what there is of it. */
export type Token = {
  kind: Calling
  /** where its mark is, and where the name ends so far */
  from: number
  to: number
  /** the name as far as it has been written, without the mark */
  query: string
}

/** What a name may be made of: Claude Code's are words joined by - : . and _ */
const NAMED = /^[\w:.-]*$/

/**
 * The name the caret is at the end of, if it is in one: a mark at the start of a word
 * (and for a command, at the start of the message) with nothing but a name after it.
 */
export function tokenAt(text: string, caret: number): Token | null {
  let from = caret
  while (from > 0 && !/\s/.test(text[from - 1])) from--
  const kind = KIND[text[from]]
  if (!kind || from >= caret) return null
  if (kind === "command" && from !== 0) return null
  const query = text.slice(from + 1, caret)
  if (!NAMED.test(query)) return null
  let to = caret
  while (to < text.length && !/\s/.test(text[to])) to++
  return { kind, from, to, query }
}

/** The text with a name put where one was being written, and where the caret goes. */
export function putIn(text: string, token: Token, name: string) {
  const before = text.slice(0, token.from) + MARK[token.kind] + name
  const after = text.slice(token.to)
  const rest = after.startsWith(" ") ? after : ` ${after}`
  return { text: before + rest, caret: before.length + 1 }
}

/** Something to choose from: what it goes by, and what else it can be found by. */
type Named = { name: string; also?: string }

/**
 * Those of a list that what has been written could be: the ones that begin with it
 * first, then the ones with a word in them that does, then the ones that only hold it.
 */
export function matching<T extends Named>(list: T[], query: string): T[] {
  const wanted = query.toLowerCase()
  if (!wanted) return list
  const rank = (item: T) => {
    const names = [item.name, item.also ?? ""].map((name) => name.toLowerCase())
    if (names.some((name) => name.startsWith(wanted))) return 0
    if (
      names.some((name) =>
        name.split(/[\s:._-]+/).some((w) => w.startsWith(wanted))
      )
    )
      return 1
    return names.some((name) => name.includes(wanted)) ? 2 : 3
  }
  return list
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .filter((row) => row.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.item)
}

/** A stretch of a message: plain words, or a name that calls on something. */
export type Stretch = { text: string; kind: Calling | null }

// a mark at the start of a word, then a name that begins with a letter: not "$5", "a@b"
const CALLED = /(^|\s)([@$][A-Za-z][\w:.-]*)/g
const LEADING = /^\/[A-Za-z][\w:.-]*/

/** A message as it was sent, cut into plain words and the names in it. */
export function stretches(text: string): Stretch[] {
  const found: { from: number; to: number; kind: Calling }[] = []
  const command = LEADING.exec(text)
  if (command) found.push({ from: 0, to: command[0].length, kind: "command" })
  for (const match of text.matchAll(CALLED)) {
    const from = match.index + match[1].length
    // a name ends with a letter or a number: the full stop after it is the sentence's
    const name = match[2].replace(/[:.-]+$/, "")
    found.push({ from, to: from + name.length, kind: KIND[name[0]] })
  }
  const out: Stretch[] = []
  let at = 0
  for (const { from, to, kind } of found) {
    if (from > at) out.push({ text: text.slice(at, from), kind: null })
    out.push({ text: text.slice(from, to), kind })
    at = to
  }
  if (at < text.length) out.push({ text: text.slice(at), kind: null })
  return out
}

/** Those of some parts that a message does not yet call on by name. */
export function notCalledOn(text: string, ids: string[]): string[] {
  // a name ends with a letter or a number: what follows it is the sentence's
  const named = new Set(
    text.split(/\s+/).map((word) => word.replace(/[^\w]+$/, ""))
  )
  return ids.filter((id) => !named.has(MARK.part + id))
}

/** A message with parts called on by name ahead of what it says: those it does not name. */
export function callingOn(text: string, ids: string[]): string {
  const names = notCalledOn(text, ids).map((id) => MARK.part + id)
  return [...names, text].filter(Boolean).join(" ")
}

/**
 * The parts a message that was sent is about, by id: the ones something was said of,
 * each with the rest of its piece where it was said of that; those of the whole objects
 * it calls on; and the ones it calls on by name. Each of them once.
 */
export function partsOf(
  message: Extract<ThreadItem, { kind: "user" }>
): string[] {
  const said = [message.part, ...(message.notes ?? []).map((note) => note.part)]
  const called = stretches(message.text).flatMap((stretch) =>
    stretch.kind === "part" ? [stretch.text.slice(MARK.part.length)] : []
  )
  return [
    ...new Set([
      // (a part of a circuit board is none of the model's)
      ...said.flatMap((part) =>
        part && !part.board ? [part.id, ...(part.piece?.parts ?? [])] : []
      ),
      ...(message.objects ?? []).flatMap((one) => one.parts),
      ...called,
    ]),
  ]
}
