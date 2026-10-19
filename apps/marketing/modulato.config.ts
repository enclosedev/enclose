import { defineConfig } from 'modulato/config'
import { localJson } from '@modulato/content-local'

export default defineConfig({
  // Site-wide <head>, SSR'd on every page. What a page says of itself (its title,
  // what it is about, its own address) is in its config.ts, through content/seo.ts.
  head: {
    lang: 'en',
    link: [
      { rel: 'icon', href: '/favicon.png', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
    meta: [
      { name: 'theme-color', content: '#ffffff' },
      { name: 'author', content: 'Glauber' },
      // the card a link to the site is given when it is passed on: public/og.png,
      // made by `npm run og`
      { property: 'og:site_name', content: 'Enclose' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: 'en_US' },
      { property: 'og:image', content: 'https://enclose.dev/og.png' },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content: 'The Enclose mark over the words: Enclose is an open-source workbench for CAD made with agents.',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://enclose.dev/og.png' },
    ],
    // How many come to the site, and to which page: counted by Simple Analytics, which
    // sets no cookie and keeps no address, and so is asked to count a visit whatever
    // the browser's Do Not Track says. It sees a page changed without a reload by
    // itself. What it keeps is said on the privacy page, which has to stay true to this.
    script: [
      {
        src: 'https://scripts.simpleanalyticscdn.com/latest.js',
        async: true,
        'data-collect-dnt': 'true',
      },
    ],
  },
  // Every page can also be had in Markdown, by asking for text/markdown (agents/middleware.ts),
  // so the HTML too has to say it is one of two, or a cache could hand either to anyone.
  response({ headers }) {
    headers.set('vary', 'Accept')
  },
  // content/*.json -> typed snapshot. Pull + typegen: npx modulato content
  content: localJson({ dir: 'content' }),
  // Defined once, used everywhere: useViewport(), motion-token overrides
  // (phone: {...} blocks in motion.ts), the Tweak overlay switcher.
  breakpoints: {
    phone: '(max-width: 767px)',
    tablet: '(min-width: 768px) and (max-width: 1279px)',
  },
})
