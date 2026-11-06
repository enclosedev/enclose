import { Fragment } from 'react'

/**
 * Words, each in a box of its own, so that each can be shown by itself (the headings
 * are seen a word at a time as they come into view: pages/home/headings.ts). The spaces
 * between them are left as they are, so the lines break where they did.
 */
export function Words({ children }: { children: string }) {
  const words = children.split(/\s+/).filter(Boolean)
  return (
    <>
      {words.map((word, index) => (
        <Fragment key={index}>
          {index > 0 && ' '}
          <span className="word">{word}</span>
        </Fragment>
      ))}
    </>
  )
}
