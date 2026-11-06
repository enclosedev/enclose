import {
  BoxesIcon,
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  HandIcon,
  LayersIcon,
  MessageSquareIcon,
  Rotate3dIcon,
  SearchIcon,
  SquareIcon,
  WorkflowIcon,
  XIcon,
} from 'lucide-react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { Collapse } from '../../stageshow/motion/Collapse'
import type { Act } from '../../stageshow/act'
import type { Layout } from '../../stageshow/looks'
import { BoardIcon } from '../../app/icons'
import { Bubble, Composer, Round, Scene } from '../fx'
import './pcb.scss'

// Circuit boards: the Table clock example's board in PCB mode, as the app draws it.
// What is drawn of the board is the app's own drawing of it (public/board, made by
// scripts/boards.ts from examples/clock): where anything is pointed at on it, it is
// at the place that drawing has it. A drawing is 1600 px wide, and 13.84 of its px
// are a millimetre of the board.

// ── PCB mode's buttons ─────────────────────────────────────────────────────
// Down the right of the view, in place of the model's: the three ways of looking at
// the board (and under the one that is up, what it has: the technical view's layers,
// the 3D view's hand), the parts on it, search, and the red way out.

type As = 'pcb' | '3d' | 'schematic'

function BoardButtons({
  as,
  layer = 1,
  tip,
  className,
}: {
  as: As
  layer?: 1 | 2
  /** the button whose tip is up, by its target name */
  tip?: string | null
  className?: string
}) {
  return (
    <div className={`pcb-buttons${className ? ` ${className}` : ''}`}>
      <Round on={as === 'pcb'} tip="Technical view" keys="T">
        <LayersIcon />
      </Round>
      {as === 'pcb' &&
        ([1, 2] as const).map((one) => (
          <span key={one} className="pcb-under">
            <Round on={layer === one} target={`layer-${one}`} tip={`Layer ${one}`} keys={String(one)} showTip={tip === `layer-${one}`}>
              <span className="pcb-number">{one}</span>
            </Round>
          </span>
        ))}
      <Round on={as === '3d'} tip="3D view" keys="B">
        <Rotate3dIcon />
      </Round>
      {as === '3d' && (
        <span className="pcb-under">
          <Round tip="Hand" keys="H">
            <HandIcon />
          </Round>
        </span>
      )}
      <Round on={as === 'schematic'} tip="Schematic" keys="S">
        <WorkflowIcon />
      </Round>
      <Round tip="Parts" keys="P">
        <BoxesIcon />
      </Round>
      {as !== 'schematic' && (
        <Round tip="Search" keys="⌘F">
          <SearchIcon />
        </Round>
      )}
      <span className="pcb-exit">
        <Round tip="Exit PCB mode" keys="Esc">
          <XIcon />
        </Round>
      </span>
    </div>
  )
}

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
// The board as it will be made, its parts standing on it: the board is the app's own
// drawing of it in the 3D view's colours (made.svg), laid down in perspective with
// its edge under it, and each part a block of its size and height. It is turned round
// by a drag, and a part is clicked: it is picked out, with its name and what it is,
// and a button to say something of it. Esc lets it go, and it is turned back.

/** A part on the board: where its body is in made.svg's px, how tall, and its look. */
type Part = { id: string; x: number; y: number; w: number; d: number; h: number; look: 'chip' | 'metal' | 'plastic' | 'cream' | 'tan' | 'button' }

const PARTS: Part[] = [
  { id: 'u1', x: 287, y: 324, w: 176, d: 94, h: 24, look: 'chip' },
  { id: 'u2', x: 545, y: 202, w: 46, d: 142, h: 24, look: 'chip' },
  { id: 'sw1', x: 727, y: 120, w: 98, d: 86, h: 42, look: 'metal' },
  { id: 'sw1-cap', x: 755, y: 145, w: 42, d: 36, h: 64, look: 'button' },
  { id: 'j3', x: 441, y: 126, w: 115, d: 34, h: 34, look: 'plastic' },
  { id: 'j2', x: 684, y: 338, w: 184, d: 70, h: 88, look: 'cream' },
  { id: 'y1', x: 404, y: 492, w: 46, d: 22, h: 14, look: 'metal' },
  { id: 'c3', x: 356, y: 485, w: 16, d: 30, h: 10, look: 'tan' },
  { id: 'c4', x: 481, y: 485, w: 16, d: 30, h: 10, look: 'tan' },
  { id: 'c2', x: 242, y: 354, w: 16, d: 32, h: 10, look: 'tan' },
  { id: 'c5', x: 627, y: 368, w: 20, d: 38, h: 14, look: 'tan' },
  { id: 'c1', x: 1336, y: 1112, w: 30, d: 40, h: 16, look: 'tan' },
]

/** How the view's px go to the drawing's, and how far the board is tipped back. */
const SCALE_3D: Record<Layout, number> = { wide: 0.27, compact: 0.18 }

/** A part, as layers of its outline one above another: a solid block, at any angle. */
function Block({ part, scale, picked }: { part: Part; scale: number; picked?: boolean }) {
  const high = Math.max(2, Math.round(part.h * scale))
  return (
    <div
      className={`pcb-block pcb-block--${part.look}`}
      data-picked={picked || undefined}
      style={{ left: part.x * scale, top: part.y * scale, width: part.w * scale, height: part.d * scale }}
    >
      {Array.from({ length: high + 1 }, (_, at) => (
        <i
          key={at}
          data-top={at === high || undefined}
          data-target={at === high ? part.id : undefined}
          data-cursor={at === high ? 'pointer' : undefined}
          style={{ transform: `translateZ(${at}px)` }}
        />
      ))}
    </div>
  )
}

/** The USB-C socket, which sits at the board's edge turned with it. */
const USB = { x: 1428, y: 1150, w: 112, d: 86, h: 44, turn: -45 }

type ThreeState = { turn: number; picked: boolean; held: boolean }
const TURNED = -24

async function threeScript(a: Act<ThreeState>) {
  await a.wait(800)
  // a drag across the board turns it round
  await a.move('ground', { duration: 800 })
  await a.drag(
    'ground-to',
    (at, from) => a.put({ turn: TURNED + (at.x - from.x) * 0.38, held: true }),
    { duration: 1500 },
  )
  await a.set({ held: false })
  await a.wait(500)
  // and a click on a part picks it out
  await a.click('u2')
  await a.set({ picked: true })
  await a.wait(2600)
  await a.key('esc')
  await a.set({ picked: false })
  await a.wait(500)
  // turned back, for another look
  await a.move('ground-to', { duration: 700 })
  await a.drag(
    'ground',
    (at, from) => a.put({ turn: TURNED + 0.38 * 170 + (at.x - from.x) * 0.38, held: true }),
    { duration: 1400 },
  )
  await a.snap({ turn: TURNED, held: false })
  await a.wait(500)
}

function ThreeD() {
  return (
    <Scene<ThreeState>
      className="pcb-3d"
      initial={{ turn: TURNED, picked: false, held: false }}
      poster={{ turn: TURNED + 64, picked: true, held: false }}
      script={threeScript}
      cursor={{ at: { wide: { x: 300, y: 420 }, compact: { x: 180, y: 390 } } }}
    >
      {(s, rect, layout) => {
        const scale = SCALE_3D[layout]
        const u2 = rect('u2')
        return (
          <>
            <div className="pcb-3d__name">
              <BoardIcon />
              Clock board
            </div>
            <div className="pcb-3d__space">
              <div
                className="pcb-3d__board"
                data-held={s.held || undefined}
                style={{ width: 1600 * scale, height: 1600 * scale, transform: `rotateX(56deg) rotateZ(${s.turn}deg)` }}
              >
                {[6, 5, 4, 3, 2, 1].map((down) => (
                  <i key={down} className="pcb-3d__edge" style={{ transform: `translateZ(${-down}px)` }} />
                ))}
                <img className="pcb-3d__top" src="/board/made.svg" alt="" draggable={false} />
                <div className="pcb-3d__parts" data-picking={s.picked || undefined}>
                  {PARTS.map((part) => (
                    <Block key={part.id} part={part} scale={scale} picked={s.picked && part.id === 'u2'} />
                  ))}
                  <div
                    className="pcb-3d__usb"
                    style={{
                      left: USB.x * scale,
                      top: USB.y * scale,
                      transform: `rotateZ(${USB.turn}deg)`,
                    }}
                  >
                    <Block part={{ id: 'j1', x: 0, y: 0, w: USB.w, d: USB.d, h: USB.h, look: 'metal' }} scale={scale} />
                  </div>
                </div>
              </div>
            </div>
            {/* where a drag across the board starts and ends: on its ground, clear of its parts */}
            <span className="pcb-3d__grab" data-target="ground" data-cursor="open" />
            <span className="pcb-3d__grab pcb-3d__grab--to" data-target="ground-to" data-cursor="open" />
            <div
              className="pcb-picked"
              data-on={s.picked || undefined}
              style={
                layout === 'wide'
                  ? { left: u2.x + u2.width + 14, top: u2.y + u2.height / 2 }
                  : { left: u2.x + u2.width / 2 - 60, top: u2.y - 30 }
              }
            >
              <span className="pcb-picked__said">
                <b>U2</b>
                <span>ULN2003ADR</span>
              </span>
              <span className="pcb-picked__say">
                <MessageSquareIcon />
              </span>
            </div>
            <BoardButtons as="3d" />
          </>
        )
      }}
    </Scene>
  )
}

// ── The schematic ──────────────────────────────────────────────────────────
// How the board is wired, as tscircuit draws it. The pointer goes over the
// microcontroller, which is ringed, and clicks it: beside it, what it is, its maker's
// number and JLCPCB's, how many JLCPCB has and what one costs, and where it sits on
// the board. A click on the sheet puts it away.

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
      {(s, rect, layout) => {
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
            <div
              className="pcb-said"
              data-on={s.open || undefined}
              style={
                layout === 'wide'
                  ? { left: u1.x + u1.width + 16, top: u1.y - 38 }
                  : { left: u1.x - 6, top: u1.y + u1.height + 14 }
              }
            >
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
            <BoardButtons as="schematic" />
          </>
        )
      }}
    </Scene>
  )
}

// ── Made while you talk ────────────────────────────────────────────────────
// A board made in detail in the background, by an agent of its own: its card in the
// conversation says the step it is on, and PCB mode beside it draws the board as each
// build of it comes in, its traces filling in as it is routed. Meanwhile you say
// something of it, which is passed on to the board's agent. Then it is checked, and
// ready to order.

type Step = 'placing' | 'connecting' | 'routing' | 'checking' | 'done'
const STEPS: { step: Exclude<Step, 'done'>; name: string }[] = [
  { step: 'placing', name: 'Placing parts' },
  { step: 'connecting', name: 'Connecting' },
  { step: 'routing', name: 'Routing' },
  { step: 'checking', name: 'Checking' },
]
const SAID: Record<Step, string> = {
  placing: 'Placing the parts round the motor’s socket.',
  connecting: 'Joining the ATtiny to the motor driver.',
  routing: 'Routing the motor’s lines round the crystal.',
  checking: 'Checking it as JLCPCB would make it.',
  done: 'Routed and checked: it is ready to order.',
}
const ASKED = 'Keep the USB-C at the edge, for the plug.'

type AgentState = {
  step: Step
  /** how far the routing is, 0 to 1 */
  routed: number
  typed: string
  sent: boolean
  passed: boolean
  /** the whole of it, while the loop starts again */
  shown: boolean
}

const agentStart: AgentState = { step: 'connecting', routed: 0, typed: '', sent: false, passed: false, shown: true }

async function agentScript(a: Act<AgentState>) {
  await a.wait(1400)
  await a.set({ step: 'routing' })
  // the routing goes on by itself, while you write
  let routed = 0
  const routing = (async () => {
    while (routed < 1) {
      await a.wait(120)
      routed = Math.min(1, routed + 0.022)
      a.put({ routed })
    }
  })()
  // (stopped, as the card goes out of sight, it is the script's to say so, not this)
  routing.catch(() => {})
  await a.wait(600)
  await a.move('write', { duration: 700 })
  await a.click()
  await a.type('typed', ASKED, { interval: 32 })
  await a.wait(250)
  await a.click('send')
  await a.set({ typed: '', sent: true })
  await a.wait(1000)
  await a.set({ passed: true })
  await routing
  await a.set({ step: 'checking' })
  await a.wait(1500)
  await a.set({ step: 'done' })
  await a.wait(2800)
  // and again, from the start: the card is put away and comes back as it began
  await a.set({ shown: false })
  await a.wait(500)
  await a.snap({ ...agentStart, shown: false })
  await a.set({ shown: true })
  await a.wait(300)
}

function StepsInLine({ step }: { step: Step }) {
  const at = step === 'done' ? STEPS.length : STEPS.findIndex((one) => one.step === step)
  return (
    <ol className="pcb-steps">
      {STEPS.map((one, index) => (
        <li key={one.step} data-state={index < at ? 'done' : index === at ? 'now' : 'later'}>
          {index < at ? <CheckIcon /> : index === at ? <i className="pcb-spin" /> : <i className="pcb-dot" />}
          <span>{one.name}</span>
        </li>
      ))}
    </ol>
  )
}

function JobCard({ step }: { step: Step }) {
  const working = step !== 'done'
  return (
    <div className="pcb-job">
      <div className="pcb-job__head">
        <BoardIcon />
        <span className="pcb-job__name">Clock board</span>
        {working && (
          <span className="pcb-job__badge">
            <span>Working</span>
          </span>
        )}
        <span className="pcb-job__does">
          <span className="pcb-job__show" data-target="show">
            <EyeIcon />
          </span>
          {working ? (
            <span className="pcb-job__stop">
              <SquareIcon />
            </span>
          ) : (
            <span className="pcb-job__made">
              <CheckIcon />
            </span>
          )}
        </span>
      </div>
      {working && <StepsInLine step={step} />}
      <p className="pcb-job__said" key={step}>
        {SAID[step]}
      </p>
      <span className="pcb-job__more">
        See all
        <ChevronDownIcon />
      </span>
    </div>
  )
}

function Agent() {
  return (
    <Scene<AgentState>
      className="pcb-agent"
      initial={agentStart}
      poster={{ step: 'routing', routed: 0.64, typed: '', sent: true, passed: true, shown: true }}
      script={agentScript}
      cursor={{ at: { wide: { x: 430, y: 330 }, compact: { x: 200, y: 300 } } }}
    >
      {(s) => (
        <div className="pcb-agent__all" data-shown={s.shown || undefined}>
          <div className="pcb-agent__view">
            <div className="pcb-sheet">
              <img src="/board/placed.svg" alt="" draggable={false} />
              <img
                className="pcb-agent__routed"
                src="/board/top.svg"
                alt=""
                draggable={false}
                style={{ '--routed': s.step === 'routing' ? s.routed : s.step === 'connecting' ? 0 : 1 } as CSSProperties}
              />
            </div>
            <div className="pcb-agent__foot" data-on={s.step === 'routing' || undefined}>
              <span className="pcb-agent__ring" style={{ '--share': s.routed } as CSSProperties}>
                <svg viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" />
                  <circle cx="8" cy="8" r="6" pathLength="1" />
                </svg>
              </span>
              <span className="pcb-agent__stage">
                <b>Routing</b>
                <span>{Math.round(s.routed * 100)}%</span>
              </span>
            </div>
          </div>
          <aside className="fx-thread pcb-agent__thread">
            <header>Clock board</header>
            <div className="fx-messages">
              <Bubble>Make the board in detail now.</Bubble>
              <JobCard step={s.step} />
              <Collapse open={s.sent} reveal="drop" from="below">
                <Bubble>{ASKED}</Bubble>
              </Collapse>
              <Collapse open={s.passed} reveal="drop" from="below">
                <p className="fx-reply pcb-agent__reply">I’ve passed that on to the board’s agent.</p>
              </Collapse>
            </div>
            <div className="pcb-agent__composer">
              <Composer typed={s.typed} target="write" placeholder="Say something of the board…" />
            </div>
          </aside>
        </div>
      )}
    </Scene>
  )
}

export const PCB: Record<string, ComponentType> = {
  'board-3d': ThreeD,
  'board-technical': Technical,
  'board-schematic': Schematic,
  'board-agent': Agent,
}
