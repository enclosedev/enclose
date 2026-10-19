import TurndownService from 'turndown'

/**
 * What of a page is left out of its Markdown: what is there to be looked at and not
 * read (the app's window, drawn as a picture; icons) and what runs.
 */
function decoration(node: HTMLElement): boolean {
  if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IMG'].includes(node.nodeName.toUpperCase()))
    return true
  return node.getAttribute?.('role') === 'img' || node.getAttribute?.('aria-hidden') === 'true'
}

/**
 * A page, as the server renders it, said again in Markdown: what is in its <main>, with
 * its links made whole (https://enclose.dev/terms, not /terms) so that they still lead
 * somewhere once the text is read away from the site.
 */
export function pageToMarkdown(html: string, url: string): string {
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(html)
  if (!main) throw new Error(`no <main> on ${url}`)
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
  })
  turndown.remove(decoration as TurndownService.FilterFunction)
  turndown.addRule('link', {
    filter: (node) => node.nodeName === 'A' && Boolean(node.getAttribute('href')),
    // a link with only an icon in it is a button: said by its label, on a line of its own
    replacement: (content, node) => {
      const element = node as HTMLElement
      const href = new URL(element.getAttribute('href')!, url).href
      if (content.trim()) return `[${content.trim()}](${href})`
      const label = element.getAttribute('aria-label')?.trim()
      return label ? `\n\n[${label}](${href})\n\n` : ''
    },
  })
  return `${turndown.turndown(main[1]).trim()}\n`
}

/**
 * Where a page's headings skip a level going in (an h3 straight after the h1), or begin
 * at something other than its h1: in the order they are in the HTML, which is the order
 * whatever reads it without looking goes by.
 */
export function headingSkips(html: string): string[] {
  const skips: string[] = []
  let was = 0
  for (const [, level] of html.matchAll(/<h([1-6])\b/gi)) {
    const now = Number(level)
    if (was === 0 && now !== 1) skips.push(`begins at h${now}`)
    else if (now > was + 1) skips.push(`h${was} to h${now}`)
    was = now
  }
  return skips
}
