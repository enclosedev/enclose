// The site's pages in Markdown, for agents, made once `modulato build` has: each page is
// rendered by the built server, said again in Markdown and put into the Routing
// Middleware that answers Accept: text/markdown, and /privacy.md and /index.html.md,
// with it (agents/middleware.ts). Not as files beside the site's: Vercel serves a
// static index.html.md for / (agents/routes.ts). Run by `npm run build`; the Middleware
// is only made where there is a Vercel output to put it in.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import site from '../content/site.json'
import { headingSkips, pageToMarkdown } from '../agents/markdown'
import type { Documents } from '../agents/middleware'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vercel = path.join(root, '.vercel/output')

/** Every page's address, from the folders in pages/ ("home" is "/"); none with a [param] in it. */
function addresses(dir = path.join(root, 'pages'), from = ''): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.includes('[')) continue
    const address = from === '' && entry.name === 'home' ? '/' : `${from}/${entry.name}`
    if (fs.existsSync(path.join(dir, entry.name, 'page.tsx'))) found.push(address)
    found.push(...addresses(path.join(dir, entry.name), address === '/' ? '' : address))
  }
  return found.sort()
}

const { handle } = (await import(pathToFileURL(path.join(root, 'dist/server/server.js')).href)) as {
  handle: (url: string, request: Request) => Promise<{ html: string; status: number }>
}

const pages: Record<string, string> = {}
for (const address of addresses()) {
  const url = `${site.url}${address}`
  const { html, status } = await handle(address, new Request(url, { headers: { accept: 'text/html' } }))
  if (status !== 200) throw new Error(`${address} rendered with ${status}`)
  // what reads the page without looking goes by its headings: they go down a level at a time
  const skips = headingSkips(html)
  if (skips.length) throw new Error(`${address}: its headings skip a level (${skips.join(', ')})`)
  pages[address] = pageToMarkdown(html, url)
}
const documents: Documents = {
  pages,
  missing: fs.readFileSync(path.join(root, 'agents/not-found.md'), 'utf8'),
  origin: site.url,
}

if (fs.existsSync(vercel)) {
  const fn = path.join(vercel, 'functions/_middleware.func')
  fs.rmSync(fn, { recursive: true, force: true })
  await build({
    entryPoints: [path.join(root, 'agents/edge.ts')],
    outfile: path.join(fn, 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    define: { DOCUMENTS: JSON.stringify(documents) },
    logLevel: 'warning',
  })
  fs.writeFileSync(path.join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'edge', entrypoint: 'index.js' }, null, 2))
}

console.log(`[agents] Markdown for ${Object.keys(pages).join(', ')}${fs.existsSync(vercel) ? ', and the middleware' : ''}`)
