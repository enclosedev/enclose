import type gsapType from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { resolveTokens } from 'modulato'
import { WINDOW } from '../../components/app/data'
import { REST, type Look } from '../../components/app/look'
import type { Frame } from '../../components/app/view'
import { drawMark, GIZMO, GIZMO_PARTS } from '../../shell/axes'
import tokens from './motion'

// The first screen. Where things may move (styles.scss: `[data-spatial]`) it starts
// as the arm by itself in the dark, seen from its right, level with it, rising from
// the foot of the screen: it stands in a
// studio that goes on for ever, its shadow on the floor (the view's studio, a canvas
// the size of the screen), and someone is at work on it (Tinker.tsx). Scrolling
// brings the app round it: the eye goes round to where the app looks from, and the
// studio is cut down to the window's shape. The scroll can stop anywhere, and go back.
// Once the window is there, what is in it comes in by itself: its cards and buttons one
// after another, and then the conversation opens.
//
// The arm does not move: what it can do is for further down the page.

/**
 * How the arm is looked at to begin with: from its right (the app's Right), nearly level;
 * its jaw shut, as it stays (it is built a little open).
 */
const SIDE = { azimuth: 0, elevation: 6, distance: 3.6, shadow: 1, grip: 0 }
/** And once the window is together: the app's own look. */
const TOGETHER = { azimuth: REST.azimuth, elevation: REST.elevation, distance: REST.distance, shadow: 0, grip: 0 }
/** The arm from its side, as SIDE draws it, in the window's px: about this big. */
const PROFILE = { width: 900, height: 540 }
/** How much of the arm is under the foot of the screen to begin with (on a phone: less). */
const SUNK = { wide: 0.35, compact: 0.15 }

export function runIntro({
  gsap,
  root,
  draw,
  resize,
}: {
  gsap: typeof gsapType
  root: HTMLElement
  /** draws the model, once there is one to draw: in the window, or where `frame` says */
  draw: (look: Look, frame?: Frame) => void
  /** (the studio) the screen is this big now */
  resize: (width: number, height: number) => void
}) {
  const top = root.querySelector<HTMLElement>('.home__top')!
  const pin = root.querySelector<HTMLElement>('.home__pin')!
  const frame = root.querySelector<HTMLElement>('.home__window')!
  const studio = root.querySelector<HTMLElement>('.home__studio')!
  const app = root.querySelector<HTMLElement>('.app')!
  const hero = root.querySelector<HTMLElement>('.home__hero')!
  const tinker = root.querySelector<HTMLElement>('.home__tinker')
  const cue = root.querySelector<HTMLElement>('.home__cue')
  const credit = root.querySelector<HTMLElement>('.home__credit')
  const gizmo = root.querySelector<HTMLElement>('[data-app="gizmo"]')!
  const mark = document.querySelector<HTMLElement>('.header__mark')
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // (come to from another page, the page's script did not run as it was read)
  if (!reduced && !top.hasAttribute('data-spatial')) top.setAttribute('data-spatial', '')
  const spatial = top.hasAttribute('data-spatial')

  const look: Look = spatial ? { ...REST, ...SIDE, x: WINDOW.width / 2 } : { ...REST }
  /** (the studio) where the window would be on it, as far as the model is drawn */
  const seenFrom: Frame = { x: 0, y: 0, scale: 1 }
  // (the window as it stays) how far the eye still is from where it rests, on its way
  // round as the model arrives: it is added to the look.
  const yet = { azimuth: 0, elevation: 0 }
  const seen: Look = { ...look }
  let there = false
  const render = () => {
    if (!there) return
    Object.assign(seen, look)
    seen.azimuth += yet.azimuth
    seen.elevation += yet.elevation
    draw(seen, spatial ? seenFrom : undefined)
    gizmo.innerHTML = drawMark({ ...GIZMO, azimuth: seen.azimuth, elevation: seen.elevation }, GIZMO_PARTS)
  }

  /** The window as it stays: scaled to the room it is laid out in (`--fit`, styles.scss). */
  const fit = () => frame.style.setProperty('--fit', String(frame.offsetWidth / WINDOW.width))
  if (!spatial) {
    fit()
    window.addEventListener('resize', fit)
  }

  let unmeasure = () => {}
  /** (the window come apart) everything as the scroll has it now, drawn so */
  let settle = render
  const context = gsap.context(() => {
    // The mark starts over the heading, and goes to its corner as the page is scrolled.
    if (mark)
      gsap.fromTo(
        mark,
        { '--fly': 1 },
        {
          '--fly': 0,
          ease: 'power2.inOut',
          scrollTrigger: { trigger: root, start: 'top top', end: '+=320', scrub: true },
        },
      )
    if (spatial) unmeasure = putTogether()
  })

  function putTogether() {
    const pieces = [...app.querySelectorAll<HTMLElement>('[data-float]')]
    const lights = app.querySelector<HTMLElement>('[data-app="lights"]')!

    // Which side of the window each piece is on, with the conversation put away: it
    // comes in from that side.
    gsap.set(app, { '--shut': 1, '--framed': 0 })
    const whole = app.getBoundingClientRect()
    const sides = pieces.map((piece) => {
      const box = piece.getBoundingClientRect()
      return box.left + box.width / 2 < whole.left + whole.width / 2 ? -1 : 1
    })

    // The screen; the arm on it to begin with, under the words; and the window, as big
    // as fits, where it stays.
    const screen = { wide: 0, tall: 0 }
    const alone: Frame = { x: 0, y: 0, scale: 1 }
    const fitted: Frame = { x: 0, y: 0, scale: 1 }
    const cut = { from: '', to: '' }

    const measure = () => {
      screen.wide = pin.clientWidth
      screen.tall = pin.clientHeight
      const compact = screen.wide < 768
      resize(screen.wide, screen.tall)

      // the arm in the middle, coming up from under the foot of the screen, filling what
      // the words leave of it (as wide as the screen, at most: on a phone, wider)
      const words = hero.offsetTop + hero.offsetHeight
      const room = screen.tall - words - (compact ? 32 : 40)
      const sunk = compact ? SUNK.compact : SUNK.wide
      alone.scale = Math.min(
        (screen.wide * (compact ? 1.4 : 1)) / PROFILE.width,
        room / (1 - sunk) / PROFILE.height,
      )
      const tall = PROFILE.height * alone.scale
      alone.x = screen.wide / 2 - (WINDOW.width / 2) * alone.scale
      alone.y = screen.tall + tall * (sunk - 0.5) - (WINDOW.height / 2) * alone.scale

      // room for the mark over the window, and the page's edges beside it
      const edge = parseFloat(getComputedStyle(root).getPropertyValue('--edge')) || 20
      const over = compact ? 64 : 76
      const under = compact ? 64 : 36
      fitted.scale = Math.min(
        (screen.wide - edge * 2) / WINDOW.width,
        (screen.tall - over - under) / WINDOW.height,
      )
      fitted.x = (screen.wide - WINDOW.width * fitted.scale) / 2
      fitted.y = over + (screen.tall - over - under - WINDOW.height * fitted.scale) / 2
      gsap.set(frame, { x: fitted.x, y: fitted.y, scale: fitted.scale })

      // the studio, from the whole screen to the window's own shape
      const right = screen.wide - fitted.x - WINDOW.width * fitted.scale
      const bottom = screen.tall - fitted.y - WINDOW.height * fitted.scale
      cut.from = 'inset(0px 0px 0px 0px round 0px)'
      cut.to = `inset(${fitted.y}px ${right}px ${bottom}px ${fitted.x}px round ${18 * fitted.scale}px)`
    }
    gsap.set(frame, { transformOrigin: '0 0' })
    measure()
    ScrollTrigger.addEventListener('refreshInit', measure)

    /** what is in the window: below */
    let assemble: ReturnType<typeof gsap.timeline> | null = null
    const together = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: top,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
      onUpdate() {
        render()
        // the window is nearly there, the studio most of the way down to it: what is in
        // it comes in, by itself (and goes, if the page is scrolled back up)
        if (!assemble) return
        const formed = together.progress() > 0.7
        if (formed && assemble.reversed()) assemble.timeScale(1).play()
        else if (!formed && !assemble.reversed()) assemble.timeScale(3).reverse()
      },
    })
    // the words go, and whoever was at work on the arm, and what said to scroll
    together.to([hero, tinker].filter(Boolean), { opacity: 0, y: -40, duration: 0.12, ease: 'power1.in' }, 0)
    together.to([cue, credit].filter(Boolean), { autoAlpha: 0, duration: 0.04, ease: 'none' }, 0)
    // The eye goes round to where the app looks from, and the arm to where the window
    // has it; and the studio is cut down to the window.
    together.fromTo(look, { ...SIDE }, { ...TOGETHER, duration: 0.5 }, 0.06)
    together.fromTo(
      seenFrom,
      { x: () => alone.x, y: () => alone.y, scale: () => alone.scale },
      { x: () => fitted.x, y: () => fitted.y, scale: () => fitted.scale, duration: 0.5 },
      0.06,
    )
    together.fromTo(studio, { clipPath: () => cut.from }, { clipPath: () => cut.to, duration: 0.36 }, 0.2)
    together.fromTo(app, { '--framed': 0 }, { '--framed': 1, duration: 0.12 }, 0.42)
    // (held a while, the window empty, before the page goes on)
    together.to({}, { duration: 0.06 })

    // What is in the window, which comes in once it is there, in its own time: its cards
    // and buttons, one after another, each from its own side, and its lights; and then
    // the conversation opens, the model going over to the middle of what is left.
    assemble = gsap.timeline({ paused: true, reversed: true, onUpdate: render })
    pieces.forEach((piece, index) => {
      assemble!.fromTo(
        piece,
        { opacity: 0, x: 28 * sides[index] },
        { opacity: 1, x: 0, duration: 0.6, ease: 'power3.out' },
        index * 0.045,
      )
    })
    assemble.fromTo(lights, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 0.5)
    assemble.addLabel('talk', '-=0.2')
    assemble.fromTo(app, { '--shut': 1 }, { '--shut': 0, duration: 0.8, ease: 'power3.inOut' }, 'talk')
    assemble.fromTo(look, { x: WINDOW.width / 2 }, { x: REST.x, duration: 0.8, ease: 'power3.inOut' }, 'talk')

    // And once the page goes on past it, as the first of what Enclose does comes up from
    // the foot of the screen, the window fades away.
    const next = root.querySelector<HTMLElement>('.showcase')
    if (next)
      gsap.fromTo(
        pin,
        { opacity: 1 },
        {
          opacity: 0,
          ease: 'none',
          scrollTrigger: { trigger: next, start: 'top 50%', end: 'top 10%', scrub: true },
        },
      )

    // What it has been measured as is only taken up as the page is scrolled: so, until
    // it is, it is put where the scroll has it, again, once the page is measured, and
    // once the model is there.
    settle = () => {
      together.render(together.totalTime(), true, true)
      render()
    }
    ScrollTrigger.addEventListener('refresh', settle)

    top.setAttribute('data-spatial', 'on')
    return () => {
      ScrollTrigger.removeEventListener('refreshInit', measure)
      ScrollTrigger.removeEventListener('refresh', settle)
    }
  }

  return {
    /** The model has arrived: in the window, from the front to begin with, and brought round. */
    arrive() {
      there = true
      if (!spatial) {
        const { azimuth, elevation, duration, ease } = resolveTokens(tokens).arrive
        gsap.fromTo(
          yet,
          { azimuth: azimuth - REST.azimuth, elevation: elevation - REST.elevation },
          { azimuth: 0, elevation: 0, duration, ease, onUpdate: render, overwrite: true },
        )
      }
      settle()
    },
    stop() {
      gsap.killTweensOf(yet)
      unmeasure()
      window.removeEventListener('resize', fit)
      // The mark is the shell's, and on its way to where the next page has it: it
      // goes from wherever this page left it, so that is left written on it.
      const flown = mark?.style.getPropertyValue('--fly') ?? ''
      context.revert()
      if (flown) mark?.style.setProperty('--fly', flown)
      ScrollTrigger.refresh()
    },
  }
}
