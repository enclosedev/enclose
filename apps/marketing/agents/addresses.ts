/**
 * A page's address the way it is written down: without a slash at its end, but for the
 * home page's own.
 */
export const addressOf = (pathname: string) => pathname.replace(/(.)\/+$/, '$1')

/** Where the Markdown of a page is kept as a file: the llms.txt way, index.html.md for the home page. */
export const markdownFile = (address: string) => (address === '/' ? '/index.html.md' : `${address}.md`)

/** The page whose Markdown a file's address is (/privacy.md, /index.html.md), or null for one that is not that. */
export const addressOfFile = (pathname: string) =>
  pathname === '/index.html.md' ? '/' : /^\/.+\.md$/.test(pathname) ? pathname.slice(0, -'.md'.length) : null
