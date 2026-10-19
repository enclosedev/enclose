// Serve the Vercel Build Output (.vercel/output) locally, the way Vercel
// would: the Markdown middleware where its routes say (agents/routes.ts), then
// static files, then the __ssr function as catch-all.
// Build first: VERCEL=1 npm run build
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(root, '.vercel/output')
const staticDir = path.join(out, 'static')
const { default: handler } = await import(
  pathToFileURL(path.join(out, 'functions/__ssr.func/index.mjs'))
)
const { default: middleware } = await import(
  pathToFileURL(path.join(out, 'functions/_middleware.func/index.js'))
)
const { routes } = JSON.parse(fs.readFileSync(path.join(out, 'config.json'), 'utf8'))

/** Whether a route's has/missing condition holds for a request's headers. */
const holds = (condition, headers) => {
  const value = headers[condition.key]
  if (value === undefined) return false
  return condition.value?.re ? new RegExp(condition.value.re).test(value) : true
}

/** Whether a request is one Vercel would hand to the middleware first. */
const toMiddleware = (pathname, headers) =>
  routes.some(
    (route) =>
      route.middlewarePath &&
      new RegExp(route.src).test(pathname) &&
      (route.has ?? []).every((condition) => holds(condition, headers)) &&
      !(route.missing ?? []).some((condition) => holds(condition, headers)),
  )

const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}

const port = Number(process.env.PORT ?? 4173)
http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (toMiddleware(url.pathname, req.headers)) {
      const answer = await middleware(
        new Request(new URL(req.url ?? '/', `http://localhost:${port}`), {
          method: req.method,
          headers: Object.entries(req.headers).filter(([, value]) => typeof value === 'string'),
        }),
      )
      if (answer.headers.get('x-middleware-next') !== '1') {
        res.writeHead(answer.status, Object.fromEntries(answer.headers))
        res.end(Buffer.from(await answer.arrayBuffer()))
        return
      }
    }
    const file = path.join(staticDir, decodeURIComponent(url.pathname))
    if (file.startsWith(staticDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream')
      fs.createReadStream(file).pipe(res)
      return
    }
    await handler(req, res)
  })
  .listen(port, () => {
    console.log(`vercel-output preview on http://localhost:${port}`)
  })
