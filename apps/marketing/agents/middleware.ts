import { OFFERED, negotiate } from './accept'
import { addressOf, addressOfFile } from './addresses'

/** The site's pages in Markdown, by address ("/", "/privacy"), and what is said where there is none. */
export type Documents = { pages: Record<string, string>; missing: string; origin: string }

/** Go on to the page as it is (the HTML): Vercel's word for it, from its Routing Middleware. */
const NEXT = { 'x-middleware-next': '1' }

/**
 * The page in whichever form the request asks for (https://acceptmarkdown.com): its
 * Markdown when the Accept header puts text/markdown first, the page as it is when it
 * puts HTML first or will take anything, and a 406 when it will take neither. An address
 * with no page has the Markdown of a missing one, with a 404, which says where to go.
 * Every answer here varies by Accept; the HTML says so of itself (modulato.config.ts).
 * A page's Markdown asked for as a file (/privacy.md) is that, whatever the Accept.
 */
export function respond(request: Request, documents: Documents): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { headers: NEXT })
  const file = addressOfFile(new URL(request.url).pathname)
  if (file !== null) return markdown(request, documents, file, false)
  const wanted = negotiate(request.headers.get('accept'))
  if (wanted === 'text/html') return new Response(null, { headers: NEXT })

  const head = request.method === 'HEAD'
  if (!wanted) {
    return new Response(
      head
        ? null
        : `This page is available as:\n${OFFERED.map((type) => `- ${type}`).join('\n')}\n\nYou asked for: ${request.headers.get('accept')}\n`,
      {
        status: 406,
        headers: { 'content-type': 'text/plain; charset=utf-8', vary: 'Accept', 'cache-control': 'no-store' },
      },
    )
  }

  return markdown(request, documents, addressOf(new URL(request.url).pathname), true)
}

/** A page's Markdown, or the missing page's with a 404; as a file it does not vary by Accept. */
function markdown(request: Request, documents: Documents, address: string, varies: boolean): Response {
  const page = documents.pages[address]
  const headers: Record<string, string> = {
    'content-type': 'text/markdown; charset=utf-8',
    'cache-control': 'public, max-age=0, must-revalidate',
  }
  if (varies) headers.vary = 'Accept'
  if (page !== undefined) headers.link = `<${documents.origin}${address}>; rel="canonical"`
  const body = request.method === 'HEAD' ? null : (page ?? documents.missing)
  return new Response(body, { status: page === undefined ? 404 : 200, headers })
}
