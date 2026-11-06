import {
  LayersIcon,
  MessageSquareIcon,
  Rotate3dIcon,
  WorkflowIcon,
} from 'lucide-react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import type { Act } from '../../stageshow/act'
import type { Layout } from '../../stageshow/looks'
import { Round, Scene } from '../fx'
import { AREA, ROUTES } from './clock-routes'
import { CLOQUE } from './cloque'
import './pcb.scss'

// Circuit boards, in PCB mode, as the app draws them: the Table clock example's (its
// technical drawing, its schematic, its routing), and two of the user's own, MEEDEE's
// four layers and the Cloque's in 3D. What is drawn of a board is the app's own
// drawing of it (public/board, made by scripts/boards.ts; public/renders/cloque, by
// scripts/renders.ts): where anything is pointed at on it, it is at the place that
// drawing has it. The clock's drawings are 1600 px wide, 13.84 of their px to a
// millimetre of the board.

/** What is said of what the pointer is over, as the technical view says it: a light label. */
function Label({ children, style, on }: { children: ReactNode; style?: CSSProperties; on: boolean }) {
  return (
    <div className="pcb-label" data-on={on || undefined} style={style}>
      {children}
    </div>
  )
}

/** A place on a drawing for the pointer to go to: a box, in the drawing's px. */
function Spot({ name, x, y, w = 1, h = 1, cursor = 'default' }: { name: string; x: number; y: number; w?: number; h?: number; cursor?: string }) {
  return (
    <span
      className="pcb-spot"
      data-target={name}
      data-cursor={cursor}
      style={{
        left: `calc(${x}px * var(--s))`,
        top: `calc(${y}px * var(--s))`,
        width: `calc(${w}px * var(--s))`,
        height: `calc(${h}px * var(--s))`,
      }}
    />
  )
}

// ── Technical view ─────────────────────────────────────────────────────────
// A board of four layers (MEEDEE, a little instrument), all of it, its top as the
// technical view draws it and the layers under it faint. The pointer goes to a pad of
// U3, the boost converter, which is boxed and named; it is clicked, and its connection
// is X-rayed, as the app does it: the rest of the board dimmed, and that alone drawn
// over it, on every layer it goes through, in the colours of each (public/board/meedee,
// made by scripts/boards.ts). Clicked off, the board is as it was.

type TechState = { over: boolean; xray: boolean }

/** U3's first pad, in the drawing's px, what the app says of it, and how big the drawing is. */
const U3 = { pad: { x: 1334.1, y: 543.7, w: 13.6, h: 6.8 }, said: 'U3.VOUT1, U3.pin1', net: 'V5' }
const MEEDEE = { width: 1600, height: 1296.2 }
/** How the drawing is drawn on the card: as wide as the card, less a margin either side. */
const TECH_SCALE: Record<Layout, number> = { wide: 548 / MEEDEE.width, compact: 332 / MEEDEE.width }

async function techScript(a: Act<TechState>) {
  await a.wait(800)
  await a.move('pad', { duration: 1000 })
  await a.set({ over: true })
  await a.wait(1200)
  await a.click()
  await a.set({ xray: true })
  await a.wait(3200)
  await a.move('away', { duration: 700 })
  await a.click()
  await a.set({ xray: false, over: false })
  await a.wait(1400)
}

function Technical() {
  return (
    <Scene<TechState>
      className="pcb-tech"
      initial={{ over: false, xray: false }}
      poster={{ over: true, xray: true }}
      script={techScript}
      cursor={{ at: { wide: { x: 300, y: 470 }, compact: { x: 200, y: 300 } } }}
    >
      {(s, rect, layout) => {
        const by = TECH_SCALE[layout]
        const pad = rect('pad')
        return (
          <>
            <div
              className="pcb-tech__board"
              data-xray={s.xray || undefined}
              style={{ width: MEEDEE.width * by, height: MEEDEE.height * by } as CSSProperties}
            >
              <img className="pcb-tech__top" src="/board/meedee/top.svg" alt="" draggable={false} />
              <img className="pcb-tech__xray" src="/board/meedee/xray.svg" alt="" draggable={false} />
              <span
                className="pcb-tech__pad"
                data-on={s.over || undefined}
                data-target="pad"
                data-cursor="pointer"
                style={{
                  left: (U3.pad.x - U3.pad.w / 2) * by - 4,
                  top: (U3.pad.y - U3.pad.h / 2) * by - 4,
                  width: U3.pad.w * by + 8,
                  height: U3.pad.h * by + 8,
                }}
              />
              <span className="pcb-tech__away" data-target="away" />
            </div>
            <Label
              on={s.over}
              style={{ left: pad.x + pad.width / 2, top: pad.y - 10, transform: 'translate(-50%, -100%)' }}
            >
              {s.xray ? (
                <>
                  <div>{U3.net}</div>
                  <div className="pcb-label__quiet">X-rayed, 4 layers</div>
                </>
              ) : (
                U3.said
              )}
            </Label>
            <span className="pcb-tech__corner">
              <Round on>
                <LayersIcon />
              </Round>
            </span>
          </>
        )
      }}
    </Scene>
  )
}

// ── In 3D ──────────────────────────────────────────────────────────────────
// A small board of the user's (the Cloque, a clock), as tscircuit makes it in 3D, with
// parts on both of its sides: a picture of it a frame, turned over about its long way
// (public/renders/cloque, cloque.ts, made by scripts/renders.ts). A drag turns it over,
// and its bottom is up, the rotary encoder on it; that is clicked, and picked out, with
// its name and what it is, and a button to say something of it. Let go, it is turned on
// round to its top again.

type ThreeState = { frame: number; picked: 'SW1' | 'U1' | null; held: boolean }

/** What is said of each part that is picked. */
const CLOQUE_PARTS = { SW1: 'Rotary encoder', U1: 'ATtiny1614' } as const
/** Where the board's pictures are drawn, and how big, wide and on a phone: all of it in sight. */
const CLOQUE_AT: Record<Layout, { x: number; y: number; wide: number }> = {
  wide: { x: 50, y: 40, wide: 500 },
  compact: { x: 30, y: 24, wide: 300 },
}
/** How many frames a px of a drag turns it. */
const PER_PX = 24 / 300

async function threeScript(a: Act<ThreeState>) {
  await a.wait(800)
  // a drag across turns it over, its bottom up
  await a.move('ground', { duration: 800 })
  await a.drag('ground-to', (at, from) => a.put({ frame: Math.min(24, Math.max(0, (at.x - from.x) * PER_PX)), held: true }), {
    duration: 1600,
  })
  await a.set({ frame: 24, held: false })
  await a.wait(500)
  // and a click on the encoder picks it out
  await a.click('part-SW1')
  await a.set({ picked: 'SW1' })
  await a.wait(2600)
  await a.key('esc')
  await a.set({ picked: null })
  await a.wait(500)
  // turned on round, to its top again
  await a.move('ground', { duration: 700 })
  await a.drag('ground-to', (at, from) => a.put({ frame: Math.min(48, 24 + Math.max(0, (at.x - from.x) * PER_PX)), held: true }), {
    duration: 1600,
  })
  await a.snap({ frame: 0, held: false })
  await a.wait(500)
  await a.click('part-U1')
  await a.set({ picked: 'U1' })
  await a.wait(2200)
  await a.key('esc')
  await a.set({ picked: null })
  await a.wait(600)
}

function ThreeD() {
  return (
    <Scene<ThreeState>
      className="pcb-3d"
      initial={{ frame: 0, picked: null, held: false }}
      poster={{ frame: 24, picked: 'SW1', held: false }}
      script={threeScript}
      cursor={{ at: { wide: { x: 300, y: 480 }, compact: { x: 180, y: 300 } } }}
    >
      {(s, _rect, layout) => {
        const place = CLOQUE_AT[layout]
        const shown = Math.round(s.frame) % CLOQUE.frames
        const at = (part: 'SW1' | 'U1') => {
          const [x, y] = CLOQUE.marks[part][shown]
          return { x: place.x + x * place.wide, y: place.y + y * place.wide }
        }
        return (
          <>
            <div
              className="pcb-3d__board"
              data-held={s.held || undefined}
              style={{ left: place.x, top: place.y, width: place.wide, height: place.wide }}
            >
              {Array.from({ length: CLOQUE.frames }, (_, index) => (
                <img
                  key={index}
                  src={`/renders/cloque/${String(index).padStart(2, '0')}.webp`}
                  alt=""
                  draggable={false}
                  data-shown={index === shown || undefined}
                />
              ))}
            </div>
            {(['SW1', 'U1'] as const).map((part) => (
              <span
                key={part}
                className="pcb-3d__part"
                data-target={`part-${part}`}
                data-cursor="pointer"
                data-on={s.picked === part || undefined}
                style={{ left: at(part).x, top: at(part).y }}
              />
            ))}
            {/* where a drag across the board starts and ends */}
            <span className="pcb-3d__grab" data-target="ground" data-cursor="open" />
            <span className="pcb-3d__grab pcb-3d__grab--to" data-target="ground-to" data-cursor="open" />
            {(['SW1', 'U1'] as const).map((part) => (
              <div
                key={part}
                className="pcb-picked"
                data-on={s.picked === part || undefined}
                style={{ left: at(part).x + 26, top: at(part).y }}
              >
                <span className="pcb-picked__said">
                  <b>{part}</b>
                  <span>{CLOQUE_PARTS[part]}</span>
                </span>
                <span className="pcb-picked__say">
                  <MessageSquareIcon />
                </span>
              </div>
            ))}
            <span className="pcb-3d__corner">
              <Round on>
                <Rotate3dIcon />
              </Round>
            </span>
          </>
        )
      }}
    </Scene>
  )
}

// ── The schematic ──────────────────────────────────────────────────────────
// How the board is wired, as tscircuit draws it. The pointer goes over the
// microcontroller, big in the middle of the card, which is ringed, and clicks it: over
// it, in the middle, what it is, its maker's number and JLCPCB's, how many JLCPCB has
// and what one costs, and where it sits on the board. A click on the sheet puts it away.

type SchemState = { ring: boolean; open: boolean }

async function schemScript(a: Act<SchemState>) {
  await a.wait(700)
  await a.move('u1', { duration: 1000 })
  await a.set({ ring: true })
  await a.wait(500)
  await a.click()
  await a.set({ open: true })
  await a.wait(3400)
  await a.click('sheet')
  await a.set({ open: false, ring: false })
  await a.wait(1100)
}

function Schematic() {
  return (
    <Scene<SchemState>
      className="pcb-schem"
      initial={{ ring: false, open: false }}
      poster={{ ring: true, open: true }}
      script={schemScript}
      cursor={{ at: { wide: { x: 120, y: 420 }, compact: { x: 60, y: 390 } } }}
    >
      {(s, rect) => {
        const u1 = rect('u1')
        return (
          <>
            <div className="pcb-schem__view">
              <div className="pcb-sheet">
                <img src="/board/schematic.svg" alt="" draggable={false} />
                {/* the microcontroller, as the drawing has it, and its ring 5 px out */}
                <Spot name="u1" x={665} y={484} w={128} h={153} cursor="pointer" />
                <Spot name="sheet" x={560} y={720} w={2} h={2} />
              </div>
            </div>
            <span
              className="pcb-ring"
              data-on={s.ring || undefined}
              style={{ left: u1.x - 6, top: u1.y - 6, width: u1.width + 12, height: u1.height + 12 }}
            />
            <div className="pcb-said pcb-schem__said" data-on={s.open || undefined}>
              <div className="pcb-said__head">
                <div>
                  <div>U1</div>
                  <div className="pcb-said__quiet">ATtiny1616 microcontroller</div>
                </div>
                <span className="pcb-said__badge">Extended part</span>
              </div>
              <dl>
                <div>
                  <dt>Maker’s number</dt>
                  <dd className="pcb-mono pcb-said__quiet">ATTINY1616-SNR</dd>
                </div>
                <div>
                  <dt>JLCPCB</dt>
                  <dd className="pcb-mono pcb-said__link">C609652</dd>
                </div>
                <div>
                  <dt>In stock</dt>
                  <dd className="pcb-mono pcb-said__stock">2,148</dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd>
                    <span className="pcb-mono">$0.912</span>
                    <span className="pcb-said__quiet"> each</span>
                  </dd>
                </div>
              </dl>
              {/* where it sits on the board, as the technical view draws it */}
              <div className="pcb-said__board">
                <img src="/board/top.svg" alt="" draggable={false} />
              </div>
            </div>
            <span className="pcb-schem__corner">
              <Round on>
                <WorkflowIcon />
              </Round>
            </span>
          </>
        )
      }}
    </Scene>
  )
}

// ── Made while you talk ────────────────────────────────────────────────────
// The clock's board, round its microcontroller, being routed in the background: its
// parts placed and what is to be joined drawn straight across, and then trace after
// trace, each tried one way and another before it settles where it goes (its runs as
// the board has them: clock-routes.ts, made by scripts/boards.ts), and the step's
// progress at the foot. Routed, it is the board as it is made; and again.

/** How far apart the traces start, of how long one takes to be tried and settle. */
const GAP = 0.34
/** How long the whole routing takes, in those. */
const ROUTING = (ROUTES.length - 1) * GAP + 1
/** How the drawing is drawn on the card: its traces (about 600 of its px across) as wide as the card leaves them. */
const AGENT_SCALE: Record<Layout, number> = { wide: 564 / 600, compact: 340 / 600 }

type AgentState = {
  /** how far the routing is, in traces' starts (see GAP) */
  at: number
  done: boolean
  /** the whole of it, while the loop starts again */
  shown: boolean
}

const agentStart: AgentState = { at: 0, done: false, shown: true }

async function agentScript(a: Act<AgentState>) {
  await a.wait(900)
  let at = 0
  while (at < ROUTING) {
    await a.wait(45)
    at = Math.min(ROUTING, at + 0.05)
    a.put({ at })
  }
  await a.wait(500)
  await a.set({ done: true })
  await a.wait(2600)
  // and again, from the start: the card is put away and comes back as it began
  await a.set({ shown: false })
  await a.wait(500)
  await a.snap({ ...agentStart, shown: false })
  await a.set({ shown: true })
  await a.wait(300)
}

/** A run's places as an SVG polyline's. */
const pointsOf = (points: number[][]) => points.map(([x, y]) => `${x},${y}`).join(' ')

/**
 * The ways a trace is tried before it settles: from its first place to its last,
 * bowed out to one side and then the other, as a router's first tries are, by as much
 * as the trace is long, and no more than so far.
 */
function triesOf(runs: (typeof ROUTES)[number], index: number) {
  const [x1, y1] = runs[0].points[0]
  const [x2, y2] = runs.at(-1)!.points.at(-1)!
  const long = Math.hypot(x2 - x1, y2 - y1) || 1
  const [nx, ny] = [-(y2 - y1) / long, (x2 - x1) / long]
  return [1, -1].map((side, which) => {
    const out = side * Math.min(60, 18 + long * 0.28) * (index % 2 ? 1 : -1) * (which ? 0.7 : 1)
    const at = (share: number) => [x1 + (x2 - x1) * share + nx * out, y1 + (y2 - y1) * share + ny * out]
    return pointsOf([[x1, y1], at(0.3), at(0.7), [x2, y2]])
  })
}
const TRIES = ROUTES.map(triesOf)

function Agent() {
  return (
    <Scene<AgentState>
      className="pcb-agent"
      initial={agentStart}
      poster={{ at: ROUTING, done: true, shown: true }}
      script={agentScript}
      cursor={{ at: { wide: { x: 470, y: 470 }, compact: { x: 280, y: 300 } } }}
    >
      {(s, _rect, layout) => {
        const by = AGENT_SCALE[layout]
        const half = (layout === 'wide' ? 600 : 360) / 2
        const middle = { x: (AREA.left + AREA.right) / 2, y: (AREA.top + AREA.bottom) / 2 }
        const settled = ROUTES.filter((_, index) => s.at - index * GAP >= 1).length
        return (
          <div className="pcb-agent__all" data-shown={s.shown || undefined} data-done={s.done || undefined}>
            <div className="pcb-agent__view">
              <div
                className="pcb-sheet"
                style={{ '--s': by, '--x0': middle.x - half / by, '--y0': middle.y - half / by } as CSSProperties}
              >
                <img src="/board/placed.svg" alt="" draggable={false} />
                <svg viewBox="0 0 1600 1550" className="pcb-routes">
                  {ROUTES.map((runs, index) => {
                    const into = s.at - index * GAP
                    const state = into >= 1 ? 'settled' : into >= 0 ? 'trying' : 'waiting'
                    return (
                      <g key={index} data-state={state}>
                        {TRIES[index].map((points, which) => (
                          <polyline key={which} className="pcb-routes__try" points={points} pathLength={1} />
                        ))}
                        {runs.map((run, which) => (
                          <polyline
                            key={`run-${which}`}
                            className="pcb-routes__run"
                            data-layer={run.layer}
                            points={pointsOf(run.points)}
                            strokeWidth={run.width}
                            pathLength={1}
                          />
                        ))}
                      </g>
                    )
                  })}
                </svg>
                <img className="pcb-agent__made" src="/board/top.svg" alt="" draggable={false} />
              </div>
            </div>
            <div className="pcb-agent__foot" data-on={(s.at > 0 && !s.done) || undefined}>
              <span className="pcb-agent__ring" style={{ '--share': settled / ROUTES.length } as CSSProperties}>
                <svg viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" />
                  <circle cx="8" cy="8" r="6" pathLength="1" />
                </svg>
              </span>
              <span className="pcb-agent__stage">
                <b>Routing</b>
                <span>{Math.round((settled / ROUTES.length) * 100)}%</span>
              </span>
            </div>
          </div>
        )
      }}
    </Scene>
  )
}

export const PCB: Record<string, ComponentType> = {
  'board-3d': ThreeD,
  'board-technical': Technical,
  'board-schematic': Schematic,
  'board-agent': Agent,
}
