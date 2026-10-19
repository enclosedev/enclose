import { seo } from '../../content/seo'

export function meta() {
  return seo({
    path: '/contact',
    title: 'Contact: Enclose',
    description:
      'Where to ask about Enclose, report a problem or send a change: the project’s issues and pull requests on GitHub.',
  })
}

// How the page comes in is arranged from its top: so it always opens there, by the
// browser's Back and Forward too.
export const scroll = { restore: false }
