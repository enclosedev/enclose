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
import { build, type Plugin } from 'esbuild'
import puppeteer from 'puppeteer-core'
import { REST, type Look } from '../components/app/look'
import type { Paint } from '../components/app/view'

const here = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.resolve(here, '../public')
const EXAMPLES = path.resolve(here, '../../../examples')
/** The other examples, and how big each is drawn: a square this many px a side. */
const OTHERS = ['clock', 'lamp', 'stool']
const OTHERS_SIZE = 2400
/** And the colours card's simple solids, each this many px a side. */
const SHAPE_SIZE = 1000
/** The metals its Material tab shows, in the app's order, and the cube's colour by then, which a tinted one takes. */
const METALS = ['aluminium-polished', 'aluminium-brushed', 'aluminium-anodised', 'steel', 'steel-hammered', 'brass']
const PALETTE_ORANGE = '#feaf57'
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

/**
 * The arm as each card shows it: how it is looked at and stands, and what it is painted;
 * and (`as`) cut as another still is, so that what is in both is in the same place in each.
 */
type Still = { look?: Partial<Look>; paint?: Paint; as?: string }
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
  // and by itself where it is in the arm, as the arm's still has it
  'gripper-in-place': { look: { others: 0 }, as: 'arm' },
}
/** The parts whose pictures the list of parts shows, drawn as the app draws them. */
const PICTURES = ['base', 'shoulder', 'upper-arm', 'lower-arm', 'wrist', 'gripper', 'jaw']

// The app's own materials, as Render draws them (apps/desktop's materials.ts), for the
// colours card's Material tab: with the app's aliases, three.js the page's own (one copy
// of it), and no pictures of grains (no metal has one; the app has Vite find them).
const DESKTOP = path.resolve(here, '../../desktop')
const theApp: Plugin = {
  name: 'the-app',
  setup(build) {
    build.onResolve({ filter: /^@shared\// }, (args) => ({ path: path.join(DESKTOP, 'shared', `${args.path.slice(8)}.ts`) }))
    build.onResolve({ filter: /^three(\/.*)?$/ }, async (args) => {
      if (args.pluginData?.page || !args.importer.startsWith(DESKTOP)) return undefined
      const found = await build.resolve(args.path, {
        kind: args.kind,
        resolveDir: path.resolve(here, '..'),
        pluginData: { page: true },
      })
      return { path: found.path }
    })
    build.onLoad({ filter: /viewport\/materials\.ts$/ }, async (args) => ({
      contents: (await readFile(args.path, 'utf8')).replace(/import\.meta\.glob<string>\([^)]*\)/s, '{}'),
      loader: 'ts',
    }))
  },
}

const bundled = await build({
  stdin: {
    contents: `export { openView } from './components/app/view'
export { drawBox, drawExample, drawShape } from './scripts/example-view'
export { grainOf, physicalOf, pictureOf, studioFor } from '../desktop/src/components/viewport/materials'
export { materialOf } from '../desktop/shared/materials'`,
    resolveDir: path.resolve(here, '..'),
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  globalName: 'renders',
  write: false,
  plugins: [theApp],
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
  const cutIn = `(source, margin, fixed) => {
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
    if (fixed) ({ left, top, right, bottom } = fixed)
    const cut = document.createElement('canvas')
    cut.width = right - left + 1
    cut.height = bottom - top + 1
    cut.getContext('2d').drawImage(flat, left, top, cut.width, cut.height, 0, 0, cut.width, cut.height)
    return { url: cut.toDataURL('image/webp', 0.9), box: { left, top, right, bottom } }
  }`
  /** Where each still was cut, for one to be cut as another is. */
  const cuts: Record<string, unknown> = {}

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
  // and the clock's box, which the groups card has as a project of its own
  {
    const url = await page.evaluate(async (size) => {
      const canvas = (window as any).renders.drawBox(size, size / 1200)
      return canvas.toDataURL('image/webp', 0.88) as string
    }, OTHERS_SIZE)
    await writeFile(path.join(OUT, 'example-box.webp'), Buffer.from(url.split(',')[1], 'base64'))
    console.log('example-box')
  }
  // the simple solids of the colours card: each in its colour, and the cube given another
  // colour by hand and then bare metal
  const SHAPES: [string, string, string, boolean][] = [
    ['shape-cube', 'cube', 'green', false],
    ['shape-cube-orange', 'cube', 'orange', false],
    ['shape-sphere', 'sphere', 'pink', false],
    ['shape-cylinder', 'cylinder', 'blue', false],
    ['shape-torus', 'torus', 'yellow', false],
  ]
  for (const [name, shape, colour, metal] of SHAPES) {
    const url = await page.evaluate(
      async (shape, colour, metal, size) => {
        const canvas = (window as any).renders.drawShape(shape, colour, metal, size, size / 1200)
        return canvas.toDataURL('image/webp', 0.88) as string
      },
      shape,
      colour,
      metal,
      SHAPE_SIZE,
    )
    await writeFile(path.join(OUT, `${name}.webp`), Buffer.from(url.split(',')[1], 'base64'))
    console.log(name)
  }
  // and what the colours card's Material tab shows: the app's balls of its metals, and
  // the cube made of brushed aluminium, as Render draws it
  const balls = await page.evaluate(async (ids, colour) => {
    const app = (window as any).renders
    const out: Record<string, string> = {}
    for (const id of ids) {
      // (as WebP)
      const image = new Image()
      image.src = await app.pictureOf(app.materialOf(id), null, colour)
      await image.decode()
      const flat = document.createElement('canvas')
      flat.width = image.width
      flat.height = image.height
      flat.getContext('2d')!.drawImage(image, 0, 0)
      out[id] = flat.toDataURL('image/webp', 0.9)
    }
    return out
  }, METALS, PALETTE_ORANGE)
  for (const [id, url] of Object.entries(balls)) {
    await writeFile(path.join(OUT, `material-${id}.webp`), Buffer.from(url.split(',')[1], 'base64'))
    console.log(`material-${id}`)
  }
  {
    const url = await page.evaluate(async (size) => {
      const app = (window as any).renders
      const brushed = app.materialOf('aluminium-brushed')
      const grain = await app.grainOf(brushed)
      const canvas = app.drawShape(
        'cube',
        'green',
        true,
        size,
        size / 1200,
        (across: unknown, renderer: unknown, scene: { environment: unknown }) => {
          scene.environment = app.studioFor(renderer)
          const made = app.physicalOf(brushed, null, across, grain)
          made.color.set(brushed.colour)
          return made
        },
      )
      return canvas.toDataURL('image/webp', 0.88) as string
    }, SHAPE_SIZE)
    await writeFile(path.join(OUT, 'shape-cube-metal.webp'), Buffer.from(url.split(',')[1], 'base64'))
    console.log('shape-cube-metal')
  }
  if (onlyOthers) process.exit(0)

  for (const [name, still] of Object.entries(STILLS)) {
    const made = await page.evaluate(
      async (look, paint, cutIn, sharp, round, fixed) => {
        const canvas = document.createElement('canvas')
        document.body.append(canvas)
        const view = await (window as any).renders.openView(canvas, sharp, paint)
        view.draw(look)
        const made = (0, eval)(cutIn)(canvas, round * sharp, fixed)
        view.dispose()
        canvas.remove()
        return made as { url: string; box: unknown }
      },
      { ...REST, ...MIDDLE, grid: 0, ...still.look },
      still.paint ?? {},
      cutIn,
      SHARP,
      ROUND,
      still.as ? cuts[still.as] : null,
    )
    cuts[name] = made.box
    const url = made.url
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
