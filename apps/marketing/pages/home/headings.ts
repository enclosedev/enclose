import { resolveTokens } from 'modulato'
import type { gsap as Gsap } from 'gsap'
import tokens from './motion'

/**
 * Each heading under the first screen rises into place as it comes into view, the
 * heading as one; and its words are seen a word at a time on the way, each there at
 * once (not faded in), wherever the heading has got to by then. (Once; and not where
 * motion is to be kept down.)
 */
export function riseHeadings(gsap: typeof Gsap, root: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const { rise, duration, stagger, ease, start } = resolveTokens(tokens).headings
  for (const heading of root.querySelectorAll<HTMLElement>('.showcase__heading')) {
    const words = [...heading.querySelectorAll<HTMLElement>('.word')]
    if (!words.length) continue
    gsap.set(words, { visibility: 'hidden' })
    const shown = gsap.timeline({
      paused: true,
      // (measured by what it is in, which is not moved)
      scrollTrigger: { trigger: heading.parentElement ?? heading, start, once: true },
    })
    shown.fromTo(heading, { y: rise }, { y: 0, duration, ease }, 0)
    words.forEach((word, index) => shown.set(word, { visibility: 'visible' }, index * stagger))
  }
}
