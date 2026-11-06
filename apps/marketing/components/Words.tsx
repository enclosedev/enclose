import { Fragment } from 'react'

/**
 * Words, each in a box of its own, so that each can be shown by itself (the headings
 * are seen a word at a time as they come into view: pages/home/headings.ts). The spaces
 * between them are left as they are, so the lines break where they did; and where the
 * text has a new line, the line is broken there (on a wide screen: showcase.scss).
 */
export function Words({ children }: { children: string }) {
  return (
    <>
      {children.split('\n').map((line, at) => (
        <Fragment key={at}>
          {/* (and a space, for where the line is not broken) */}
          {at > 0 && (
            <>
              {' '}
              <br className="break" />
            </>
          )}
          {line
            .split(/\s+/)
            .filter(Boolean)
            .map((word, index) => (
              <Fragment key={index}>
                {index > 0 && ' '}
                <span className="word">{word}</span>
              </Fragment>
            ))}
        </Fragment>
      ))}
    </>
  )
}
