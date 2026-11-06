// Stills of the robot arm for the landing page's feature cards: public/renders/*.webp.
// Each is drawn by the page's own view (components/app/view.ts), as the window on the
// page draws the arm, in Chrome, and cut to the arm with nothing round it. And the app's
// other examples (the repo's examples/), each by itself on a square, as big as the
// cards show them (scripts/example-view.ts). They are committed, so the site builds
// without them being made again.
//
//   npm run renders                 (from apps/marketing; needs Google Chrome)
//   npm run renders -- examples     (only the other examples)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import puppeteer from 'puppeteer-core'
import { REST, type Look } from '../components/app/look'
import type { Paint } from '../components/app/view'

const here = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.resolve(here, '../public')
const EXAMPLES = path.resolve(here, '../../../examples')
/** The other examples, and how big each is drawn: a square this many px a side. */
const OTHERS = ['clock', 'lamp', 'stool']
const OTHERS_SIZE = 2400
const onlyOthers = process.argv.includes('examples')
/**
 * How many of a still's px there are to one of the window's: as many as a card drawing
 * the arm biggest (the first, its projects) needs on a sharp screen. And how much room
 * is left round the arm, in the window's px.
 */
const SHARP = 3
const ROUND = 6
const OUT = path.join(PUBLIC, 'renders')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** The arm as each card shows it: how it is looked at and stands, and what it is painted. */
type Still = { look?: Partial<Look>; paint?: Paint }
const MIDDLE = { x: 860, y: 500 }
const ALL_OF_IT = ['base', 'shoulder', 'upper-arm', 'lower-arm', 'wrist', 'gripper', 'jaw']
const STILLS: Record<string, Still> = {
  arm: {},
  exploded: { look: { apart: 1, distance: 4.4 } },
  // the upper arm given another colour by hand, and then another material
  'arm-orange': { paint: { 'upper-arm': 'orange' } },
  'arm-metal': { paint: { 'upper-arm': 'metal' } },
  // another conversation's version of it: all in white, with an orange shoulder
  'arm-white': {
    paint: { ...Object.fromEntries(ALL_OF_IT.map((group) => [group, 'white'])), shoulder: 'orange' },
  },
  // and that version, raised as the arm's tool moves it
  'arm-raised': {
    look: { shoulder: 95, elbow: 100, wrist: 10 },
  },
  // the gripper, picked in the list of parts and shown on its own
  gripper: { look: { others: 0, alone: 1, distance: 3.2 } },
}
/** The parts whose pictures the list of parts shows, drawn as the app draws them. */
const PICTURES = ['base', 'shoulder', 'upper-arm', 'lower-arm', 'wrist', 'gripper', 'jaw']

const bundled = await build({
  stdin: {
    contents: `export { openView } from './components/app/view'
export { drawExample } from './scripts/example-view'`,
    resolveDir: path.resolve(here, '..'),
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  globalName: 'renders',
  write: false,
})
const script = bundled.outputFiles[0].text

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://here')
  if (url.pathname === '/') {
    response.setHeader('content-type', 'text/html')
    return response.end('<!doctype html><body style="margin:0;background:transparent"></body>')
  }
  try {
    const file = decodeURIComponent(url.pathname)
    response.end(
      await readFile(
        file.startsWith('/examples/')
          ? path.join(EXAMPLES, file.slice('/examples/'.length))
          : path.join(PUBLIC, file),
      ),
    )
  } catch {
    response.statusCode = 404
    response.end()
  }
})
await new Promise<void>((done) => server.listen(0, done))
const { port } = server.address() as { port: number }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
try {
  const page = await browser.newPage()
  page.on('console', (message) => console.log('page:', message.text()))
  await page.goto(`http://localhost:${port}/`)
  await page.addScriptTag({ content: script })
  await mkdir(OUT, { recursive: true })

  /** Cut a picture to what is drawn in it, and make it a WebP. (In the page.) */
  const cutIn = `(source, margin) => {
    const flat = document.createElement('canvas')
    flat.width = source.width
    flat.height = source.height
    const pen = flat.getContext('2d')
    pen.drawImage(source, 0, 0)
    const { data, width, height } = pen.getImageData(0, 0, flat.width, flat.height)
    let left = width, right = 0, top = height, bottom = 0
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
    left = Math.max(0, left - margin); top = Math.max(0, top - margin)
    right = Math.min(width - 1, right + margin); bottom = Math.min(height - 1, bottom + margin)
    const cut = document.createElement('canvas')
    cut.width = right - left + 1
    cut.height = bottom - top + 1
    cut.getContext('2d').drawImage(flat, left, top, cut.width, cut.height, 0, 0, cut.width, cut.height)
    return cut.toDataURL('image/webp', 0.9)
  }`

  for (const name of OTHERS) {
    const url = await page.evaluate(
      async (base, size) => {
        const canvas = await (window as any).renders.drawExample(base, size, size / 1200)
        return canvas.toDataURL('image/webp', 0.88) as string
      },
      `/examples/${name}/build`,
      OTHERS_SIZE,
    )
    await writeFile(path.join(OUT, `example-${name}.webp`), Buffer.from(url.split(',')[1], 'base64'))
    console.log(`example-${name}`)
  }
  if (onlyOthers) process.exit(0)

  for (const [name, still] of Object.entries(STILLS)) {
    const url = await page.evaluate(
      async (look, paint, cutIn, sharp, round) => {
        const canvas = document.createElement('canvas')
        document.body.append(canvas)
        const view = await (window as any).renders.openView(canvas, sharp, paint)
        view.draw(look)
        const url = (0, eval)(cutIn)(canvas, round * sharp)
        view.dispose()
        canvas.remove()
        return url as string
      },
      { ...REST, ...MIDDLE, grid: 0, ...still.look },
      still.paint ?? {},
      cutIn,
      SHARP,
      ROUND,
    )
    await writeFile(path.join(OUT, `${name}.webp`), Buffer.from(url.split(',')[1], 'base64'))
    console.log(name)
  }

  const pictures = await page.evaluate(async (ids) => {
    const canvas = document.createElement('canvas')
    const view = await (window as any).renders.openView(canvas, 1)
    const made: Record<string, string> = {}
    await view.pictures(ids, (id: string, url: string) => (made[id] = url))
    view.dispose()
    // as WebP
    const out: Record<string, string> = {}
    for (const [id, url] of Object.entries(made)) {
      const image = new Image()
      image.src = url
      await image.decode()
      const flat = document.createElement('canvas')
      flat.width = image.width
      flat.height = image.height
      flat.getContext('2d')!.drawImage(image, 0, 0)
      out[id] = flat.toDataURL('image/webp', 0.9)
    }
    return out
  }, PICTURES)
  for (const [id, url] of Object.entries(pictures)) {
    await writeFile(path.join(OUT, `part-${id}.webp`), Buffer.from(url.split(',')[1], 'base64'))
    console.log(`part-${id}`)
  }
} finally {
  await browser.close()
  server.close()
}
