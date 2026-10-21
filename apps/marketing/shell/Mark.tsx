import { useRef } from 'react'
import { resolveTokens, useNavigation, useRoute, useTicker, useViewport } from 'modulato'
import tokens from '../tokens/motion'
import { drawMark, LOGO, LOGO_PARTS } from './axes'

/** How far the page has to be scrolled before the mark takes it for scrolled, px. */
const SCROLLED = 8

/**
 * How long the mark takes from where it is on one page to where it is on the next, s:
 * what `.header` takes over the same journey (styles/global.scss).
 */
const TRAVEL = 0.9

/**
 * The pages of terms, and the others set the same way (components/Legal.tsx), where the
 * mark is out of its corner until the page is scrolled.
 */
const TERMS = ['terms', 'privacy', 'about', 'contact']
const terms = (page: string) => TERMS.includes(page)

const inOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const out = (t: number) => 1 - (1 - t) ** 3

/**
 * The logo, in the header: drawn in whatever colour the text there is, and turning
 * by itself. How far it has turned is one number, in turns: at every whole number
 * it is exactly as it started, having gone once round each of its axes.
 */
export function Mark() {
  const drawing = useRef<SVGGElement>(null)
  const { reducedMotion } = useViewport()
  const state = useRef({
    turns: 0,
    drawn: 0,
    /** what it is doing, and since when (ms), and from how far round */
    doing: 'resting' as 'resting' | 'spinning' | 'turning' | 'settling',
    since: -1,
    from: 0,
    /** how long it rests this time, s: less the first time */
    rest: -1,
    /**
     * How far out of its corner a page of terms has the mark, 1 to 0, and what that
     * goes by: the page's scroll (`follow`), or, on the way to another page, a
     * journey of its own to where that page has it (`travel`), or nothing (`hold`).
     */
    stay: 1,
    by: 'follow' as 'follow' | 'travel' | 'hold',
    stayed: 1,
    left: -1,
    /** a way to another page has just been taken: it turns once on the way */
    kick: false,
  })

  // The next page opens at its top, so the page's scroll is at once what it will be:
  // and the mark, going by that, would be at once where it will be. From one page of
  // terms to the other it makes its way there instead. On the way to the first page
  // it keeps as it is, and `.header` takes it from there.
  const route = useRoute()
  const next = useNavigation().to?.id ?? null
  const bound = useRef<string | null>(null)
  if (next !== bound.current) {
    bound.current = next
    const now = state.current
    if (next !== null) now.kick = true
    if (next === null) {
      if (now.by === 'hold') now.by = 'follow'
    } else if (terms(route.id)) {
      now.by = terms(next) ? 'travel' : 'hold'
      now.stayed = now.stay
      now.left = -1
    }
  }

  useTicker((time, delta) => {
    const now = state.current
    if (!drawing.current) return
    // How far the page is scrolled, for a page that has the mark out of its corner
    // until it is: 1 at the top of the page, 0 once it is scrolled this far.
    const asked = 1 - inOut(Math.min(1, window.scrollY / resolveTokens(tokens).shell.mark.corner))
    let stay = asked
    if (now.by === 'hold') {
      stay = now.stay
    } else if (now.by === 'travel') {
      if (now.left < 0) now.left = time
      const gone = Math.min(1, (time - now.left) / 1000 / TRAVEL)
      stay = now.stayed + (asked - now.stayed) * inOut(gone)
      if (gone >= 1) now.by = 'follow'
    }
    if (stay !== now.stay) {
      now.stay = stay
      drawing.current.ownerSVGElement?.parentElement?.style.setProperty('--stay', stay.toFixed(4))
    }

    if (reducedMotion) return
    const { first, spin, rest, around, settle, elevation } = resolveTokens(tokens).shell.mark
    if (now.since < 0) now.since = time
    if (now.rest < 0) now.rest = first
    const scrolled = window.scrollY > SCROLLED
    const begin = (doing: typeof now.doing) => {
      now.doing = doing
      now.since = time
      now.from = now.turns
    }
    // On the way to another page it turns, whatever it was doing: at rest, it begins
    // a turn now. (Otherwise it is turning already, or coming round to how it started.)
    if (now.kick) {
      now.kick = false
      if (now.doing === 'resting') begin('spinning')
    }
    const elapsed = (time - now.since) / 1000

    if (scrolled) {
      if (now.doing !== 'turning') begin('turning')
      now.turns += delta / 1000 / around
    } else if (now.doing === 'turning') {
      begin('settling')
    } else if (now.doing === 'settling') {
      // on round to the next time it is as it started: not back the way it came
      const to = Math.ceil(now.from + 0.12)
      now.turns = now.from + (to - now.from) * out(Math.min(1, elapsed / settle))
      if (elapsed >= settle) {
        now.rest = rest
        begin('resting')
      }
    } else if (now.doing === 'spinning') {
      now.turns = now.from + inOut(Math.min(1, elapsed / spin))
      if (elapsed >= spin) {
        now.rest = rest
        begin('resting')
      }
    } else if (elapsed >= now.rest) {
      begin('spinning')
    }

    if (now.turns === now.drawn) return
    now.drawn = now.turns
    drawing.current.innerHTML = drawMark(
      {
        ...LOGO,
        azimuth: LOGO.azimuth + now.turns * 360,
        // down through the ground and back up, once each way
        elevation: -elevation * Math.cos(now.turns * Math.PI * 2),
        roll: now.turns * 360,
      },
      LOGO_PARTS,
    )
  })

  return (
    <svg viewBox="-50 -50 100 100" role="img" aria-label="Enclose">
      <g ref={drawing} dangerouslySetInnerHTML={{ __html: drawMark(LOGO, LOGO_PARTS) }} />
    </svg>
  )
}
