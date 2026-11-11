import { seo } from '../../content/seo'

export function meta() {
  return seo({
    path: '/privacy',
    title: 'Privacy Policy: Enclose',
    description:
      'What the Enclose app and website send anywhere, and what they do not: no account needed, projects kept on your machine unless you back them up, and usage counts you can switch off.',
  })
}

// How the page comes in is arranged from its top: so it always opens there, by the
// browser's Back and Forward too.
export const scroll = { restore: false }
