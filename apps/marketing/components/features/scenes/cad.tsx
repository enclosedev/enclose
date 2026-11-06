import { DownloadIcon, MessageSquareIcon, XIcon, ArrowUpIcon, BoxesIcon, Grid3x3Icon, UnfoldVerticalIcon } from 'lucide-react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { Collapse } from '../../stageshow/motion/Collapse'
import type { Act } from '../../stageshow/act'
import type { Layout } from '../../stageshow/looks'
import { Composer, Model, Round, Scene } from '../fx'
import './cad.scss'

// Agentic CAD: the model, and what is done to it by pointing. A part picked out and
// what is said of it, the colour and material it is given, and the list of the parts
// the model is made of.

// ── The arm's still, and places on it ──────────────────────────────────────
// The stills of the whole arm (arm, arm-orange, arm-metal) are one framing, this many
// px; a place on a part is given in those px, measured on the still, and found on the
// card from where the still is put and how wide.
const ARM = { width: 1287, height: 1012 }
type Placed = { left: number; top: number; width: number }
const on = (still: Placed, x: number, y: number) => {
  const by = still.width / ARM.width
  return { x: still.left + x * by, y: still.top + y * by }
}
const box = (still: Placed): CSSProperties => ({ left: still.left, top: still.top, width: still.width })

/** Where the pointer is aimed, at a place on the model: nothing to be seen. */
function Hit({ name, x, y }: { name: string; x: number; y: number }) {
  return <i className="cad-hit" data-target={name} style={{ left: x, top: y }} />
}

/** A cut: the card goes dark for a moment, and is set as it began. */
function Veil({ on }: { on: boolean }) {
  return <i className="cad-veil" data-on={on || undefined} />
}

/** A ball of what a part is made of, in its colour: the app draws it, lit. */
export function Ball({ colour, metal, size = 22 }: { colour: string; metal?: boolean; size?: number }) {
  return (
    <span
      className="cad-ball"
      data-metal={metal || undefined}
      style={{ '--ball': colour, width: size, height: size } as CSSProperties}
    />
  )
}

/**
 * What comes up where a part was clicked: its name, and three buttons, its colour and
 * material, its file, and saying what should change. The middle of the buttons is on
 * the place clicked.
 */
export function PartButtons({
  name,
  at,
  shown,
  colour,
  metal,
  ballOn,
}: {
  name: string
  at: { x: number; y: number }
  shown: boolean
  colour: string
  metal?: boolean
  ballOn?: boolean
}) {
  return (
    <div className="cad-buttons" data-on={shown || undefined} style={{ left: at.x, top: at.y }}>
      <span className="cad-buttons__name">{name}</span>
      <span className="cad-buttons__round" data-target="ball" data-cursor="pointer" data-on={ballOn || undefined}>
        <Ball colour={colour} metal={metal} />
      </span>
      <span className="cad-buttons__round">
        <DownloadIcon />
      </span>
      <span className="cad-buttons__round" data-target="say" data-cursor="pointer">
        <MessageSquareIcon />
      </span>
    </div>
  )
}

/** Where what should change is written, over the place it is said of. */
export function Writing({
  name,
  text,
  shown,
  at,
}: {
  name: string
  text: string
  shown: boolean
  at: { x: number; y: number }
}) {
  return (
    <div className="cad-writing" data-on={shown || undefined} style={{ left: at.x, top: at.y }}>
      <span className="cad-writing__cancel">
        <XIcon />
        Cancel
      </span>
      <div className="cad-writing__box">
        <span className="cad-writing__label">{name}</span>
        <div className="cad-writing__text">
          {text ? (
            <span className="cad-writing__typed">{text}</span>
          ) : (
            <span className="cad-writing__placeholder">What should change here?</span>
          )}
        </div>
        <div className="cad-writing__foot">
          <span>⌘ Enter to send now</span>
          <span className="cad-writing__keep" data-on={text ? true : undefined}>
            <ArrowUpIcon />
          </span>
        </div>
      </div>
    </div>
  )
}

/** A note kept on a part: a mark on the place it was said of. */
export function NoteMark({ at, shown }: { at: { x: number; y: number }; shown: boolean }) {
  return (
    <span className="cad-mark" data-on={shown || undefined} style={{ left: at.x, top: at.y }}>
      <MessageSquareIcon />
    </span>
  )
}

/** Something said earlier in the conversation. */
function Bubbled({ children }: { children: ReactNode }) {
  return (
    <div className="fx-turn">
      <div className="fx-bubble">{children}</div>
    </div>
  )
}

/** A note on the message box: which part, and what was said of it. */
function NoteChip({ part, said }: { part: string; said: string }) {
  return (
    <span className="cad-notechip">
      <span className="cad-notechip__part">{part}</span>
      <span className="cad-notechip__said">{said}</span>
      <XIcon />
    </span>
  )
}

// ── A note on every part ───────────────────────────────────────────────────
// The wrist is clicked, and what should change is said of it, and kept: a mark on the
// wrist and a chip on the message box. Then the base. The two are sent together, and
// the agent is at work on both.

const NOTES = {
  wrist: { name: 'Wrist', said: 'Make it 5 mm shorter', x: 690, y: 470 },
  base: { name: 'Base', said: 'Leave room for a USB-C port', x: 1010, y: 850 },
} as const
type Noted = keyof typeof NOTES

type NotesState = {
  picked: Noted | null
  writing: Noted | null
  wrist: string
  base: string
  kept: Noted[]
  sent: boolean
  veil: boolean
}

const notesStart: NotesState = {
  picked: null,
  writing: null,
  wrist: '',
  base: '',
  kept: [],
  sent: false,
  veil: false,
}

const NOTES_STILL: Record<Layout, Placed> = {
  wide: { left: 6, top: 174, width: 350 },
  compact: { left: 2, top: 30, width: 350 },
}

async function notesScript(a: Act<NotesState>) {
  for (const part of ['wrist', 'base'] as Noted[]) {
    await a.wait(part === 'wrist' ? 700 : 500)
    await a.click(`hit-${part}`)
    await a.set({ picked: part })
    await a.wait(450)
    await a.click('say')
    await a.set({ writing: part })
    await a.wait(300)
    await a.type(part, NOTES[part].said, { interval: 42 })
    await a.wait(350)
    await a.key('enter')
    await a.set((s) => ({ writing: null, picked: null, kept: [...s.kept, part] }))
  }
  await a.wait(1100)
  await a.click('send')
  await a.set({ sent: true })
  await a.wait(3200)
  await a.set({ veil: true })
  await a.wait(450)
  await a.snap({ ...notesStart, veil: true })
  await a.set({ veil: false })
}

function Notes() {
  return (
    <Scene<NotesState>
      className="cad-notes"
      initial={notesStart}
      poster={{ ...notesStart, wrist: NOTES.wrist.said, base: NOTES.base.said, kept: ['wrist', 'base'] }}
      script={notesScript}
      keys={{ wide: 'top', compact: 'top' }}
      cursor={{ at: { wide: { x: 300, y: 70 }, compact: { x: 300, y: 60 } } }}
    >
      {(s, _rect, layout) => {
        const still = NOTES_STILL[layout]
        const place = (part: Noted) => on(still, NOTES[part].x, NOTES[part].y)
        // the box is kept inside the view, clear of the conversation
        const writingAt = (part: Noted) => {
          const at = place(part)
          const right = layout === 'wide' ? 350 : 348
          return { x: Math.min(Math.max(at.x, 132), right - 120), y: at.y }
        }
        const chips = s.kept.map((part) => (
          <NoteChip key={part} part={NOTES[part].name} said={NOTES[part].said} />
        ))
        return (
          <>
            <Model src="arm" className="cad-notes__arm" style={box(still)} />
            {(Object.keys(NOTES) as Noted[]).map((part) => {
              const at = place(part)
              return (
                <span key={part}>
                  <Hit name={`hit-${part}`} x={at.x} y={at.y} />
                  <NoteMark at={at} shown={s.kept.includes(part) && !s.sent} />
                </span>
              )
            })}
            {(Object.keys(NOTES) as Noted[]).map((part) => (
              <PartButtons
                key={part}
                name={NOTES[part].name}
                at={place(part)}
                shown={s.picked === part && s.writing !== part}
                colour={part === 'wrist' ? '#7bfafd' : '#7fa2fe'}
              />
            ))}
            {(Object.keys(NOTES) as Noted[]).map((part) => (
              <Writing
                key={part}
                name={NOTES[part].name}
                text={s[part]}
                shown={s.writing === part}
                at={writingAt(part)}
              />
            ))}
            <aside className="fx-thread cad-notes__thread">
              {layout === 'wide' && <header>Robot arm</header>}
              <div className="fx-messages">
                {layout === 'wide' && (
                  <>
                    <Bubbled>Let the jaw open wider, as far as it can go.</Bubbled>
                    <div className="fx-quiet">Worked for 48s</div>
                    <p className="fx-reply">Opened the jaw to 105°, and moved its horn to match.</p>
                  </>
                )}
                <Collapse open={s.sent} reveal="drop" from="below">
                  <div className="cad-sent">
                    <NoteChip part={NOTES.wrist.name} said={NOTES.wrist.said} />
                    <NoteChip part={NOTES.base.name} said={NOTES.base.said} />
                  </div>
                </Collapse>
                <Collapse open={s.sent}>
                  <div className="fx-quiet fx-quiet--working">
                    <span>Working</span>
                  </div>
                </Collapse>
              </div>
              <div className="cad-notes__composer">
                <Composer chips={s.sent || !chips.length ? undefined : chips} ready={chips.length > 0 && !s.sent} />
              </div>
            </aside>
            <Veil on={s.veil} />
          </>
        )
      }}
    </Scene>
  )
}

// ── Colours and materials ──────────────────────────────────────────────────
// The upper arm is clicked, and its ball opened: it is given orange, and then brushed
// aluminium, and the view draws each. Then Cmd+Z, twice, takes both back.

const PALETTE: [string, string][] = [
  ['red', '#ff726f'],
  ['orange', '#feaf57'],
  ['yellow', '#fff24f'],
  ['lime', '#9efb41'],
  ['green', '#54ff7d'],
  ['cyan', '#7bfafd'],
  ['blue', '#7fa2fe'],
  ['indigo', '#897aff'],
  ['violet', '#cf7dff'],
  ['pink', '#fd81c3'],
  ['white', '#fafafa'],
  ['grey', '#8a8a8a'],
]
const GREEN = '#54ff7d'
const ORANGE = '#feaf57'
const METALS: { id: string; name: string; finish: string; colour: string }[] = [
  { id: 'polished', name: 'Aluminium', finish: 'Polished', colour: '#d9dce0' },
  { id: 'brushed', name: 'Aluminium', finish: 'Brushed', colour: '#b9bdc3' },
  { id: 'anodised', name: 'Aluminium', finish: 'Anodised', colour: ORANGE },
  { id: 'steel', name: 'Steel', finish: 'Satin', colour: '#9a9ea4' },
]

type PaintState = {
  picked: boolean
  open: boolean
  tab: 'colour' | 'material'
  colour: 'orange' | null
  metal: boolean
}
const paintStart: PaintState = { picked: false, open: false, tab: 'colour', colour: null, metal: false }

const PAINT_STILL: Record<Layout, Placed> = {
  wide: { left: -150, top: 144, width: 480 },
  compact: { left: -150, top: 185, width: 420 },
}
/** where on the upper arm it is clicked, on the still */
const UPPER = { x: 1120, y: 330 }

async function paintScript(a: Act<PaintState>) {
  await a.wait(700)
  await a.click('hit-upper')
  await a.set({ picked: true })
  await a.wait(500)
  await a.click('ball')
  await a.set({ open: true })
  await a.wait(500)
  await a.click('swatch-orange')
  await a.set({ colour: 'orange' })
  await a.wait(1300)
  await a.click('tab-material')
  await a.set({ tab: 'material' })
  await a.wait(550)
  await a.click('metal-brushed')
  await a.set({ metal: true })
  await a.wait(1900)
  await a.click('hit-away')
  await a.set({ open: false })
  await a.wait(900)
  await a.key('cmd+z')
  await a.set({ metal: false })
  await a.wait(900)
  await a.key('cmd+z')
  await a.set({ colour: null })
  await a.wait(700)
  await a.click('hit-away')
  await a.set({ picked: false })
  await a.snap({ tab: 'colour' })
  await a.wait(400)
}

function Paint() {
  return (
    <Scene<PaintState>
      className="cad-paint"
      initial={paintStart}
      poster={{ picked: true, open: true, tab: 'colour', colour: 'orange', metal: false }}
      script={paintScript}
      keys={{ wide: 'bottom-left', compact: 'bottom-left' }}
      cursor={{ at: { wide: { x: 470, y: 400 }, compact: { x: 280, y: 380 } } }}
    >
      {(s, _rect, layout) => {
        const still = PAINT_STILL[layout]
        const at = on(still, UPPER.x, UPPER.y)
        const shown = s.metal ? 'arm-metal' : s.colour ? 'arm-orange' : 'arm'
        const colour = s.colour ? ORANGE : GREEN
        return (
          <>
            {(['arm', 'arm-orange', 'arm-metal'] as const).map((src) => (
              <Model key={src} src={src} style={box(still)} shown={shown === src} />
            ))}
            <Hit name="hit-upper" x={at.x} y={at.y} />
            <Hit name="hit-away" x={layout === 'wide' ? 120 : 70} y={layout === 'wide' ? 60 : 80} />
            <PartButtons
              name="Upper arm"
              at={at}
              shown={s.picked}
              colour={s.metal ? '#b9bdc3' : colour}
              metal={s.metal}
              ballOn={s.open}
            />
            <div className="cad-look" data-on={s.open || undefined}>
              <div className="cad-look__tabs">
                <span data-on={s.tab === 'colour' || undefined}>Color</span>
                <span data-on={s.tab === 'material' || undefined} data-target="tab-material" data-cursor="pointer">
                  Material
                </span>
              </div>
              <div className="cad-look__pages" data-tab={s.tab}>
                <div className="cad-look__page">
                  <div className="cad-look__picker" style={{ '--hue': s.colour ? '35' : '135' } as CSSProperties}>
                    <i />
                  </div>
                  <div className="cad-look__swatches">
                    {PALETTE.map(([name, hex]) => (
                      <span
                        key={name}
                        className="cad-look__swatch"
                        style={{ background: hex }}
                        data-on={(s.colour === null ? name === 'green' : s.colour === name) || undefined}
                        data-target={`swatch-${name}`}
                        data-cursor="pointer"
                      />
                    ))}
                  </div>
                </div>
                <div className="cad-look__page">
                  <div className="cad-look__kind">Metal</div>
                  <div className="cad-look__materials">
                    {METALS.map((metal) => (
                      <span
                        key={metal.id}
                        className="cad-look__material"
                        data-on={(s.metal && metal.id === 'brushed') || undefined}
                        data-target={`metal-${metal.id}`}
                        data-cursor="pointer"
                      >
                        <Ball colour={metal.colour} metal={metal.id !== 'anodised'} size={36} />
                        <b>{metal.name}</b>
                        <small>{metal.finish}</small>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      }}
    </Scene>
  )
}

// ── Every part, listed ─────────────────────────────────────────────────────
// Parts is pressed, and the list comes up beside the model, which moves over to what
// the list leaves of the view. The list is gone down to the gripper, which is picked,
// and the view shows it on its own; picked again, the rest is back, and the list is
// put away.

type Group = { id: string; name: string; size: string; parts: { name: string; size: string; picture?: string }[] }
const GROUPS: Group[] = [
  {
    id: 'base',
    name: 'Base',
    size: '3.1 MB',
    parts: [
      { name: 'Base', size: '612 KB', picture: 'part-base' },
      { name: 'Motor holder', size: '248 KB' },
      { name: 'Board', size: '1.4 MB' },
    ],
  },
  {
    id: 'shoulder',
    name: 'Shoulder',
    size: '1.8 MB',
    parts: [
      { name: 'Shoulder', size: '388 KB', picture: 'part-shoulder' },
      { name: 'Servo 2', size: '520 KB' },
      { name: 'Horn', size: '41 KB' },
    ],
  },
  {
    id: 'upper-arm',
    name: 'Upper arm',
    size: '1.6 MB',
    parts: [
      { name: 'Upper arm', size: '574 KB', picture: 'part-upper-arm' },
      { name: 'Servo 3', size: '520 KB' },
      { name: 'Horn', size: '41 KB' },
    ],
  },
  {
    id: 'lower-arm',
    name: 'Lower arm',
    size: '1.5 MB',
    parts: [
      { name: 'Lower arm', size: '566 KB', picture: 'part-lower-arm' },
      { name: 'Servo 4', size: '520 KB' },
      { name: 'Horn', size: '41 KB' },
    ],
  },
  {
    id: 'wrist',
    name: 'Wrist',
    size: '1.2 MB',
    parts: [
      { name: 'Wrist', size: '402 KB', picture: 'part-wrist' },
      { name: 'Servo 5', size: '520 KB' },
      { name: 'Horn', size: '41 KB' },
    ],
  },
  {
    id: 'gripper',
    name: 'Gripper',
    size: '1.3 MB',
    parts: [
      { name: 'Gripper', size: '627 KB', picture: 'part-gripper' },
      { name: 'Servo 6', size: '520 KB' },
      { name: 'Screws', size: '96 KB' },
    ],
  },
  {
    id: 'jaw',
    name: 'Jaw',
    size: '590 KB',
    parts: [
      { name: 'Jaw', size: '531 KB', picture: 'part-jaw' },
      { name: 'Horn', size: '41 KB' },
    ],
  },
]
/** How far each group's card is from the next, down the list, px. */
const GROUP_PITCH = 196
const PICKED = GROUPS.findIndex((group) => group.id === 'gripper')

type PartsState = { open: boolean; down: boolean; picked: boolean }
const partsStart: PartsState = { open: false, down: false, picked: false }

async function partsScript(a: Act<PartsState>) {
  await a.wait(700)
  await a.click('parts-button')
  await a.set({ open: true })
  await a.wait(900)
  await a.move('list')
  await a.set({ down: true })
  await a.wait(1300)
  await a.click('group-gripper')
  await a.set({ picked: true })
  await a.wait(2600)
  await a.click('group-gripper')
  await a.set({ picked: false })
  await a.wait(1000)
  await a.set({ down: false })
  await a.wait(1100)
  await a.click('parts-button')
  await a.set({ open: false })
  await a.wait(800)
}

function Parts() {
  return (
    <Scene<PartsState>
      className="cad-parts"
      initial={partsStart}
      poster={{ open: true, down: true, picked: true }}
      script={partsScript}
      cursor={{ at: { wide: { x: 470, y: 400 }, compact: { x: 280, y: 160 } } }}
    >
      {(s, _rect, layout) => {
        // in a phone's card the list keeps one of its cards in sight above the gripper
        const lead = layout === 'wide' ? 1 : 0
        const down = s.down ? -(PICKED - lead) * GROUP_PITCH : 0
        return (
          <div className="cad-parts__view" data-open={s.open || undefined} data-picked={s.picked || undefined}>
            <Model src="arm" className="cad-parts__arm" shown={!s.picked} />
            <Model src="gripper" className="cad-parts__gripper" shown={s.picked} />
            <div className="cad-parts__column">
              <Round on={s.open} target="parts-button">
                <BoxesIcon />
              </Round>
              <Round>
                <Grid3x3Icon />
              </Round>
              <Round>
                <UnfoldVerticalIcon />
              </Round>
            </div>
            <div className="fx-panel cad-parts__list" data-target="list">
              <div className="cad-parts__groups" style={{ transform: `translateY(${down}px)` }}>
                {GROUPS.map((group) => (
                  <section
                    key={group.id}
                    className="cad-group"
                    data-lit={(group.id === 'gripper' && s.picked) || undefined}
                    data-target={group.id === 'gripper' ? 'group-gripper' : undefined}
                    data-cursor={group.id === 'gripper' ? 'pointer' : undefined}
                  >
                    <header>
                      <strong>{group.name}</strong>
                      <span>{group.size}</span>
                      <DownloadIcon strokeWidth={1.25} />
                    </header>
                    <div className="cad-group__pieces">
                      {group.parts.map((part, index) => (
                        <Piece key={index} {...part} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        )
      }}
    </Scene>
  )
}

/** A part in its group's card: its picture, its name, and how big its file is. */
function Piece({ name, size, picture }: { name: string; size: string; picture?: string }): ReactNode {
  return (
    <div className="cad-group__piece">
      <span className="cad-group__picture">
        {picture && <img src={`/renders/${picture}.webp`} alt="" draggable={false} />}
      </span>
      {picture ? (
        <>
          <span>{name}</span>
          <span>{size}</span>
        </>
      ) : (
        // the rest of the group's parts: there, but not what the card is about
        <>
          <i className="cad-group__bar" style={{ width: 40 + (name.length % 4) * 9 }} />
          <i className="cad-group__bar cad-group__bar--faint" />
        </>
      )}
    </div>
  )
}

export const CAD: Record<string, ComponentType> = {
  notes: Notes,
  paint: Paint,
  parts: Parts,
}
