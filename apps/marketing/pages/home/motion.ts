import { motion } from 'modulato'

// How the model comes into the window once it has loaded: looked at from here (the
// app's Front is from -90 round, level with the ground), and brought round to how the
// window has it, in this long, s.

export default motion({
  arrive: {
    azimuth: -90,
    elevation: 0,
    duration: 1.8,
    ease: 'expo.inOut',
    reduced: { duration: 0 },
  },
  // The headings under the first screen, which rise into place once their top is this
  // far down the screen: from this far below it, px, over this long, s; their words seen
  // a word at a time on the way, the next this long after the one before, s.
  headings: {
    rise: 24.8,
    duration: 1.53,
    stagger: 0.06,
    ease: 'expo.out',
    start: 'top 85%',
  },
})

export const keywords: Record<string, string[]> = {
  arrive: ['model intro', 'front view to perspective', 'on load'],
  headings: ['section titles', 'word by word', 'headline reveal', 'words rising on scroll'],
}
