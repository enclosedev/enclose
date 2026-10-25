/**
 * Vercel routes (Build Output API v3) for the Markdown of the site's pages, given to the
 * Modulato plugin in vite.config.ts. They go before the filesystem and the SSR, so they
 * see every page's address first.
 */

/**
 * An address that can be a page: not a file (no dot), not the built assets, not a server
 * action, and not a way to the app (/download, which vite.config.ts sends on to the disk
 * image whatever is asked for).
 */
export const PAGE = '^/(?!assets/|__modulato/|download(?:/|$))[^.]*$'

/** An Accept header that names Markdown at all, whatever it then says of it. */
export const NAMES_MARKDOWN = 'markdown|Markdown|MARKDOWN'

/** An Accept header that would take HTML as it is, or that names Markdown (left to the one above). */
export const TAKES_HTML = `text/html|text/\\*|\\*/\\*|${NAMES_MARKDOWN}`

export const MARKDOWN_ROUTES = [
  // The pages' Markdown as files (/privacy.md, /index.html.md), from the middleware too:
  // never as files in the output, where Vercel would take index.html.md for the home page
  // and serve it to browsers in place of the page.
  { src: '^/.+\\.md$', middlewarePath: '_middleware', continue: true },
  // The middleware (agents/middleware.ts) decides between Markdown, the page as it is
  // and a 406. A browser always asks for HTML by name and never mentions Markdown, so
  // it goes straight to the page: only a request that names Markdown, or that would take
  // neither, has the middleware run first.
  {
    src: PAGE,
    has: [{ type: 'header', key: 'accept', value: { re: NAMES_MARKDOWN } }],
    middlewarePath: '_middleware',
    continue: true,
  },
  {
    src: PAGE,
    missing: [{ type: 'header', key: 'accept', value: { re: TAKES_HTML } }],
    middlewarePath: '_middleware',
    continue: true,
  },
]
