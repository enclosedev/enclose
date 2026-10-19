import { seo } from '../../content/seo'

export function meta() {
  return seo({
    path: '/about',
    title: 'About: Enclose',
    description:
      'What Enclose is and who makes it: an open-source desktop app for CAD made with agents, maintained by Glauber, under the AGPL.',
  })
}

// How the page comes in is arranged from its top: so it always opens there, by the
// browser's Back and Forward too.
export const scroll = { restore: false }
