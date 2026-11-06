import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Group } from '../../pages/home/features'
import { Words } from '../Words'
import { SCENES } from './scenes'
import './showcase.scss'

// (as the page is put together in the browser: on the server, a plain effect, which
// does nothing there)
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** How many times the row of cards is laid out end to end, the real one in the middle. */
const ROUNDS = 3
/** Which card is in the middle to begin with: the second, with one either side of it. */
const FIRST = 1

/**
 * A group of what Enclose does: what it is, in a paragraph, and a row of cards gone
 * along sideways, a card at a time in the middle of the screen, with one either side.
 * Each card is a piece of the app, set going, with what it is called and a line on it
 * under it. The row goes round for ever, either way; a card either side of the middle
 * is brought there by clicking it.
 *
 * It goes round by being laid out three times end to end: once it is still, it is
 * jumped back or on by the length of one, to the same place in the one in the middle,
 * which is not to be seen. (The others are there only to be seen: they are hidden from
 * what reads the page out. They are not inert, which would have them not clicked.)
 */
export function Showcase({ group }: { group: Group }) {
  const track = useRef<HTMLUListElement>(null)

  /** How far the row goes along to bring this card to its middle, px. */
  const offOf = (row: HTMLElement, item: Element) => {
    const middle = row.getBoundingClientRect()
    const box = item.getBoundingClientRect()
    return box.left + box.width / 2 - (middle.left + middle.width / 2)
  }
  const items = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('.showcase__item')]
  /** The card in the middle, and how far it is from being there. */
  const middleOf = (row: HTMLElement) => {
    let best: { item: HTMLElement; off: number } | null = null
    for (const item of items(row)) {
      const off = offOf(row, item)
      if (!best || Math.abs(off) < Math.abs(best.off)) best = { item, off }
    }
    return best
  }
  /** The length of one round of the row, px: from a card to the same card in the next. */
  const roundOf = (row: HTMLElement) => {
    const all = items(row)
    const count = group.features.length
    return all.length > count ? all[count].offsetLeft - all[0].offsetLeft : 0
  }
  /** Mark the card in the middle (the others may be clicked to come there). */
  const mark = (row: HTMLElement) => {
    const middle = middleOf(row)
    for (const item of items(row)) item.toggleAttribute('data-current', item === middle?.item)
  }

  // To begin with, and whenever the screen changes: the second card of the round in the
  // middle, in the middle.
  useBeforePaint(() => {
    const row = track.current
    if (!row) return
    const start = () => {
      const card = items(row)[group.features.length + FIRST]
      if (!card) return
      row.scrollLeft += offOf(row, card)
      mark(row)
    }
    start()
    window.addEventListener('resize', start)
    return () => window.removeEventListener('resize', start)
  }, [group.features.length])

  // Once the row is still, it is put back in the round in the middle, where it was in
  // whichever round it had gone into.
  useEffect(() => {
    const row = track.current
    if (!row) return
    let still = 0
    const settle = () => {
      const round = roundOf(row)
      if (round > 0) {
        if (row.scrollLeft < round * 0.5) row.scrollLeft += round
        else if (row.scrollLeft > round * 1.5) row.scrollLeft -= round
      }
      mark(row)
    }
    const scrolled = () => {
      window.clearTimeout(still)
      still = window.setTimeout(settle, 160)
    }
    row.addEventListener('scroll', scrolled, { passive: true })
    return () => {
      row.removeEventListener('scroll', scrolled)
      window.clearTimeout(still)
    }
  }, [group.features.length])

  // A swipe along the row goes along the row, and only along it: on a trackpad a swipe
  // sideways goes a little up or down too, which would take the page with it. Which way
  // a swipe goes is taken from its start; one along the row is the row's, all of it,
  // and when it is done the row settles on the card nearest the middle. (One that goes
  // up or down is the page's, as ever.) The page is scrolled by the framework's Lenis,
  // which goes by no one's preventDefault: it is told to leave the swipe alone by the
  // row's `data-lenis-prevent-wheel`, while the swipe is the row's.
  useEffect(() => {
    const row = track.current
    if (!row) return
    let along: boolean | null = null
    let quiet = 0
    let settled = 0
    const leave = (alone: boolean) => row.toggleAttribute('data-lenis-prevent-wheel', alone)
    const settle = () => {
      along = null
      leave(false)
      const middle = middleOf(row)
      if (middle) row.scrollBy({ left: middle.off, behavior: 'smooth' })
      // (the row snaps to its cards again once it is there)
      settled = window.setTimeout(() => (row.style.scrollSnapType = ''), 500)
    }
    const wheel = (event: WheelEvent) => {
      const by = event.deltaMode === 1 ? 16 : 1
      const x = event.deltaX * by
      const y = event.deltaY * by
      if (along === null) along = Math.abs(x) > Math.abs(y)
      // (a swipe is over when the wheel has been still a moment)
      window.clearTimeout(quiet)
      quiet = window.setTimeout(along ? settle : () => (along = null), 140)
      leave(along)
      if (!along) return
      event.preventDefault()
      window.clearTimeout(settled)
      row.style.scrollSnapType = 'none'
      row.scrollLeft += x
    }
    row.addEventListener('wheel', wheel, { passive: false })
    return () => {
      row.removeEventListener('wheel', wheel)
      leave(false)
      window.clearTimeout(quiet)
      window.clearTimeout(settled)
    }
  }, [])

  /** A card clicked that is not in the middle comes there. */
  const bring = (item: HTMLElement) => {
    const row = track.current
    if (!row || item.hasAttribute('data-current')) return
    row.scrollBy({ left: offOf(row, item), behavior: 'smooth' })
  }

  return (
    <section className="showcase" id={group.id} aria-labelledby={`${group.id}-heading`}>
      <header className="showcase__head">
        {/* one paragraph: what it is, and then, quieter, a line more */}
        <h2 id={`${group.id}-heading`} className="showcase__heading">
          <Words>{group.heading}</Words>{' '}
          <span>
            <Words>{group.lede}</Words>
          </span>
        </h2>
        {group.poweredBy && (
          <p className="showcase__powered">
            Powered by
            <span className="showcase__brand">
              <img src={group.poweredBy.logo} alt="" width={20} height={20} />
              {group.poweredBy.name}
            </span>
            <a href={group.poweredBy.href} target="_blank" rel="noreferrer">
              Learn more
            </a>
          </p>
        )}
      </header>
      <ul className="showcase__track" ref={track}>
        {Array.from({ length: ROUNDS }, (_, round) =>
          group.features.map((feature) => {
            const Scene = SCENES[feature.scene]
            const real = round === Math.floor(ROUNDS / 2)
            return (
              <li
                key={`${round}-${feature.scene}`}
                className="showcase__item"
                aria-hidden={real ? undefined : true}
                onClick={(event) => bring(event.currentTarget)}
              >
                <div className="showcase__media" role="img" aria-label={feature.title.replace(/\.$/, '')}>
                  {Scene ? <Scene /> : <div className="showcase__empty" />}
                </div>
                <p className="showcase__caption">
                  <strong>{feature.title}</strong> {feature.says}
                </p>
              </li>
            )
          }),
        )}
      </ul>
    </section>
  )
}
