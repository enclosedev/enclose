import {
  DownloadIcon,
  RotateCcwIcon,
  UnfoldVerticalIcon,
} from 'lucide-react'
import { memo, useEffect, useState, type ComponentType, type CSSProperties } from 'react'
import type { Act } from '../../stageshow/act'
import { CORNER, Pill, Round, Scene, Switch } from '../fx'
import { CLOCKWORK } from './clockwork'
import './drawings.scss'

// Agentic CAD, the model taken apart and drawn: pulled apart in the view, drawn on
// sheets with its dimensions, and written up as the steps it goes together in.
//
// The sheets here are the arm's own (public/blueprint, drawn by the app's code: see
// scripts/blueprints.ts), put into the page as they are, so that what is on them can
// be changed: their dimensions drawn in and their units changed, or their parts shown
// one group at a time.

// ── a sheet, in the page ───────────────────────────────────────────────────

const SVG = 'http://www.w3.org/2000/svg'
const fetched = new Map<string, Promise<string>>()
const sheetOf = (file: string) => {
  let text = fetched.get(file)
  if (!text) {
    text = fetch(`/blueprint/${file}`).then((response) => response.text())
    fetched.set(file, text)
  }
  return text
}

/**
 * A sheet's SVG, made ready to be put in the page: its titles (which would come up
 * under the pointer) taken out, its parts named by `data-part` rather than by id (the
 * same sheet may be in the page twice), and then whatever `prepare` does to it.
 * Nothing until it has been fetched.
 */
function useSheet(file: string, prepare?: (svg: SVGSVGElement) => void) {
  const [markup, setMarkup] = useState<string | null>(null)
  useEffect(() => {
    let gone = false
    void sheetOf(file).then((text) => {
      if (gone) return
      const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement as unknown as SVGSVGElement
      for (const title of [...svg.querySelectorAll('title')]) title.remove()
      for (const named of [...svg.querySelectorAll('[id]')]) {
        named.setAttribute('data-part', named.id)
        named.removeAttribute('id')
      }
      svg.removeAttribute('width')
      svg.removeAttribute('height')
      svg.setAttribute('aria-hidden', 'true')
      prepare?.(svg)
      setMarkup(new XMLSerializer().serializeToString(svg))
    })
    return () => {
      gone = true
    }
    // (what it is prepared with is the same for as long as the card is up)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])
  return markup
}

/** A sheet's markup, drawn once: what changes on it is changed by the page's styles. */
const Drawn = memo(function Drawn({ markup, className }: { markup: string | null; className: string }) {
  return <div className={className} dangerouslySetInnerHTML={markup ? { __html: markup } : undefined} />
})

// ── Pulled apart ───────────────────────────────────────────────────────────
// The clock's movement and its hands, and Explode in the corner: pressed, they come
// apart, each part along its own way, and the slider that comes up at the foot of the
// view pulls them further. Explode again puts them back together. (Each part is a
// picture of its own, moved apart on the page: clockwork.ts, made by scripts/renders.ts.)

type ExplodeState = {
  apart: boolean
  /** how far the slider is along, 0 to 1 */
  pull: number
}

const PULL = 0.2
const explodeStart: ExplodeState = { apart: false, pull: PULL }

/** How far apart the clockwork is, of how far its parts say they go, for where the slider is. */
const apartFor = (s: ExplodeState) => (s.apart ? 0.6 + s.pull : 0)
/**
 * How wide the clockwork's pictures are drawn, design px, on a wide card and on a phone's:
 * put together, it fills the view, and pulled apart its ends go out past the card's edges.
 */
const CLOCKWORK_WIDE = { wide: 900, compact: 540 } as const
/** Its parts, the furthest back first. */
const BACK_TO_FRONT = [...CLOCKWORK.layers].sort((a, b) => a.z - b.z)

/**
 * The clockwork, as far apart as `apart` says, its middle in the middle of the view:
 * each part moved along its own way, the whole moved so that it stays in the middle.
 */
function Clockwork({ apart, width, middle }: { apart: number; width: number; middle: { x: number; y: number } }) {
  const height = width * CLOCKWORK.tall
  const along = apart / CLOCKWORK.most
  const mx = CLOCKWORK.middle[0] + (CLOCKWORK.middleApart[0] - CLOCKWORK.middle[0]) * along
  const my = CLOCKWORK.middle[1] + (CLOCKWORK.middleApart[1] - CLOCKWORK.middle[1]) * along
  return (
    <div
      className="dw-explode__clockwork"
      style={{ width, height, transform: `translate(${middle.x - mx * width}px, ${middle.y - my * height}px)` }}
    >
      {BACK_TO_FRONT.map((part) => (
        <img
          key={part.id}
          src={`/renders/clockwork/${part.id}.webp`}
          alt=""
          draggable={false}
          style={{ transform: `translate(${part.dx * apart * width}px, ${part.dy * apart * width}px)` }}
        />
      ))}
    </div>
  )
}

async function explodeScript(a: Act<ExplodeState>) {
  await a.wait(900)
  await a.move('explode')
  await a.wait(300)
  await a.click()
  await a.set({ apart: true })
  await a.wait(1600)
  // the slider, pulled along: the pieces go further apart
  await a.move({ at: 'thumb', x: 0.5, y: 0.5 })
  const rail = a.rect('rail')
  await a.drag(
    { at: 'rail', x: 0.88, y: 0.5 },
    (at) => a.put({ pull: Math.min(1, Math.max(0, (at.x - rail.x) / rail.width)) }),
    { duration: 1300 },
  )
  await a.wait(2400)
  // and put back together
  await a.move('explode')
  await a.click()
  await a.set({ apart: false })
  await a.wait(900)
  await a.snap({ pull: PULL })
  await a.wait(700)
}

function Explode() {
  return (
    <Scene<ExplodeState>
      className="dw-explode"
      initial={explodeStart}
      poster={{ apart: true, pull: 0.88 }}
      script={explodeScript}
      cursor={{ at: { wide: { x: 470, y: 340 }, compact: { x: 250, y: 330 } }, idle: 1400 }}
    >
      {(s, _rect, layout) => (
        <>
          <Clockwork
            apart={apartFor(s)}
            width={CLOCKWORK_WIDE[layout]}
            middle={layout === 'wide' ? { x: 300, y: 285 } : { x: 180, y: 165 }}
          />
          <div className="dw-explode__corner">
            <Round target="explode" on={s.apart} tool={false}>
              <UnfoldVerticalIcon />
            </Round>
          </div>
          <div className="dw-spread" data-on={s.apart || undefined}>
            <span className="dw-spread__twice">2x</span>
            <span className="dw-slider" data-target="rail" style={{ '--along': s.pull } as CSSProperties}>
              <i className="dw-slider__range" />
              <i className="dw-slider__thumb" data-target="thumb" data-cursor="pointer" />
            </span>
          </div>
        </>
      )}
    </Scene>
  )
}

// ── Blueprints ─────────────────────────────────────────────────────────────
// A sheet opened out to fill the view, the ones beside it at its sides. Dimensions,
// at the foot, draws them in, and the units that come up beside it turn them from
// millimetres to inches. Then back, and off.

type BlueprintState = { dims: boolean; inches: boolean }

/** Each length's text, written twice: in millimetres, as drawn, and in inches. */
function measured(svg: SVGSVGElement) {
  const dimensions = svg.querySelector('[data-part="dimensions"]')
  if (!dimensions) return
  for (const path of dimensions.querySelectorAll('path')) {
    if (path.getAttribute('stroke') === 'none') path.setAttribute('class', 'dw-head')
    else path.setAttribute('pathLength', '1')
  }
  for (const text of [...dimensions.querySelectorAll('text')]) {
    const length = Number(text.textContent)
    const held = svg.ownerDocument.createElementNS(SVG, 'g')
    const turned = text.getAttribute('transform')
    if (turned) held.setAttribute('transform', turned)
    text.removeAttribute('transform')
    text.replaceWith(held)
    const inches = text.cloneNode(true) as SVGTextElement
    text.setAttribute('class', 'dw-mm')
    inches.setAttribute('class', 'dw-in')
    inches.textContent = (length / 25.4).toFixed(2)
    held.append(text, inches)
  }
}

const blueprintStart: BlueprintState = { dims: false, inches: false }

async function blueprintScript(a: Act<BlueprintState>) {
  await a.wait(1000)
  await a.click('dims')
  await a.set({ dims: true })
  await a.wait(1700)
  await a.click('inches')
  await a.set({ inches: true })
  await a.wait(2600)
  await a.click('mm')
  await a.set({ inches: false })
  await a.wait(1000)
  await a.click('dims')
  await a.set({ dims: false })
  await a.wait(1400)
}

function Blueprint() {
  // (the clock's, as the card beside it has: public/blueprint/clock, scripts/blueprints.ts)
  const markup = useSheet('clock/top-right.svg', measured)
  return (
    <Scene<BlueprintState>
      className="dw-blueprint"
      initial={blueprintStart}
      poster={{ dims: true, inches: false }}
      script={blueprintScript}
      cursor={{ at: { wide: { x: 500, y: 300 }, compact: { x: 290, y: 300 } }, idle: 1400 }}
    >
      {(s) => (
        <>
          <span className="dw-blueprint__beside dw-blueprint__beside--before" />
          <span className="dw-blueprint__beside dw-blueprint__beside--after" />
          <div className="dw-blueprint__paper" data-dims={s.dims || undefined} data-inches={s.inches || undefined}>
            <Drawn markup={markup} className="dw-blueprint__sheet" />
          </div>
          <div className="dw-blueprint__bars">
            <Pill target="dims">
              Dimensions
              <Switch on={s.dims} />
            </Pill>
            <span className="dw-units" data-on={s.dims || undefined}>
              <span className="dw-units__in">
                <b data-on={!s.inches || undefined} data-target="mm" data-cursor="pointer">
                  mm
                </b>
                <b data-on={s.inches || undefined} data-target="inches" data-cursor="pointer">
                  in
                </b>
              </span>
            </span>
            <Pill style={{ paddingLeft: 14 }}>
              <DownloadIcon />
              <span className="dw-blueprint__all">Download all SVG</span>
            </Pill>
          </div>
        </>
      )}
    </Scene>
  )
}

// ── Assembly guides ────────────────────────────────────────────────────────
// The page a guide is: its steps down the left, and the arm beside them, drawn from
// a corner. Step by step its parts come in and go on, lit, over those on already;
// at the end it is whole, and going back up the steps takes it apart again.

const STEPS = [
  { title: 'Base', says: 'Stand the base on the table, its board towards you.', parts: 'Base, motor holder, board', on: ['base'] },
  { title: 'Shoulder', says: 'Press the shoulder onto the first servo’s horn, and screw it down.', parts: 'Shoulder, 2 horns, 6 screws', on: ['shoulder'] },
  { title: 'Upper arm', says: 'Fit the upper arm over the second servo, its cable to the back.', parts: 'Upper arm, servo, 4 screws', on: ['upper-arm'] },
  { title: 'Lower arm', says: 'Hang the lower arm from the elbow’s horn.', parts: 'Lower arm, wrist holder, servo', on: ['lower-arm'] },
  { title: 'Wrist', says: 'Screw the wrist to the fourth servo’s horn.', parts: 'Wrist, servo, 4 screws', on: ['wrist'] },
  { title: 'Gripper and jaw', says: 'Put the gripper on, then hook the jaw over its servo.', parts: 'Gripper, jaw, 2 servos', on: ['gripper', 'jaw'] },
]
/** The arm's groups, in the order the steps put them on. */
const GROUPS = STEPS.flatMap((step) => step.on)

type AssemblyState = { step: number }

async function assemblyScript(a: Act<AssemblyState>) {
  await a.wait(1000)
  for (let step = 1; step <= STEPS.length; step++) {
    await a.set({ step })
    await a.wait(step === 1 ? 1700 : 1500)
  }
  // the last step, and then the thing whole, with nothing lit
  await a.set({ step: STEPS.length + 1 })
  await a.wait(2600)
  // back up the steps to the start: it comes apart, the last part first
  for (let step = STEPS.length; step >= 0; step--) {
    await a.set({ step })
    await a.wait(140)
  }
  await a.wait(500)
}

function Assembly() {
  const markup = useSheet('top-left.svg', (svg) => svg.querySelector('[data-part="dimensions"]')?.remove())
  return (
    <Scene<AssemblyState>
      className="dw-assembly"
      initial={{ step: 0 }}
      poster={{ step: 3 }}
      script={assemblyScript}
    >
      {(s) => {
        const whole = s.step > STEPS.length
        return (
          <>
            <div className="dw-guide" data-step={s.step}>
              <Drawn markup={markup} className="dw-guide__sheet" />
              <style>
                {GROUPS.map((group) => {
                  const at = STEPS.findIndex((one) => one.on.includes(group)) + 1
                  const state = s.step < at ? 'off' : s.step === at ? 'lit' : 'on'
                  return `.dw-guide [data-part="${group}"]{${PARTS[state]}}`
                }).join('')}
              </style>
            </div>
            <div className="dw-assembly__cover">
              <strong>Robot arm</strong>
              <span>Assembly guide · 6 steps</span>
            </div>
            <div className="dw-steps">
              <div className="dw-steps__list" style={{ '--at': Math.min(s.step, STEPS.length) } as CSSProperties}>
                <section className="dw-step" data-shown={s.step === 0 || undefined}>
                  <span className="dw-step__label">Before you start</span>
                  <ul className="dw-needs">
                    <li>2 mm hex key</li>
                    <li>Phillips screwdriver</li>
                  </ul>
                </section>
                {STEPS.map((step, index) => (
                  <section
                    key={step.title}
                    className="dw-step"
                    data-shown={s.step === index + 1 || (whole && index === STEPS.length - 1) || undefined}
                  >
                    <span className="dw-step__label">Step {index + 1}</span>
                    <strong>{step.title}</strong>
                    <p>{step.says}</p>
                    <span className="dw-step__parts">{step.parts}</span>
                  </section>
                ))}
              </div>
            </div>
            <span className="dw-progress">
              <i style={{ '--at': Math.min(s.step, STEPS.length) / STEPS.length } as CSSProperties} />
            </span>
            <Round style={{ position: 'absolute', top: CORNER, right: CORNER }}>
              <RotateCcwIcon />
            </Round>
          </>
        )
      }}
    </Scene>
  )
}

/** How a group of the arm's is drawn, by whether its step has come. */
const PARTS = {
  off: 'opacity:0;transform:translate(-6px,-9px)',
  on: 'opacity:1;transform:none;stroke:var(--dw-on)',
  lit: 'opacity:1;transform:none;stroke:var(--dw-lit)',
}


export const DRAWINGS: Record<string, ComponentType> = {
  explode: Explode,
  blueprint: Blueprint,
  assembly: Assembly,
}
