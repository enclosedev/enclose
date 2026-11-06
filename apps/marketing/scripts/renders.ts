// Stills of the robot arm for the landing page's feature cards: public/renders/*.webp.
// Each is drawn by the page's own view (components/app/view.ts), as the window on the
// page draws the arm, in Chrome, and cut to the arm with nothing round it. And the app's
// other examples (the repo's examples/), each by itself on a square, as big as the
// cards show them (scripts/example-view.ts). They are committed, so the site builds
// without them being made again.
//
//   npm run renders                 (from apps/marketing; needs Google Chrome)
//   npm run renders -- examples     (only the other examples)
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
const KIT = path.resolve(here, '../../../kit')
/**
 * The stool beside the app's own figure of a person, turned round, for the card that has
 * it: so many frames, a turn, played as a film at so many a second (public/renders/
 * beside.mp4, made from them by ffmpeg, on the card's own ground), and its first as a
 * still, for before it plays.
 */
const BESIDE_FRAMES = 240
const BESIDE_SIZE = 900
const BESIDE_RATE = 30
const BESIDE_GROUND = '171717'
/** The other examples, and how big each is drawn: a square this many px a side. */
const OTHERS = ['clock', 'lamp', 'stool']
const OTHERS_SIZE = 2400
/**
 * The clock's movement and its hands, which the pulled-apart card has: each part drawn by
 * itself, to be moved apart on the page; how big, and how far apart it may go.
 */
const CLOCKWORK = [
  'back-plate',
  'pillars',
  'motor',
  'motor-screws',
  'fourth-wheel',
  'third-wheel',
  'centre-wheel',
  'front-plate',
  'plate-screws',
  'movement-screws',
  'minute-wheel',
  'hour-wheel',
  'seconds-hand',
  'hour-hand',
  'minute-hand',
]
const CLOCKWORK_SIZE = 3400
const CLOCKWORK_MOST = 1.6
/**
 * And a board of the user's (Cloque, a clock), as tscircuit makes it in 3D, turned over
 * and back, for the 3D card: where its .glb is (CLOQUE_GLB: it is not in this repo;
 * without it, what was made of it is left as it is), how many frames, how big, and the
 * parts whose places the card needs.
 */
const CLOQUE = process.env.CLOQUE_GLB
/** (and its circuit beside it, for where its keep-outs are) */
const CLOQUE_CIRCUIT = CLOQUE?.replace(/\.glb$/, '.circuit.json')
const CLOQUE_FRAMES = 144
/** (as a film the card goes through by its time, at so many frames a second, a key frame every so many, for it to be gone to anywhere at once) */
const CLOQUE_RATE = 30
const CLOQUE_KEYS = 8
const CLOQUE_GROUND = '151515'
const CLOQUE_SIZE = 900
const CLOQUE_MARKED = ['U1', 'SW1']
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
export { drawBeside, drawBox, drawExample, drawLayers, drawShape, drawTurning } from './scripts/example-view'
export { grainOf, physicalOf, pictureOf, studioFor } from '../desktop/src/components/viewport/materials'
export { boardPaint, inOurColours, inShade, keepOutsOf, shadedOf } from '../desktop/src/components/pcb/colours'
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
          : file.startsWith('/kit/')
            ? path.join(KIT, file.slice('/kit/'.length))
            : file === '/cloque.glb' && CLOQUE
            ? CLOQUE
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
  // (what tsx makes of a function handed to the page names its own functions with a
  // helper of its, which the page has not got)
  await page.addScriptTag({ content: 'window.__name = (f) => f' })
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
  {
    const drawn = await page.evaluate(
      async (base, ids, size, most) =>
        (window as any).renders.drawLayers(base, ids, size, size / 1200, most, {
          // (the seconds hand is on a little dial of its own, round another arbor)
          hands: ['hour-hand', 'minute-hand'],
          arbor: 'centre-wheel',
        }),
      '/examples/clock/build',
      CLOCKWORK,
      CLOCKWORK_SIZE,
      CLOCKWORK_MOST,
    )
    await mkdir(path.join(OUT, 'clockwork'), { recursive: true })
    const layers = []
    for (const { url, ...layer } of drawn.layers as { id: string; url: string }[]) {
      await writeFile(path.join(OUT, 'clockwork', `${layer.id}.webp`), Buffer.from(url.split(',')[1], 'base64'))
      layers.push(layer)
    }
    const hands = []
    for (const { url, ...hand } of drawn.hands as { id: string; url: string }[]) {
      await writeFile(path.join(OUT, 'clockwork', `${hand.id}-flat.webp`), Buffer.from(url.split(',')[1], 'base64'))
      hands.push(hand)
    }
    const round = (value: unknown) => JSON.stringify(value, (_key, n) => (typeof n === 'number' ? Math.round(n * 1e4) / 1e4 : n), 2)
    await writeFile(
      path.join(here, '../components/features/scenes/clockwork.ts'),
      `// Made by scripts/renders.ts: the clock's movement and its hands, a picture of each part
// (public/renders/clockwork), each cut alike, \`tall\` times as tall as it is wide; how far
// each moves on it, as shares of its width, for each one of how far the clock is pulled
// apart; and where the middle of the whole is, together and pulled apart as far as
// ${CLOCKWORK_MOST}, as shares of its width and its height.
export const CLOCKWORK = ${round({ most: CLOCKWORK_MOST, tall: drawn.tall, middle: drawn.middle, middleApart: drawn.middleApart, layers })} as const

// And its hands, each drawn straight on (public/renders/clockwork/<hand>-flat), to be
// turned on the page: see scripts/example-view.ts's \`Hand\`.
export const HANDS = ${round(hands)} as const
`,
    )
    console.log('clockwork')
  }
  if (CLOQUE) {
    const theme = (JSON.parse(await readFile(path.resolve(here, '../../../themes/default.json'), 'utf8')) as {
      dark: Record<string, unknown>
    }).dark
    const circuit = CLOQUE_CIRCUIT ? JSON.parse(await readFile(CLOQUE_CIRCUIT, 'utf8')) : null
    const drawn = await page.evaluate(
      async (frames, size, marked, theme, circuit) => {
        const app = (window as any).renders
        // the theme's colours for a board, as PCB mode has them, under the default
        // theme's dark look (boards.ts has the same)
        const colours = {
          'board-mask': '#005413',
          'board-traces': '#006116',
          'board-pour': '#006116',
          'board-pads': '#e1cf4d',
          'board-print': '#ffffff',
          'components-light': '#e7e7e7',
          'components-mid': '#9c9c9c',
          'components-dark': '#737373',
          ...Object.fromEntries(Object.entries(theme).filter(([, value]) => typeof value === 'string')),
        }
        const paint = app.boardPaint(colours)
        if (circuit) app.keepOutsOf(paint, circuit)
        // each thing's faces in the app's colours: the board's own, and the greys of
        // what is on it in the theme's shades for greys (board-mode.tsx's `standing`)
        const painted = (board: any) =>
          board.traverse((thing: any) => {
            if (!thing.isMesh) return
            const own = [thing.material].flat().map((material: any) => {
              const copy = material.clone()
              const ours = app.inOurColours(copy, paint)
              if (ours === null && copy.isMeshStandardMaterial) {
                const shaded = app.shadedOf(copy.color)
                if (shaded) app.inShade(shaded, colours, copy.color)
              }
              return copy
            })
            thing.material = Array.isArray(thing.material) ? own : own[0]
          })
        return app.drawTurning('/cloque.glb', frames, size, marked, painted)
      },
      CLOQUE_FRAMES,
      CLOQUE_SIZE,
      CLOQUE_MARKED,
      theme,
      circuit,
    )
    const pictures = drawn.pictures as string[]
    const frames = await mkdtemp(path.join(tmpdir(), 'cloque-'))
    for (const [index, url] of pictures.entries())
      await writeFile(path.join(frames, `${String(index).padStart(3, '0')}.webp`), Buffer.from(url.split(',')[1], 'base64'))
    // its first frame, and half way round, as stills: for before the film is there
    await writeFile(path.join(OUT, 'cloque.webp'), Buffer.from(pictures[0].split(',')[1], 'base64'))
    await writeFile(path.join(OUT, 'cloque-under.webp'), Buffer.from(pictures[CLOQUE_FRAMES / 2].split(',')[1], 'base64'))
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-framerate', String(CLOQUE_RATE),
      '-i', path.join(frames, '%03d.webp'),
      '-filter_complex', `color=c=0x${CLOQUE_GROUND}:s=${CLOQUE_SIZE}x${CLOQUE_SIZE}:r=${CLOQUE_RATE}[ground];[ground][0:v]overlay=shortest=1,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-g', String(CLOQUE_KEYS), '-bf', '0',
      '-movflags', '+faststart', '-an',
      path.join(OUT, 'cloque.mp4'),
    ])
    await rm(frames, { recursive: true, force: true })
    await rm(path.join(OUT, 'cloque'), { recursive: true, force: true })
    await writeFile(
      path.join(here, '../components/features/scenes/cloque.ts'),
      `// Made by scripts/renders.ts: the Cloque's board turned over and back, as a film
// (public/renders/cloque.mp4) of so many frames at so many a second, and where the
// middle of each of some of its parts is on each frame, as shares of it.
export const CLOQUE = ${JSON.stringify({ frames: CLOQUE_FRAMES, rate: CLOQUE_RATE, marks: drawn.marks })} as const
`,
    )
    console.log('cloque', CLOQUE_FRAMES, 'frames')
  }
  {
    const person = JSON.parse(await readFile(path.join(KIT, 'scenes/person/reference/enclose.reference.json'), 'utf8'))
    const pictures = (await page.evaluate(
      async (frames, size, person) =>
        (window as any).renders.drawBeside(
          '/examples/stool/build',
          { url: '/kit/scenes/person/reference/person.glb', stand: person.stand, against: person.against },
          frames,
          size,
          size / 1000,
          // the view's ground and its text, in the dark; and how far from the one to the
          // other a scene is drawn, as the app draws one in a small picture (reference.tsx)
          { ground: '#171717', ink: '#fafafa', fill: 0.12, line: 0.5 },
        ),
      BESIDE_FRAMES,
      BESIDE_SIZE,
      person,
    )) as string[]
    const frames = await mkdtemp(path.join(tmpdir(), 'beside-'))
    for (const [index, url] of pictures.entries())
      await writeFile(path.join(frames, `${String(index).padStart(3, '0')}.webp`), Buffer.from(url.split(',')[1], 'base64'))
    await writeFile(path.join(OUT, 'beside.webp'), Buffer.from(pictures[0].split(',')[1], 'base64'))
    // each frame on the card's ground, one after another, as a film that goes round for ever
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-framerate', String(BESIDE_RATE),
      '-i', path.join(frames, '%03d.webp'),
      '-filter_complex', `color=c=0x${BESIDE_GROUND}:s=${BESIDE_SIZE}x${BESIDE_SIZE}:r=${BESIDE_RATE}[ground];[ground][0:v]overlay=shortest=1,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-movflags', '+faststart', '-an',
      path.join(OUT, 'beside.mp4'),
    ])
    await rm(frames, { recursive: true, force: true })
    await rm(path.join(OUT, 'beside'), { recursive: true, force: true })
    console.log('beside', pictures.length, 'frames')
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
