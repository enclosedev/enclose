import type gsapType from 'gsap'
import { resolveTokens } from 'modulato'
import tokens from './motion'

// The rows of cards down the first page (components/features/Showcase.tsx): the cards
// of a row in sight come in as the row is scrolled to, one after another, fading in as
// each is pulled across from its right (`cards`, motion.ts). Once in, they stay.

export function revealCards({ gsap, root }: { gsap: typeof gsapType; root: HTMLElement }) {
  const { x, duration, stagger, start, ease } = resolveTokens(tokens).cards
  const context = gsap.context(() => {
    for (const row of root.querySelectorAll<HTMLElement>('.showcase__track')) {
      // (the row goes round, and is laid out more than once: the cards in sight come in
      // one after another from the left, and those out of it with no wait)
      const cards = [...row.querySelectorAll<HTMLElement>('.showcase__item')]
      const sight = row.getBoundingClientRect()
      const seen = cards.filter((card) => {
        const box = card.getBoundingClientRect()
        return box.right > sight.left && box.left < sight.right
      })
      gsap.from(cards, {
        opacity: 0,
        x,
        duration,
        stagger: (index: number) => Math.max(0, seen.indexOf(cards[index])) * stagger,
        ease,
        scrollTrigger: { trigger: row, start: `top ${start * 100}%`, once: true },
      })
    }
  }, root)
  return () => context.revert()
}
