import {
  ExpandIcon,
  HammerIcon,
  LayoutDashboardIcon,
  LetterTextIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react'
import { useId, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { Count } from '../../stageshow/motion/Count'
import type { Act } from '../../stageshow/act'
import type { Layout } from '../../stageshow/looks'
import { ReferenceIcon } from '../../app/icons'
import { CORNER, Model, Round, Scene } from '../fx'
import './more.scss'

// And more: the board of pictures a design starts from, the tools the agent makes for
// a model, and the scenes that show how big it really is.

// ── Inspiration board ──────────────────────────────────────────────────────
// A loose board of pictures: materials and finishes, gathered for a project. One is
// clicked and comes up close, the rest pushed aside; a click on it pins a dot, and
// what is said of that place is written beside it and pinned. A click on the ground
// puts the picture back, with its note on it.

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

type BoardState = {
  focused: boolean
  /** the note: being written, or pinned, or not there */
  note: 'none' | 'writing' | 'pinned'
  text: string
  /** the whole board, faded out for the loop to start again */
  gone: boolean
}

const boardStart: BoardState = { focused: false, note: 'none', text: '', gone: false }

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
  await a.wait(2400)
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
      poster={{ focused: true, note: 'pinned', text: NOTE, gone: false }}
      script={boardScript}
      cursor={{ at: { wide: { x: 470, y: 420 }, compact: { x: 250, y: 400 } } }}
    >
      {(s, _rect, layout) => {
        const focus = FOCUS[layout]
        const spot = { x: focus.x + focus.w * SPOT.x, y: focus.y + focus.h * SPOT.y }
        return (
          <div className="mx-board__all" data-gone={s.gone || undefined}>
            <div className="mx-board__ground" data-target="ground" />
            {(Object.keys(BOARD[layout]) as Swatch[]).map((swatch) => {
              const box = BOARD[layout][swatch]
              const up = swatch === 'walnut' && s.focused
              const aside = s.focused && swatch !== 'walnut'
              // the walnut goes up by a move and a scale, from where it lies to the middle
              const scale = focus.w / box.w
              const style: CSSProperties = {
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                transform: up
                  ? `translate(${focus.x - box.x}px, ${focus.y - box.y}px) scale(${scale})`
                  : aside
                    ? pushed(box, focus)
                    : undefined,
              }
              return (
                <div
                  key={swatch}
                  className="mx-picture"
                  data-up={up || undefined}
                  data-aside={aside || undefined}
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
// The arm's own tool, as its agent made it: a slider for two of its joints, and a
// choice of poses. Ready is picked, and the joints go to it, the sliders with them;
// then Rest, and the arm is folded again.

type Pose = 'rest' | 'ready'
type ToolsState = { pose: Pose }

const ANGLES: Record<Pose, { shoulder: number; elbow: number }> = {
  rest: { shoulder: 0, elbow: 0 },
  ready: { shoulder: 95, elbow: 100 },
}

async function toolsScript(a: Act<ToolsState>) {
  await a.wait(1100)
  await a.click('pose-ready')
  await a.set({ pose: 'ready' })
  await a.wait(3200)
  await a.click('pose-rest')
  await a.set({ pose: 'rest' })
  await a.wait(1800)
}

function Slider({ value, most, unit = '°' }: { value: number; most: number; unit?: string }) {
  return (
    <div className="mx-slider" style={{ '--along': value / most } as CSSProperties}>
      <div className="mx-slider__says">
        <span>
          <Count value={value} duration={900} format={(n) => `${Math.round(n)}${unit}`} />
        </span>
      </div>
      <div className="mx-slider__trail">
        <i />
      </div>
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
      initial={{ pose: 'rest' }}
      poster={{ pose: 'ready' }}
      script={toolsScript}
      cursor={{ at: { wide: { x: 520, y: 420 }, compact: { x: 300, y: 400 } } }}
    >
      {(s) => {
        const angles = ANGLES[s.pose]
        return (
          <>
            <Model src="arm" className="mx-tools__rest" shown={s.pose === 'rest'} />
            <Model src="arm-raised" className="mx-tools__ready" shown={s.pose === 'ready'} />
            <Round tool on style={{ position: 'absolute', top: CORNER, right: CORNER }}>
              <HammerIcon />
            </Round>
            <div className="fx-tools mx-tools__panel">
              <div className="mx-tabs">
                <span className="mx-tabs__on">Arm</span>
                <span>Routine</span>
              </div>
              <Control title="Shoulder" says="Lifts the upper arm.">
                <Slider value={angles.shoulder} most={110} />
              </Control>
              <Control title="Elbow" says="Bends the forearm.">
                <Slider value={angles.elbow} most={150} />
              </Control>
              <Control title="Pose" says="Where the arm goes.">
                <div className="mx-choice">
                  <span data-on={s.pose === 'rest' || undefined} data-target="pose-rest" data-cursor="pointer">
                    Rest
                  </span>
                  <span data-on={s.pose === 'ready' || undefined} data-target="pose-ready" data-cursor="pointer">
                    Ready
                  </span>
                  <span>Reach</span>
                </div>
              </Control>
            </div>
          </>
        )
      }}
    </Scene>
  )
}

// ── Seen at its size ───────────────────────────────────────────────────────
// A counter stool fills the view, as every model does, whatever its size. The
// Reference button brings up the scenes; Person is picked, and the stool is set
// beside a man of 5 ft 9, at its size. Picked again, it is taken out.

type Scenery = 'none' | 'person'
type ReferenceState = { open: boolean; scene: Scenery }

async function referenceScript(a: Act<ReferenceState>) {
  await a.wait(1000)
  await a.click('reference')
  await a.set({ open: true })
  await a.wait(700)
  await a.click('scene-person')
  await a.set({ scene: 'person' })
  await a.wait(1400)
  await a.click('reference')
  await a.set({ open: false })
  await a.wait(2800)
  await a.click('reference')
  await a.set({ open: true })
  await a.wait(500)
  // picked again, the stool is taken out of the scene
  await a.click('scene-person')
  await a.set({ scene: 'none' })
  await a.wait(700)
  await a.click('reference')
  await a.set({ open: false })
  await a.wait(900)
}

/** A thing of the scenes', drawn as the app draws them: flat, a tone over the view, lined. */
function Person({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={`mx-figure ${className ?? ''}`} viewBox="0 0 100 400" style={style} aria-hidden>
      {/* the legs */}
      <path d="M27 206 L48 206 L46 300 L44 382 L30 382 L29 300 Z" />
      <path d="M52 206 L73 206 L71 300 L70 382 L56 382 L54 300 Z" />
      <path d="M26 380 L46 380 L47 392 L20 392 Q20 384 26 380 Z" />
      <path d="M55 380 L75 380 Q80 384 80 392 L54 392 Z" />
      {/* the body */}
      <path d="M22 72 Q24 62 36 60 L64 60 Q76 62 78 72 L76 150 L74 212 L26 212 L24 150 Z" />
      {/* the arms */}
      <path d="M22 72 Q14 76 13 92 L11 150 L13 214 L22 214 L24 152 L28 100 Z" />
      <path d="M78 72 Q86 76 87 92 L89 150 L87 214 L78 214 L76 152 L72 100 Z" />
      {/* the neck and the head */}
      <path d="M43 46 L57 46 L57 62 L43 62 Z" />
      <ellipse cx="50" cy="28" rx="15" ry="20" />
    </svg>
  )
}

function SceneDesk() {
  return (
    <svg className="mx-figure" viewBox="0 0 100 100" aria-hidden>
      <path d="M12 46 L54 30 L90 42 L48 58 Z" />
      <path d="M12 46 L48 58 L48 62 L12 50 Z" />
      <path d="M48 58 L90 42 L90 46 L48 62 Z" />
      <path d="M15 51 L18 52 L18 80 L15 79 Z" />
      <path d="M45 61 L48 62 L48 90 L45 89 Z" />
      <path d="M86 47 L89 46 L89 74 L86 75 Z" />
    </svg>
  )
}

function SceneRoom() {
  return (
    <svg className="mx-figure" viewBox="0 0 100 100" aria-hidden>
      <path d="M10 62 L50 46 L90 62 L50 80 Z" />
      <path d="M10 62 L10 22 L50 8 L50 46 Z" />
      <path d="M50 46 L50 8 L90 22 L90 62 Z" />
      <path d="M62 50.8 L62 26 L72 29.6 L72 54.6 Z" />
    </svg>
  )
}

const SCENES: { id: string; name: string; detail: string; picture: ReactNode }[] = [
  { id: 'table', name: 'Table', detail: 'Desk, 58 × 29 in', picture: <SceneDesk /> },
  { id: 'room', name: 'Room', detail: '12 × 10 ft', picture: <SceneRoom /> },
  {
    id: 'person',
    name: 'Person',
    detail: '5 ft 9 in',
    picture: <Person className="mx-figure--person" />,
  },
]

function Reference() {
  return (
    <Scene<ReferenceState>
      className="mx-reference"
      initial={{ open: false, scene: 'none' }}
      poster={{ open: false, scene: 'person' }}
      script={referenceScript}
      cursor={{ at: { wide: { x: 470, y: 420 }, compact: { x: 280, y: 390 } } }}
    >
      {(s) => (
        <>
          <div className="mx-reference__scene" data-on={s.scene === 'person' || undefined}>
            <svg className="mx-figure mx-reference__floor" viewBox="0 0 400 120" aria-hidden>
              <path d="M10 60 L200 8 L390 60 L200 112 Z" />
            </svg>
            <Person className="mx-reference__person" />
          </div>
          <div className="mx-reference__stool" data-small={s.scene === 'person' || undefined}>
            <Model src="example-stool" className="mx-reference__picture" />
          </div>
          <Round
            on={s.open}
            target="reference"
            tip="Reference"
            keys="⌘/"
            style={{ position: 'absolute', top: CORNER, right: CORNER }}
          >
            <ReferenceIcon />
          </Round>
          <div className="mx-scenes" data-on={s.open || undefined}>
            <div className="mx-scenes__title">Reference scene</div>
            <div className="mx-scenes__list">
              {SCENES.map((scene) => (
                <div
                  key={scene.id}
                  className="mx-scenes__item"
                  data-lit={(scene.id === 'person' && s.scene === 'person') || undefined}
                  data-target={`scene-${scene.id}`}
                  data-cursor="pointer"
                >
                  <span className="mx-scenes__picture">{scene.picture}</span>
                  <span className="mx-scenes__words">
                    <span>{scene.name}</span>
                    <span>{scene.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
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
