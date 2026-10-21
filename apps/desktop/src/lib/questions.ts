// What Claude asks before it goes on, as an answer is given to it in the conversation:
// one of the answers it offered, an answer of one's own, or (where a question takes
// several) any number of them together.

import type { Question } from "@shared/api"

/** What has been said to one question so far: the answers picked, and one written. */
export type Said = { picked: string[]; written: string }

export const NOTHING: Said = { picked: [], written: "" }

/** One of a question's answers was clicked. */
export function pick(question: Question, said: Said, label: string): Said {
  if (!question.several) return { picked: [label], written: "" }
  const had = said.picked.includes(label)
  return {
    ...said,
    picked: question.options
      .map((option) => option.label)
      .filter((one) => (one === label ? !had : said.picked.includes(one))),
  }
}

/** An answer of one's own was written to a question. */
export function write(question: Question, said: Said, written: string): Said {
  const instead = !question.several && written.trim() !== ""
  return { picked: instead ? [] : said.picked, written }
}

/** What that comes to, as Claude is told it. Nothing, if nothing was said. */
export function answerOf(said: Said): string {
  return [...said.picked, said.written.trim()].filter(Boolean).join(", ")
}
