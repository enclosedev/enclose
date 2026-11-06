import { DownloadIcon, MessageSquareIcon, XIcon, ArrowUpIcon, BoxesIcon, SearchIcon } from 'lucide-react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import type { Act } from '../../stageshow/act'
import type { Layout } from '../../stageshow/looks'
import { Model, Round, Scene } from '../fx'
import './cad.scss'

// Agentic CAD: the model, and what is done to it by pointing. A part picked out and
// what is said of it, the colour and material it is given, and the list of the parts
// the model is made of.

// ── The arm's still, and places on it ──────────────────────────────────────
// The stills of the whole arm (arm, gripper-in-place) are one framing, this many
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
  say = 'say',
}: {
  name: string
  at: { x: number; y: number }
  shown: boolean
  colour: string
  metal?: boolean
  ballOn?: boolean
  /** what the pointer aims at for its say button (one of its own, where there are several) */
  say?: string
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
      <span className="cad-buttons__round" data-target={say} data-cursor="pointer">
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
// The counter stool, big, its seat and backrest in the view and its legs going out of
// it at the foot. The backrest is clicked, and what should change is said of it, and
// kept: a mark on it, and a chip at the foot of the card, as the message box would
// have it. Then the seat, its chip stacked on the first.

/** Where on the stool each is clicked, in the card's design px, wide and on a phone. */
const NOTES = {
  backrest: {
    name: 'Backrest',
    said: 'Make it 2 cm taller',
    at: { wide: { x: 405, y: 140 }, compact: { x: 243, y: 75 } },
  },
  seat: {
    name: 'Seat',
    said: 'Thicker cushion, softer edge',
    at: { wide: { x: 262, y: 386 }, compact: { x: 157, y: 223 } },
  },
} as const
type Noted = keyof typeof NOTES

type NotesState = {
  picked: Noted | null
  writing: Noted | null
  backrest: string
  seat: string
  kept: Noted[]
  veil: boolean
}

const notesStart: NotesState = {
  picked: null,
  writing: null,
  backrest: '',
  seat: '',
  kept: [],
  veil: false,
}

/**
 * The stool's still (public/renders/example-stool, 2400 px a side, the stool from 358
 * down and about 1189 across), big: its top near the top of the card, its middle in
 * the middle, and its legs going on past the foot.
 */
const NOTES_STILL: Record<Layout, Placed> = {
  wide: { left: -270, top: -82, width: 1150 },
  compact: { left: -162, top: -58, width: 690 },
}

async function notesScript(a: Act<NotesState>) {
  for (const part of ['backrest', 'seat'] as Noted[]) {
    await a.wait(part === 'backrest' ? 700 : 600)
    await a.click(`hit-${part}`)
    await a.set({ picked: part })
    await a.wait(450)
    await a.click(`say-${part}`)
    await a.set({ writing: part })
    await a.wait(300)
    await a.type(part, NOTES[part].said, { interval: 42 })
    await a.wait(350)
    await a.key('enter')
    await a.set((s) => ({ writing: null, picked: null, kept: [...s.kept, part] }))
  }
  await a.wait(2600)
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
      poster={{ ...notesStart, backrest: NOTES.backrest.said, seat: NOTES.seat.said, kept: ['backrest', 'seat'] }}
      script={notesScript}
      keys={{ wide: 'top', compact: 'top' }}
      cursor={{ at: { wide: { x: 470, y: 470 }, compact: { x: 290, y: 300 } } }}
    >
      {(s, _rect, layout) => {
        const place = (part: Noted) => NOTES[part].at[layout]
        // the box is kept inside the card
        const wide = layout === 'wide' ? 600 : 360
        const writingAt = (part: Noted) => {
          const at = place(part)
          // (and clear of the chips at the foot)
          return { x: Math.min(Math.max(at.x, 128), wide - 128), y: Math.min(at.y, wide - 210) }
        }
        return (
          <>
            <Model src="example-stool" className="cad-notes__stool" style={box(NOTES_STILL[layout])} />
            {(Object.keys(NOTES) as Noted[]).map((part) => {
              const at = place(part)
              return (
                <span key={part}>
                  <Hit name={`hit-${part}`} x={at.x} y={at.y} />
                  <NoteMark at={at} shown={s.kept.includes(part)} />
                </span>
              )
            })}
            {(Object.keys(NOTES) as Noted[]).map((part) => (
              <PartButtons
                key={part}
                name={NOTES[part].name}
                at={place(part)}
                shown={s.picked === part && s.writing !== part}
                colour="#fafafa"
                say={`say-${part}`}
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
            {/* what is kept, as chips at the foot of the card, the newest under the rest */}
            <div className="cad-notes__kept">
              {s.kept.map((part) => (
                <NoteChip key={part} part={NOTES[part].name} said={NOTES[part].said} />
              ))}
            </div>
            <Veil on={s.veil} />
          </>
        )
      }}
    </Scene>
  )
}

// ── Colours and materials ──────────────────────────────────────────────────
// Four simple solids, two by two, so that what happens to one is all there is to see.
// The cube is clicked, and its ball opened: it is given orange, and then brushed
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
/**
 * The metals, as the app's Material tab lists them, each on its ball as the app draws it
 * (public/renders/material-*, scripts/renders.ts; anodised takes the cube's orange).
 */
const METALS: { id: string; name: string; finish: string }[] = [
  { id: 'aluminium-polished', name: 'Aluminium', finish: 'Polished' },
  { id: 'aluminium-brushed', name: 'Aluminium', finish: 'Brushed' },
  { id: 'aluminium-anodised', name: 'Aluminium', finish: 'Anodised' },
  { id: 'steel', name: 'Steel', finish: 'Satin' },
  { id: 'steel-hammered', name: 'Steel', finish: 'Hammered' },
  { id: 'brass', name: 'Brass', finish: 'Polished' },
]

type PaintState = {
  picked: boolean
  open: boolean
  tab: 'colour' | 'material'
  colour: 'orange' | null
  metal: boolean
}
const paintStart: PaintState = { picked: false, open: false, tab: 'colour', colour: null, metal: false }

/**
 * The solids (public/renders/shape-*, scripts/renders.ts): each picture's width, as big
 * as it is drawn at on a wide card, and where in it the solid's middle is, as shares of
 * it. They are drawn from one place, so that the smaller in their pictures are drawn
 * the bigger here, to be about one size.
 */
const SHAPES = [
  { src: 'shape-cube', width: 288, middle: [0.495, 0.521] },
  { src: 'shape-sphere', width: 400, middle: [0.5, 0.5] },
  { src: 'shape-cylinder', width: 280, middle: [0.5, 0.502] },
  { src: 'shape-torus', width: 400, middle: [0.5, 0.514] },
] as const
/** The middles of the two by two, on a wide card; a phone's is this much smaller. */
const CELLS = [
  [190, 195],
  [410, 195],
  [190, 415],
  [410, 415],
] as const
const COMPACT_BY = 0.6
/** Where on the cube it is clicked. */
const CUBE: Record<Layout, { x: number; y: number }> = {
  wide: { x: 190, y: 195 },
  compact: { x: 140, y: 117 },
}
const AWAY: Record<Layout, { x: number; y: number }> = {
  wide: { x: 300, y: 300 },
  compact: { x: 180, y: 20 },
}
/** A solid's picture, its middle on the middle of its place in the two by two. */
const placed = (shape: (typeof SHAPES)[number], cell: readonly [number, number], layout: Layout): CSSProperties => {
  const by = layout === 'compact' ? COMPACT_BY : 1
  const width = shape.width * by
  return {
    left: cell[0] * by - width * shape.middle[0],
    top: cell[1] * by - width * shape.middle[1],
    width,
  }
}

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
  await a.click('metal-aluminium-brushed')
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
        const at = CUBE[layout]
        const shown = s.metal ? 'shape-cube-metal' : s.colour ? 'shape-cube-orange' : 'shape-cube'
        const colour = s.colour ? ORANGE : GREEN
        return (
          <>
            {(['shape-cube', 'shape-cube-orange', 'shape-cube-metal'] as const).map((src) => (
              <Model key={src} src={src} style={placed(SHAPES[0], CELLS[0], layout)} shown={shown === src} />
            ))}
            {SHAPES.slice(1).map((shape, index) => (
              <Model key={shape.src} src={shape.src} style={placed(shape, CELLS[index + 1], layout)} />
            ))}
            <Hit name="hit-upper" x={at.x} y={at.y} />
            <Hit name="hit-away" x={AWAY[layout].x} y={AWAY[layout].y} />
            <PartButtons
              name="Cube"
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
                <div className="cad-look__page" style={{ '--hue': s.colour ? '32' : '135' } as CSSProperties}>
                  {/* as the app's picker: how much colour and how light, the hue, and its #rrggbb */}
                  <div className="cad-look__picker">
                    <i />
                  </div>
                  <div className="cad-look__hue" style={{ '--at': s.colour ? '9%' : '37%' } as CSSProperties}>
                    <i />
                  </div>
                  <span className="cad-look__hex">{s.colour ? '#FEAF57' : '#54FF7D'}</span>
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
                <div className="cad-look__page cad-look__page--materials">
                  <span className="cad-look__search">
                    <SearchIcon />
                  </span>
                  <div className="cad-look__materials">
                    {METALS.map((metal) => (
                      <span
                        key={metal.id}
                        className="cad-look__material"
                        data-on={(s.metal && metal.id === 'aluminium-brushed') || undefined}
                        data-target={`metal-${metal.id}`}
                        data-cursor="pointer"
                      >
                        <img src={`/renders/material-${metal.id}.webp`} alt="" draggable={false} />
                        <b>{metal.name}</b>
                        <small>{metal.finish}</small>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {/* materials are seen in Render, which the view is not in (the app's own line) */}
              <div className="cad-look__render" data-on={s.tab === 'material' || undefined}>
                <span>Materials show in Render</span>
                <b>Show</b>
              </div>
            </div>
          </>
        )
      }}
    </Scene>
  )
}

// ── Every part, listed ─────────────────────────────────────────────────────
// Parts is pressed, and the list comes up over the model, which stays where it is, seen
// through the list's glass. The list is gone down to the gripper, which is picked, and
// the rest of the model goes, the gripper left where it is in it; picked again, the
// rest is back, and the list is put away.

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
            <Model src="gripper-in-place" className="cad-parts__arm" shown={s.picked} />
            <div className="cad-parts__column">
              <Round on={s.open} target="parts-button">
                <BoxesIcon />
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
