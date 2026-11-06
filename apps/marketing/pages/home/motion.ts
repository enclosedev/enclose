import { motion } from 'modulato'

// How the model comes into the window once it has loaded: looked at from here (the
// app's Front is from -90 round, level with the ground), and brought round to how the
// window has it, in this long, s.
//
// And how each row of cards further down comes in as it is scrolled to (cards.ts): one
// after another, `stagger` s apart, each pulled in from `x` px to its right as it fades
// in, in `duration` s, once its row's top is `start` of the way down the screen.
export default motion({
  arrive: {
    azimuth: -90,
    elevation: 0,
    duration: 1.8,
    ease: 'expo.inOut',
    reduced: { duration: 0 },
  },
  cards: {
    x: 120,
    duration: 1.1,
    stagger: 0.09,
    start: 0.85,
    ease: 'power3.out',
    reduced: { x: 0, duration: 0 },
  },
})

export const keywords: Record<string, string[]> = {
  arrive: ['model intro', 'front view to perspective', 'on load'],
  cards: ['feature cards', 'cards sliding in', 'row of cards on scroll', 'stagger'],
}
