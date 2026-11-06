import gsap from 'gsap'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Hit, View } from '../../components/app/view'
import { NoteMark, PartButtons, Writing } from '../../components/features/scenes/cad'
import { MacPointer } from '../../components/stageshow/cursors'

// Someone at work on the arm, on the first screen, while it is at the top: a pointer
// goes from part to part of the model in the studio, giving one a colour, and saying
// what should change of the next, the note left on it, as the app has it done (its
// part-marks.tsx and look-panel.tsx): a part clicked is picked out, white, with what can
// be done with it beside it; its ball opens its colours and materials. The parts are
// found on the model as it is drawn (the view's `hit`), wherever they are on the
// screen. It all goes as the page is scrolled (intro.ts), and waits until the page is
// back at the top.

/** The palette's colours, as the view has them by name (view.ts): the app's, in the dark. */
const SWATCHES: [string, string][] = [
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
  ['grey', '#464646'],
]
/** The colours to be given: not the greys, which say less. */
const GIVEN = SWATCHES.slice(0, 10)
/** What is said of each group. */
const SAID: Record<string, string> = {
  base: 'Leave room for a USB-C port',
  shoulder: 'Make this wall 2 mm thicker',
  'upper-arm': 'Round these edges off',
  'lower-arm': 'Make it 10 mm longer',
  wrist: 'Make it 5 mm shorter',
  gripper: 'Add ribs inside, for grip',
  jaw: 'Let it open to 60 mm',
}
/** How many notes are kept on the model at once. */
const KEPT = 3
/** Where the pointer's tip is, in its glyph (stageshow/cursor.tsx). */
const TIP = { x: 7.5, y: 5.25 }

type Spot = { x: number; y: number }
type Picked = Hit & Spot
type Note = { id: number; point: Hit['point']; at: Spot; shown: boolean }

export function Tinker({ view, ready }: { view: RefObject<View | null>; ready: boolean }) {
  const pointer = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [shown, setShown] = useState(false)
  /** the colours and materials, open, and the colour of them chosen */
  const [look, setLook] = useState<{ open: boolean; chosen: string | null }>({ open: false, chosen: null })
  const [writing, setWriting] = useState<string | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [ballOn, setBallOn] = useState(false)

  useEffect(() => {
    const top = document.querySelector<HTMLElement>('.home__top')
    const hero = document.querySelector<HTMLElement>('.home__hero .download')
    const cursor = pointer.current
    if (!ready || !cursor || !top?.hasAttribute('data-spatial')) return
    let alive = true
    let made = 0
    const painted: Record<string, string> = {}

    class Gone extends Error {}
    /** (the page was scrolled: what was being done is left) */
    class Moved extends Error {}
    // only while the page is at the top and in sight; and the canvas as it was measured
    const atTop = () => window.scrollY < 24 && !document.hidden
    const sleep = (ms: number, anyway = false) =>
      new Promise<void>((done, fail) =>
        setTimeout(() => (!alive ? fail(new Gone()) : anyway || atTop() ? done() : fail(new Moved())), ms),
      )
    const gate = async () => {
      if (atTop()) return
      do await sleep(300, true)
      while (!atTop())
      await sleep(600, true)
    }
    const move = (to: Spot, duration = 0.7) =>
      new Promise<void>((done) =>
        gsap.to(cursor, {
          x: to.x - TIP.x,
          y: to.y - TIP.y,
          opacity: 1,
          duration,
          ease: 'power3.inOut',
          onComplete: done,
          overwrite: true,
        }),
      )
    /** Where the middle of something on the screen is, in this one's px. */
    const spotOf = (selector: string): Spot | null => {
      const one = document.querySelector(`.home__tinker ${selector}`)
      const whole = document.querySelector('.home__tinker')
      if (!one || !whole) return null
      const box = one.getBoundingClientRect()
      const from = whole.getBoundingClientRect()
      return { x: box.left - from.left + box.width / 2, y: box.top - from.top + box.height / 2 }
    }
    const click = async () => {
      cursor.dataset.pressed = 'true'
      await sleep(110)
      cursor.dataset.pressed = 'false'
    }

    /**
     * A place on a part of the model, not under the words, with room round it: in the
     * top of what is seen of the model, as much of it as `upper` says.
     */
    const choose = (last?: string, upper = 0.6): Picked | null => {
      const v = view.current
      if (!v) return null
      const room = v.bounds()
      const wide = window.innerWidth
      const tall = top.querySelector<HTMLElement>('.home__pin')!.clientHeight
      const clear = (hero?.getBoundingClientRect().bottom ?? 0) + 40
      const compact = wide < 768
      const left = Math.max(room.left, compact ? 90 : 200)
      const right = Math.min(room.right, wide - (compact ? 90 : 160))
      const high = Math.max(room.top, clear)
      // (with room under it for the colours)
      const low = high + (Math.min(room.bottom, tall - 100) - high) * upper
      if (right <= left || low <= high) return null
      const near = (spot: Spot) =>
        notesNow.some((note) => Math.hypot(note.at.x - spot.x, note.at.y - spot.y) < 90)
      for (let i = 0; i < 80; i++) {
        const spot = { x: left + Math.random() * (right - left), y: high + Math.random() * (low - high) }
        const hit = v.hit(spot.x, spot.y)
        if (hit && hit.group !== last && !near(spot)) return { ...hit, ...spot }
      }
      return null
    }
    let notesNow: Note[] = []
    const keep = (next: Note[]) => {
      notesNow = next
      setNotes(next)
    }

    // The ball opens the colours, and the part is seen in its own colour while one is
    // chosen; one is, and it is seen in that a moment, and then picked out again.
    const paint = async (part: Picked) => {
      await move(spotOf('[data-target="ball"]') ?? { x: part.x - 42, y: part.y }, 0.4)
      await click()
      setBallOn(true)
      setLook({ open: true, chosen: painted[part.group] ?? null })
      view.current?.pick(part.group, true)
      await sleep(450)
      const choices = GIVEN.filter(([name]) => name !== painted[part.group])
      const [name] = choices[Math.floor(Math.random() * choices.length)]
      const swatch = spotOf(`[data-swatch="${name}"]`)
      if (swatch) {
        await move(swatch, 0.55)
        await click()
        painted[part.group] = name
        setLook({ open: true, chosen: name })
        view.current?.paint(part.group, name)
        await sleep(1000)
      }
      setLook((was) => ({ ...was, open: false }))
      setBallOn(false)
      await sleep(900)
      view.current?.pick(part.group)
    }

    const say = async (part: Picked) => {
      const say = { x: part.x + 42, y: part.y }
      await move(say, 0.4)
      await click()
      setShown(false)
      setWriting('')
      await sleep(300)
      const text = SAID[part.group] ?? 'Make it a little lighter'
      for (let i = 1; i <= text.length; i++) {
        setWriting(text.slice(0, i))
        await sleep(26 + Math.random() * 28)
      }
      await sleep(350)
      setWriting(null)
      const note: Note = { id: made++, point: part.point, at: { x: part.x, y: part.y }, shown: true }
      // the oldest goes, once there are enough
      const next = [...notesNow.filter((one) => one.shown), note].map((one) => ({ ...one }))
      if (next.length > KEPT) next[0].shown = false
      keep(next)
    }

    const run = async () => {
      gsap.set(cursor, { x: window.innerWidth * 0.7, y: window.innerHeight * 0.9, opacity: 0 })
      await sleep(300, true)
      let last: string | undefined
      for (let turn = 0; ; turn++) {
        await gate()
        // the first are notes, on what is highest of it
        const part = choose(last, turn < 2 ? 0.4 : 0.6)
        if (!part) {
          await sleep(500, true)
          continue
        }
        last = part.group
        setLook({ open: false, chosen: null })
        try {
          await move(part)
          await click()
          view.current?.pick(part.group)
          setPicked(part)
          setShown(true)
          await sleep(350)
          if (turn >= 2 && turn % 2 === 0) await paint(part)
          else await say(part)
        } catch (error) {
          if (!(error instanceof Moved)) throw error
          // scrolled away mid-way: nothing is left open, or picked out
          setWriting(null)
          setLook((was) => ({ ...was, open: false }))
          setBallOn(false)
        }
        setShown(false)
        view.current?.pick(null)
        if (!atTop()) continue
        await sleep(200, true)
        // off the model for a moment
        await move({ x: part.x + 120 + Math.random() * 80, y: part.y + 40 + Math.random() * 60 }, 0.6)
        await sleep(500 + Math.random() * 400, true)
      }
    }
    run().catch((error) => {
      if (!(error instanceof Gone)) throw error
    })

    // A screen of another size draws the model elsewhere: the notes are put back on it.
    const replace = () =>
      requestAnimationFrame(() => {
        const v = view.current
        if (!v) return
        keep(notesNow.map((note) => ({ ...note, at: v.place(note.point) })))
      })
    window.addEventListener('resize', replace)
    return () => {
      alive = false
      window.removeEventListener('resize', replace)
      gsap.killTweensOf(cursor)
    }
  }, [ready, view])

  return (
    <div className="home__tinker" aria-hidden>
      {notes.map((note) => (
        <NoteMark key={note.id} at={note.at} shown={note.shown} />
      ))}
      {picked && (
        <>
          <PartButtons
            name={picked.label}
            at={picked}
            shown={shown}
            colour={hexOf(look.chosen) ?? picked.colour}
            ballOn={ballOn}
          />
          <LookPanel at={picked} open={look.open} chosen={look.chosen} colour={hexOf(look.chosen) ?? picked.colour} />
          <Writing
            name={picked.label}
            text={writing ?? ''}
            shown={writing !== null}
            at={{ x: across(picked.x, WRITING / 2), y: Math.min(picked.y, window.innerHeight - 190) }}
          />
        </>
      )}
      <div ref={pointer} className="home__pointer" data-pressed="false">
        <div>
          <MacPointer />
        </div>
      </div>
    </div>
  )
}

/** Where the middle of something this wide by half goes, across from `x`: on the screen. */
const across = (x: number, half: number) => Math.min(Math.max(x, half + 8), window.innerWidth - half - 8)

/** How wide what is written in is, and the colours' panel (the app's, px). */
const WRITING = 288
const PANEL = { width: 288, height: 418 }
const hexOf = (name: string | null) => SWATCHES.find(([one]) => one === name)?.[1] ?? null

/** A colour's hue (0 to 360), and how much colour and light it has (0 to 1). */
function hsvOf(hex: string) {
  const value = parseInt(hex.slice(1), 16)
  const [r, g, b] = [value >> 16, (value >> 8) & 255, value & 255].map((part) => part / 255)
  const most = Math.max(r, g, b)
  const spread = most - Math.min(r, g, b)
  const sixth =
    spread === 0
      ? 0
      : most === r
        ? ((g - b) / spread + 6) % 6
        : most === g
          ? (b - r) / spread + 2
          : (r - g) / spread + 4
  return { h: sixth * 60, s: most === 0 ? 0 : spread / most, v: most }
}

/**
 * A part's colours and materials, as its ball opens them: to the right of the ball, its
 * top level with the ball's (or to its left, where there is no room; and kept on the
 * screen). Color is open: what is under the pointer shows the colour, then the palette.
 */
function LookPanel({
  at,
  open,
  chosen,
  colour,
}: {
  at: Spot
  open: boolean
  chosen: string | null
  colour: string
}) {
  // the ball is the first of the buttons, which are 36px across and 6px apart, round
  // the place clicked
  const ball = { left: at.x - 60, right: at.x - 24, top: at.y - 18 }
  const wide = typeof window === 'undefined' ? 1440 : window.innerWidth
  const tall = typeof window === 'undefined' ? 900 : window.innerHeight
  const right = ball.right + 12 + PANEL.width <= wide - 12
  const left = right ? ball.right + 12 : ball.left - 12 - PANEL.width
  const top = Math.min(Math.max(ball.top, 12), tall - 12 - PANEL.height)
  const { h, s, v } = hsvOf(colour)
  const pure = `hsl(${h} 100% 50%)`
  return (
    <div className="home__look" data-on={open || undefined} data-side={right ? 'right' : 'left'} style={{ left, top }}>
      <div className="home__look-tabs">
        <span data-on>Color</span>
        <span>Material</span>
      </div>
      <div className="home__look-page">
        <div
          className="home__look-area"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
        >
          <i style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: colour }} />
        </div>
        <div className="home__look-hue">
          <i style={{ left: `${(h / 360) * 100}%`, background: pure }} />
        </div>
        <span className="home__look-hex">{colour}</span>
        <div className="home__look-swatches">
          {SWATCHES.map(([name, hex]) => (
            <span key={name} data-swatch={name} data-on={chosen === name || undefined} style={{ background: hex }} />
          ))}
        </div>
      </div>
    </div>
  )
}
