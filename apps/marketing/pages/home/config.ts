import type { LoadArgs } from 'modulato'
import { seo } from '../../content/seo'
import site from '../../content/site.json'

export function load({ content }: LoadArgs) {
  return { headline: content.site.headline, description: content.site.description }
}

export function meta() {
  const said = seo({
    path: '/',
    title: `${site.title}: AI CAD app for Mac and Linux`,
    description: site.summary,
  })
  return {
    ...said,
    // What the app is, for a search engine to say beside the link to it.
    script: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: site.title,
          description: site.summary,
          url: site.url,
          image: `${site.url}/og.png`,
          applicationCategory: 'DesignApplication',
          operatingSystem: 'macOS 13 or later',
          downloadUrl: 'https://github.com/enclosedev/enclose/releases/latest',
          license: 'https://www.gnu.org/licenses/agpl-3.0.html',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          author: { '@type': 'Person', name: 'Glauber', url: 'https://glauber.org' },
          codeRepository: 'https://github.com/enclosedev/enclose',
        }),
      },
    ],
  }
}

// The page is one long scroll that is scrubbed: it always opens at its top.
export const scroll = { restore: false }
