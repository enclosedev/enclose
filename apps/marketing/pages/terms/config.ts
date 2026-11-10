import { seo } from '../../content/seo'

export function meta() {
  return seo({
    path: '/terms',
    title: 'Terms of Use: Enclose',
    description:
      'The terms the Enclose website, app and Enclose Cloud are offered under: open source under the AGPL, your projects yours, and agents on your own subscription.',
  })
}

// How the page comes in is arranged from its top: so it always opens there, by the
// browser's Back and Forward too.
export const scroll = { restore: false }
