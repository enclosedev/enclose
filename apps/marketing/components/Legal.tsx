import type { ReactNode } from 'react'
import { Footer } from '../shell/Footer'

/**
 * A page of terms, or of what the project is: its name, when it was last changed (where
 * that matters), and what it says. Each thing in
 * its column comes in after the one before when the page is come to
 * (transitions/default.ts).
 */
export function Legal({
  page,
  title,
  updated,
  children,
}: {
  /** the page's folder, which its root is named for */
  page: string
  title: string
  updated?: string
  children: ReactNode
}) {
  return (
    <main className={`${page} legal`}>
      <article className="legal__text">
        <h1>
          Enclose <span>{title}</span>
        </h1>
        {updated && <p className="legal__updated">Last updated {updated}</p>}
        {children}
      </article>
      <Footer />
    </main>
  )
}
