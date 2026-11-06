import {
  ExpandIcon,
  HammerIcon,
  LayoutDashboardIcon,
  LetterTextIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import type { Act } from '../../stageshow/act'
import type { Layout } from '../../stageshow/looks'
import { ReferenceIcon } from '../../app/icons'
import { CORNER, Round, Scene } from '../fx'
import { CLOCKWORK, HANDS } from './clockwork'
import './more.scss'

// And more: the board of pictures a design starts from, the tools the agent makes for
// a model, and the scenes that show how big it really is.

// ── Inspiration board ──────────────────────────────────────────────────────
// A loose board of pictures: materials and finishes, gathered for a project. One is
// clicked and comes up close, the rest pushed aside; a click on it pins a dot, and
// what is said of that place is written beside it and pinned. A click on the ground
// puts the picture back, with its note on it. Then three are picked out together, by a
// box dragged round them, and Cmd+G puts them in a group: they go into one pile, under
// its title and how many it has, as the app's board lays one (inspiration/layout.ts).

type Swatch = 'walnut' | 'aluminium' | 'felt' | 'ceramic' | 'grille' | 'knob' | 'oak'
type Box = { x: number; y: number; w: number; h: number }

/** Where each picture lies on the board, as it is in each design of the card. */
const BOARD: Record<Layout, Record<Swatch, Box>> = {
  wide: {
    ceramic: { x: 30, y: 34, w: 132, h: 172 },
    walnut: { x: 182, y: 62, w: 196, h: 146 },
    grille: { x: 398, y: 26, w: 116, h: 116 },
    felt: { x: 56, y: 232, w: 132, h: 132 },
    knob: { x: 210, y: 236, w: 168, h: 124 },
    aluminium: { x: 400, y: 168, w: 112, h: 150 },
    oak: { x: 318, y: 384, w: 166, h: 112 },
  },
  compact: {
    ceramic: { x: 18, y: 24, w: 92, h: 120 },
    walnut: { x: 124, y: 46, w: 146, h: 108 },
    grille: { x: 196, y: 172, w: 92, h: 92 },
    felt: { x: 24, y: 164, w: 100, h: 100 },
    knob: { x: 30, y: 284, w: 128, h: 94 },
    aluminium: { x: 176, y: 282, w: 84, h: 112 },
    oak: { x: 272, y: 352, w: 120, h: 84 },
  },
}

/** Where the picture that is gone up to comes to: the middle of the board, close. */
const FOCUS: Record<Layout, Box> = {
  wide: { x: 92, y: 92, w: 340, h: 254 },
  compact: { x: 18, y: 70, w: 266, h: 198 },
}
/** Where on the walnut the note is pinned, as shares of it. */
const SPOT = { x: 0.3, y: 0.66 }
const NOTE = 'This grain, on the base'

/** The pictures that go in a group, what it is called, and where its pile is. */
const GROUPED: Swatch[] = ['knob', 'aluminium', 'oak']
const GROUP_TITLE = 'Dial and trim'
const PILE: Record<Layout, { x: number; y: number }> = {
  wide: { x: 372, y: 330 },
  compact: { x: 200, y: 236 },
}
/** How the pictures of a pile lie on one another, the top one first (the app's LAID). */
const LAID = [
  { dx: 0, dy: 0, turn: 0 },
  { dx: -16, dy: 6, turn: -2 },
  { dx: 14, dy: 10, turn: 1.6 },
]
/** Where the box that picks them out is dragged from and to, round them. */
const MARQUEE: Record<Layout, { from: { x: number; y: number }; to: { x: number; y: number } }> = {
  wide: { from: { x: 528, y: 508 }, to: { x: 198, y: 158 } },
  compact: { from: { x: 300, y: 350 }, to: { x: 22, y: 168 } },
}

type BoardState = {
  focused: boolean
  /** the note: being written, or pinned, or not there */
  note: 'none' | 'writing' | 'pinned'
  text: string
  /** the box being dragged round some of the pictures, in the card's px */
  marquee: { x0: number; y0: number; x1: number; y1: number } | null
  picked: boolean
  grouped: boolean
  /** the whole board, faded out for the loop to start again */
  gone: boolean
}

const boardStart: BoardState = {
  focused: false,
  note: 'none',
  text: '',
  marquee: null,
  picked: false,
  grouped: false,
  gone: false,
}

async function boardScript(a: Act<BoardState>) {
  await a.wait(900)
  await a.click('walnut')
  await a.set({ focused: true })
  await a.wait(900)
  await a.click('spot')
  await a.set({ note: 'writing' })
  await a.wait(400)
  await a.type('text', NOTE, { interval: 45 })
  await a.wait(500)
  await a.click('pin')
  await a.set({ note: 'pinned' })
  await a.wait(2600)
  await a.click('ground')
  await a.set({ focused: false })
  await a.wait(1400)
  // three of them picked out by a box dragged round them, and grouped
  await a.move('marquee-from', { duration: 700 })
  await a.drag(
    'marquee-to',
    (at, from) => {
      const [x0, y0, x1, y1] = [from.x, from.y, at.x, at.y]
      a.put({ marquee: { x0, y0, x1, y1 } })
    },
    { duration: 1100, cursor: 'preserve' },
  )
  await a.set({ marquee: null, picked: true })
  await a.wait(500)
  await a.key('cmd+g')
  await a.set({ picked: false, grouped: true })
  await a.wait(3000)
  // the board goes, and comes back as it was found
  await a.set({ gone: true })
  await a.wait(500)
  await a.snap({ ...boardStart, gone: true })
  await a.set({ gone: false })
  await a.wait(300)
}

/** How far a picture is pushed aside, away from the middle, when another comes up. */
function pushed(box: Box, focus: Box): string {
  const cx = box.x + box.w / 2 - (focus.x + focus.w / 2)
  const cy = box.y + box.h / 2 - (focus.y + focus.h / 2)
  const length = Math.hypot(cx, cy) || 1
  return `translate(${(cx / length) * 64}px, ${(cy / length) * 84}px) scale(0.94)`
}

function Board() {
  return (
    <Scene<BoardState>
      className="mx-board"
      initial={boardStart}
      poster={{ ...boardStart, note: 'pinned', text: NOTE, grouped: true }}
      script={boardScript}
      cursor={{ at: { wide: { x: 470, y: 420 }, compact: { x: 250, y: 400 } } }}
    >
      {(s, rect, layout) => {
        const focus = FOCUS[layout]
        const spot = { x: focus.x + focus.w * SPOT.x, y: focus.y + focus.h * SPOT.y }
        const pile = PILE[layout]
        const stage = rect('ground-all')
        const box = s.marquee && {
          left: Math.min(s.marquee.x0, s.marquee.x1) - stage.x,
          top: Math.min(s.marquee.y0, s.marquee.y1) - stage.y,
          width: Math.abs(s.marquee.x1 - s.marquee.x0),
          height: Math.abs(s.marquee.y1 - s.marquee.y0),
        }
        return (
          <div className="mx-board__all" data-gone={s.gone || undefined} data-target="ground-all">
            <div className="mx-board__ground" data-target="ground" />
            <span className="mx-board__spot" data-target="marquee-from" style={{ left: MARQUEE[layout].from.x, top: MARQUEE[layout].from.y }} />
            <span className="mx-board__spot" data-target="marquee-to" style={{ left: MARQUEE[layout].to.x, top: MARQUEE[layout].to.y }} />
            {(Object.keys(BOARD[layout]) as Swatch[]).map((swatch) => {
              const box = BOARD[layout][swatch]
              const up = swatch === 'walnut' && s.focused
              const aside = s.focused && swatch !== 'walnut'
              // the walnut goes up by a move and a scale, from where it lies to the middle
              const scale = focus.w / box.w
              // and those grouped lie in the pile, each turned as the app lays them
              const inPile = GROUPED.indexOf(swatch)
              const laid = LAID[inPile]
              const piled =
                s.grouped && laid
                  ? `translate(${pile.x - box.w / 2 - box.x + laid.dx}px, ${pile.y - box.h / 2 - box.y + laid.dy}px) ` +
                    `translate(${box.w / 2}px, ${box.h / 2}px) rotate(${laid.turn}deg) translate(${-box.w / 2}px, ${-box.h / 2}px)`
                  : undefined
              const style: CSSProperties = {
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                transform: up
                  ? `translate(${focus.x - box.x}px, ${focus.y - box.y}px) scale(${scale})`
                  : aside
                    ? pushed(box, focus)
                    : piled,
                zIndex: s.grouped && laid ? 3 + (LAID.length - inPile) : undefined,
              }
              return (
                <div
                  key={swatch}
                  className="mx-picture"
                  data-up={up || undefined}
                  data-aside={aside || undefined}
                  data-picked={(s.picked && inPile >= 0) || undefined}
                  data-target={swatch === 'walnut' ? 'walnut' : undefined}
                  data-cursor={swatch === 'walnut' ? (s.focused ? 'crosshair' : 'pointer') : undefined}
                  style={style}
                >
                  <Picture kind={swatch} />
                  {swatch === 'walnut' && s.note === 'pinned' && (
                    <span
                      className="mx-mark"
                      style={{
                        left: `${SPOT.x * 100}%`,
                        top: `${SPOT.y * 100}%`,
                        // at the size it is read at, however big the picture is drawn
                        scale: s.focused ? 1 / scale : 1,
                      }}
                    />
                  )}
                </div>
              )
            })}

            {/* the box dragged round what is picked out, and the group's title over its pile */}
            {box && <div className="mx-marquee" style={box} />}
            <div className="mx-group" data-on={s.grouped || undefined} style={{ left: pile.x, top: pile.y - 92 }}>
              <span>{GROUP_TITLE}</span>
              <b>{GROUPED.length}</b>
            </div>

            {/* where the note goes, to be clicked: on the picture once it is up */}
            <span className="mx-board__spot" data-target="spot" data-cursor="crosshair" style={{ left: spot.x, top: spot.y }} />

            {/* what is said of it: written, and then pinned and shown */}
            <div
              className="mx-writing"
              data-on={(s.focused && s.note === 'writing') || undefined}
              style={{ left: spot.x, top: spot.y }}
            >
              <span className="mx-writing__dot" />
              <div className="mx-writing__box">
                <div className="mx-writing__text">
                  {s.text ? (
                    <span className="mx-writing__typed">{s.text}</span>
                  ) : (
                    <span className="mx-writing__placeholder">What matters here?</span>
                  )}
                </div>
                <div className="mx-writing__foot">
                  <span className="mx-writing__pin" data-target="pin" data-cursor="pointer">
                    Pin
                  </span>
                </div>
              </div>
            </div>
            <div
              className="mx-said"
              data-on={(s.focused && s.note === 'pinned') || undefined}
              style={{ left: spot.x, top: spot.y }}
            >
              {NOTE}
            </div>

            <div className="mx-board__buttons">
              <Round>
                <LetterTextIcon />
              </Round>
              <Round>
                <LayoutDashboardIcon />
              </Round>
              <Round>
                <ExpandIcon />
              </Round>
              <Round>
                <SearchIcon />
              </Round>
              <span className="mx-exit">
                <XIcon />
              </span>
            </div>
          </div>
        )
      }}
    </Scene>
  )
}

/**
 * A picture on the board: a material or a thing, as it would be photographed, drawn
 * here so that the page has no photographs to carry.
 */
function Picture({ kind }: { kind: Swatch }) {
  const id = useId().replace(/:/g, '')
  const grain = `${id}-grain`
  const noise = `${id}-noise`
  const light = `${id}-light`
  const body = `${id}-body`
  switch (kind) {
    case 'walnut':
    case 'oak': {
      // Its grain is lines along the board, of uneven widths, waved by the figure of
      // the wood: stripes moved about by a slow noise, as a plank is cut through rings.
      const walnut = kind === 'walnut'
      const [ground, late, early] = walnut ? ['#5b3a24', '#3d2516', '#7a5236'] : ['#c9a77d', '#a9845a', '#dcc29f']
      return (
        <svg className="mx-art" viewBox="0 0 200 150" preserveAspectRatio="none" aria-hidden>
          <pattern id={body} width="200" height="23" patternUnits="userSpaceOnUse">
            <rect width="200" height="23" fill={ground} />
            <rect y="2" width="200" height="1.4" fill={late} />
            <rect y="6" width="200" height="3.2" fill={early} opacity="0.6" />
            <rect y="10.5" width="200" height="0.8" fill={late} />
            <rect y="13" width="200" height="2.2" fill={late} opacity="0.7" />
            <rect y="17" width="200" height="4" fill={early} opacity="0.45" />
            <rect y="21.5" width="200" height="0.7" fill={late} />
          </pattern>
          <filter id={grain} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.035" numOctaves="3" seed={walnut ? 7 : 3} result="figure" />
            <feDisplacementMap in="SourceGraphic" in2="figure" scale={walnut ? 34 : 26} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id={noise} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.8" numOctaves="2" seed="5" />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 -0.1" />
          </filter>
          <linearGradient id={light} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.22" />
          </linearGradient>
          <g filter={`url(#${grain})`}>
            <rect x="-20" y="-20" width="240" height="190" fill={`url(#${body})`} />
          </g>
          <rect width="200" height="150" filter={`url(#${noise})`} opacity="0.5" />
          <rect width="200" height="150" fill={`url(#${light})`} />
        </svg>
      )
    }
    case 'aluminium':
      return (
        <svg className="mx-art" viewBox="0 0 120 160" preserveAspectRatio="none" aria-hidden>
          <linearGradient id={body} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8a9098" />
            <stop offset="0.45" stopColor="#d6dade" />
            <stop offset="0.6" stopColor="#c3c8cd" />
            <stop offset="1" stopColor="#7d838b" />
          </linearGradient>
          <filter id={noise} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9 0.004" numOctaves="2" seed="4" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.6 0 0 0 -0.2" />
          </filter>
          <rect width="120" height="160" fill={`url(#${body})`} />
          <rect width="120" height="160" filter={`url(#${noise})`} opacity="0.35" />
        </svg>
      )
    case 'felt':
      return (
        <svg className="mx-art" viewBox="0 0 120 120" preserveAspectRatio="none" aria-hidden>
          <filter id={noise} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="9" />
            <feColorMatrix type="matrix" values="0 0 0 0.22 0.3  0 0 0 0.22 0.3  0 0 0 0.2 0.29  0 0 0 0 1" />
          </filter>
          <radialGradient id={light} cx="0.3" cy="0.25" r="0.9">
            <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#000" stopOpacity="0.3" />
          </radialGradient>
          <rect width="120" height="120" filter={`url(#${noise})`} />
          <rect width="120" height="120" fill={`url(#${light})`} />
        </svg>
      )
    case 'ceramic':
      return (
        <svg className="mx-art" viewBox="0 0 132 172" preserveAspectRatio="none" aria-hidden>
          <linearGradient id={light} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e9e3da" />
            <stop offset="0.72" stopColor="#d9d1c5" />
            <stop offset="0.72" stopColor="#cbc2b5" />
            <stop offset="1" stopColor="#bdb3a5" />
          </linearGradient>
          <linearGradient id={body} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fbf8f3" />
            <stop offset="0.35" stopColor="#f1ece4" />
            <stop offset="0.8" stopColor="#c9c1b5" />
            <stop offset="1" stopColor="#b2a99c" />
          </linearGradient>
          <rect width="132" height="172" fill={`url(#${light})`} />
          <ellipse cx="68" cy="136" rx="40" ry="6" fill="#000" opacity="0.16" />
          {/* a lamp in glazed ceramic: a round shade over a short stem */}
          <path
            d="M36 74 C36 48 50 36 66 36 C82 36 96 48 96 74 Z"
            fill={`url(#${body})`}
          />
          <rect x="62" y="74" width="8" height="40" fill={`url(#${body})`} />
          <path d="M44 134 C44 120 52 114 66 114 C80 114 88 120 88 134 Z" fill={`url(#${body})`} />
          <ellipse cx="66" cy="74" rx="30" ry="3.4" fill="#a99f92" opacity="0.6" />
        </svg>
      )
    case 'grille':
      return (
        <svg className="mx-art" viewBox="0 0 120 120" preserveAspectRatio="none" aria-hidden>
          <linearGradient id={body} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3b3f45" />
            <stop offset="0.5" stopColor="#2a2d32" />
            <stop offset="1" stopColor="#1b1d20" />
          </linearGradient>
          <pattern id={grain} width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="2" fill="#0b0c0d" />
            <circle cx="4" cy="3.4" r="1.4" fill="#000" />
          </pattern>
          <radialGradient id={light} cx="0.25" cy="0.2" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <rect width="120" height="120" fill={`url(#${body})`} />
          <rect width="120" height="120" fill={`url(#${grain})`} />
          <rect width="120" height="120" fill={`url(#${light})`} />
        </svg>
      )
    case 'knob':
      return (
        <svg className="mx-art" viewBox="0 0 168 124" preserveAspectRatio="none" aria-hidden>
          <linearGradient id={light} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e4e5e3" />
            <stop offset="1" stopColor="#c6c8c5" />
          </linearGradient>
          <radialGradient id={body} cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stopColor="#ffb36b" />
            <stop offset="0.55" stopColor="#f07a22" />
            <stop offset="1" stopColor="#b9500e" />
          </radialGradient>
          <rect width="168" height="124" fill={`url(#${light})`} />
          <ellipse cx="90" cy="96" rx="40" ry="10" fill="#000" opacity="0.14" />
          {/* an anodised dial, knurled round its edge */}
          <circle cx="84" cy="60" r="36" fill="#a8460c" />
          <circle cx="84" cy="60" r="36" fill="none" stroke="#7d3308" strokeWidth="3" strokeDasharray="1.6 2" />
          <circle cx="84" cy="58" r="30" fill={`url(#${body})`} />
          <rect x="82.5" y="34" width="3" height="12" rx="1.5" fill="#fff" opacity="0.85" />
        </svg>
      )
  }
}

// ── Tools made for your model ──────────────────────────────────────────────
// The clock's movement, and a tool its agent made for it: the time, to be set to twelve,
// three or six. Each is picked in turn, and the hands go round to it, the minute hand
// round the hours between. (The movement is the explode card's pictures of it, put
// together, clockwork.ts; the hands are drawn straight on, and laid on its face as it
// is seen, to be turned on the page.)

/** The times the tool has, in hours from twelve. */
const TIMES = [
  { hours: 3, said: '3:00' },
  { hours: 6, said: '6:00' },
  { hours: 12, said: '12:00' },
] as const

type ToolsState = { hours: number }

async function toolsScript(a: Act<ToolsState>) {
  await a.wait(1000)
  for (const time of TIMES) {
    await a.click(`time-${time.hours}`)
    await a.set({ hours: time.hours })
    await a.wait(2600)
  }
  // twelve is where it began
  await a.snap({ hours: 0 })
  await a.wait(300)
}

/**
 * How wide the movement's pictures are drawn, and where its middle is, wide and on a
 * phone: in the middle of the card. (Its middle as clockwork.ts has it is of the boxes
 * round its parts, which reach a little further to the right than it is seen to: so
 * it is set as far the other way, of how wide it is drawn.)
 */
const MOVEMENT: Record<Layout, { wide: number; x: number; y: number }> = {
  wide: { wide: 900, x: 300 - 0.027 * 900, y: 300 },
  compact: { wide: 530, x: 180 - 0.027 * 530, y: 180 },
}
/** Its parts that stay as they are: all but the hands that are turned. */
const STILL = [...CLOCKWORK.layers].filter((part) => !HANDS.some((hand) => hand.id === part.id)).sort((a, b) => a.z - b.z)
/** How big a hand's element is, before it is laid on the face. */
const HAND_PX = 100

function Movement({ hours, layout }: { hours: number; layout: Layout }) {
  const { wide, x, y } = MOVEMENT[layout]
  const left = x - CLOCKWORK.middle[0] * wide
  const top = y - CLOCKWORK.middle[1] * wide * CLOCKWORK.tall
  return (
    <div className="mx-movement" style={{ left, top, width: wide, height: wide * CLOCKWORK.tall }}>
      {STILL.map((part) => (
        <img key={part.id} src={`/renders/clockwork/${part.id}.webp`} alt="" draggable={false} />
      ))}
      {HANDS.map((hand) => {
        // a px of its picture is so many mm of the face: laid on the face as it is seen
        const mm = (hand.half * 2) / HAND_PX
        const matrix = [
          hand.across[0] * wide * mm,
          hand.across[1] * wide * mm,
          -hand.up[0] * wide * mm,
          -hand.up[1] * wide * mm,
        ]
        const to = hand.id === 'hour-hand' ? hours * 30 : hours * 360
        return (
          <div
            key={hand.id}
            className="mx-movement__hand"
            style={{
              left: hand.pivot[0] * wide - HAND_PX / 2,
              top: hand.pivot[1] * wide - HAND_PX / 2,
              width: HAND_PX,
              height: HAND_PX,
              transform: `matrix(${matrix.join(',')},0,0)`,
            }}
          >
            <img
              src={`/renders/clockwork/${hand.id}-flat.webp`}
              alt=""
              draggable={false}
              style={{ transform: `rotate(${to - hand.angle}deg)` }}
            />
          </div>
        )
      })}
    </div>
  )
}

function Control({ title, says, children }: { title: string; says: string; children: ReactNode }) {
  return (
    <div className="mx-control">
      <div className="mx-control__about">
        <div>{title}</div>
        <div>{says}</div>
      </div>
      <div className="mx-control__set">{children}</div>
    </div>
  )
}

function Tools() {
  return (
    <Scene<ToolsState>
      className="mx-tools"
      initial={{ hours: 0 }}
      poster={{ hours: 3 }}
      script={toolsScript}
      cursor={{ at: { wide: { x: 300, y: 560 }, compact: { x: 200, y: 340 } } }}
    >
      {(s, _rect, layout) => (
        <>
          <Movement hours={s.hours} layout={layout} />
          <Round tool on style={{ position: 'absolute', top: CORNER, right: CORNER }}>
            <HammerIcon />
          </Round>
          <div className="fx-tools mx-tools__panel">
            <div className="mx-tabs">
              <span className="mx-tabs__on">Clock</span>
              <span>Alarm</span>
            </div>
            <Control title="Time" says="Where the hands point.">
              <div className="mx-choice">
                {TIMES.map((time) => (
                  <span
                    key={time.hours}
                    data-on={s.hours % 12 === time.hours % 12 || undefined}
                    data-target={`time-${time.hours}`}
                    data-cursor="pointer"
                  >
                    {time.said}
                  </span>
                ))}
              </div>
            </Control>
          </div>
        </>
      )}
    </Scene>
  )
}

// ── Seen at its size ───────────────────────────────────────────────────────
// The counter stool, at its size beside the app's own figure of a person (its Person
// scene), turning round slowly: drawn as the view draws them, the stool in its colours
// and the figure as a scene is, a tone over the view, lined. A film of it going round,
// smooth as a picture a frame could not be (public/renders/beside.mp4, made by
// scripts/renders.ts), and its first frame for before it plays, and for whoever has
// motion turned down.

/**
 * The film, loaded and played only while it is in sight (and not at all where motion is
 * turned down: its first frame is under it).
 */
function Film({ src, className }: { src: string; className?: string }) {
  const film = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const playing = film.current
    if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const watching = new IntersectionObserver(([seen]) => {
      if (seen.isIntersecting) void playing.play().catch(() => {})
      else playing.pause()
    })
    watching.observe(playing)
    return () => watching.disconnect()
  }, [])
  return <video ref={film} className={className} src={src} muted loop playsInline preload="none" aria-hidden />
}

/**
 * (the stage plays its script over and over: one that ends at once would go round with
 * nothing in between, and hold the page up)
 */
const still = (a: Act<object>) => a.wait(60_000)

function Reference() {
  return (
    <Scene<object> className="mx-reference" initial={{}} script={still}>
      {() => (
        <>
          <img className="mx-reference__still" src="/renders/beside.webp" alt="" draggable={false} />
          <Film className="mx-reference__film" src="/renders/beside.mp4" />
          <Round on style={{ position: 'absolute', top: CORNER, right: CORNER }}>
            <ReferenceIcon />
          </Round>
        </>
      )}
    </Scene>
  )
}

export const MORE: Record<string, ComponentType> = {
  inspiration: Board,
  tools: Tools,
  reference: Reference,
}
