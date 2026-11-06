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
})

export const keywords: Record<string, string[]> = {
  arrive: ['model intro', 'front view to perspective', 'on load'],
}
