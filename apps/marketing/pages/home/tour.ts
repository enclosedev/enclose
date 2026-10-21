import type gsapType from 'gsap'
import { resolveTokens } from 'modulato'
import { ACTIVITIES, TYPED, WINDOW } from '../../components/app/data'
import { BUILT, REST, type Look } from '../../components/app/look'
import { drawMark, GIZMO, GIZMO_PARTS } from '../../shell/axes'
import tokens from './motion'

// The page's one long move. The app's window stays on the screen while the page is
// scrolled, and the scroll takes it from stop to stop: to its project cards, to the
// list of its model's parts and the other buttons down the edge of its view, to its
// conversation, to a project's own tools, to its drawings. At each stop something goes on in the window, as far along as
// the scroll is: so it can be stopped anywhere, and run backwards.

/** When each stop is reached and left, on the timeline: the gaps are the ways between. */
const AT = {
  projects: [10, 24],
  parts: [30, 40],
  menu: [43, 61],
  chat: [67, 85],
  tools: [91, 107],
  sheets: [113, 127],
  outro: [135, 135],
} as const

type Stop = keyof typeof AT
/** The stops that say where the window is at them: all but the last. */
const TOLD = (Object.keys(AT) as Stop[]).filter((name) => name !== 'outro') as Exclude<Stop, 'outro'>[]

/** The arm's routine: where its joints are from one beat to the next. */
const ROUTINE: Partial<Look>[] = [
  { turn: 0, shoulder: 95, elbow: 100, wrist: 10, roll: 0, grip: BUILT },
  // waving
  { turn: -28, shoulder: 105, elbow: 150, wrist: -40, roll: 30, grip: 80 },
  { turn: 28, shoulder: 105, elbow: 150, wrist: 35, roll: -30, grip: 80 },
  { turn: -20, shoulder: 105, elbow: 150, wrist: -40, roll: 30, grip: 80 },
  // pick and place
  { turn: -38, shoulder: 150, elbow: 120, wrist: 45, roll: 0, grip: 85 },
  { turn: -38, shoulder: 158, elbow: 118, wrist: 50, roll: 0, grip: 12 },
  { turn: 10, shoulder: 110, elbow: 115, wrist: 20, roll: 0, grip: 12 },
  { turn: 42, shoulder: 152, elbow: 122, wrist: 48, roll: 0, grip: 85 },
  // stirring
  { turn: 12, shoulder: 132, elbow: 128, wrist: 60, roll: 80, grip: 10 },
  { turn: -12, shoulder: 140, elbow: 120, wrist: 66, roll: -80, grip: 10 },
  { turn: 12, shoulder: 132, elbow: 128, wrist: 60, roll: 120, grip: 10 },
  // a bow, and folded again, as it is built
  { turn: 0, shoulder: 150, elbow: 60, wrist: -30, roll: 0, grip: 40 },
  { turn: 0, shoulder: 95, elbow: 100, wrist: 10, roll: 0, grip: BUILT },
  { turn: 0, shoulder: 0, elbow: 0, wrist: 0, roll: 0, grip: BUILT },
]

export function runTour({
  gsap,
  root,
  draw,
}: {
  gsap: typeof gsapType
  /** the page */
  root: HTMLElement
  /** draws the model, once there is one to draw */
  draw: (look: Look) => void
}) {
  const one = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const all = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)]

  const tour = one('.home__tour')
  const stage = one('.home__stage')
  const hero = one('.home__hero')
  const frame = one('.home__window')
  const app = one('.app')
  const captions = all('.home__caption')
  const mark = document.querySelector<HTMLElement>('.header__mark')
  const gizmo = one('[data-app="gizmo"]')

  /** Where the window is (its top left corner and its scale) and how its model is looked at. */
  const cam = { x: 0, y: 0, s: 1 }
  const look: Look = { ...REST }
  /** where the window is laid out, before it is moved: what `cam` is measured from */
  let home = { x: 0, y: 0, s: 1 }

  // How long the agent has been at work on what the scroll had sent: by the clock, as
  // in the app, from the moment the scroll sends it. Scrolled back to before that, it
  // was never sent, and the next time it is sent the count starts again.
  // The open project's card says the same, with the same time, for as long as it is so.
  const workingFor = [one('[data-app="working-for"]'), one('[data-app="at-work-for"]')]
  const atWork = one('[data-app="at-work"]').parentElement!
  let sentAt: number | null = null
  let counting = 0
  const said = () => {
    const seconds = sentAt === null ? 0 : Math.floor((Date.now() - sentAt) / 1000)
    const minutes = Math.floor(seconds / 60)
    for (const one of workingFor) one.textContent = seconds < 60 ? `${seconds} s` : `${minutes} min`
  }
  const working = (now: boolean) => {
    if (now === (sentAt !== null)) return
    window.clearInterval(counting)
    sentAt = now ? Date.now() : null
    if (now) counting = window.setInterval(said, 1000)
    atWork.toggleAttribute('data-working', now)
    said()
  }

  // How far the eye still is from where the scroll has it, on its way round as the
  // model arrives: see `arrive`. It is added to the look, so the scroll can go on
  // under it.
  const yet = { azimuth: 0, elevation: 0 }
  const seen: Look = { ...REST }

  const render = () => {
    frame.style.transform = `translate3d(${cam.x - home.x}px, ${cam.y - home.y}px, 0) scale(${cam.s / home.s})`
    Object.assign(seen, look)
    seen.azimuth += yet.azimuth
    seen.elevation += yet.elevation
    draw(seen)
    gizmo.innerHTML = drawMark(
      { ...GIZMO, azimuth: seen.azimuth, elevation: seen.elevation },
      GIZMO_PARTS,
    )
  }

  /** The window is scaled to the room it is laid out in: see `--fit` in styles.scss. */
  const fit = () => frame.style.setProperty('--fit', String(frame.offsetWidth / WINDOW.width))

  const build = () => {
    fit()
    const wide = stage.clientWidth
    const tall = stage.clientHeight
    home = { x: frame.offsetLeft, y: frame.offsetTop, s: frame.offsetWidth / WINDOW.width }
    Object.assign(cam, home)
    Object.assign(look, REST)

    const stops = resolveTokens(tokens).stops
    /** A stop as the screen has it: where the window is, and the model in it. */
    const stop = (name: Exclude<Stop, 'outro'>) => {
      const at = stops[name]
      const s = (at.wide * wide) / WINDOW.width
      const x = at.vx * wide - at.ax * s
      const y = at.vy * tall - at.ay * s
      return {
        x,
        y,
        s,
        // the model's middle, in the window's px: where the stop says on the screen,
        // or in the middle of the view
        mx: 'mx' in at ? (at.mx * wide - x) / s : REST.x,
        my: 'my' in at ? (at.my * tall - y) / s : REST.y,
        far: at.far,
      }
    }
    const to = {
      ...Object.fromEntries(TOLD.map((name) => [name, stop(name)])),
      // And the last, which is the page's opening the other way up: the window as big
      // as it was then, with its foot as far from the foot of the screen as its top
      // was from the top. The model is in the middle of what shows of its view.
      outro: {
        x: home.x,
        y: tall - home.y - WINDOW.height * home.s,
        s: home.s,
        mx: REST.x,
        my: Math.max(REST.y, WINDOW.height - (tall - home.y) / home.s / 2),
        far: stops.outro.far,
      },
    } as Record<Stop, ReturnType<typeof stop>>
    // The conversation is gone to by its foot, where the message box is. But a window
    // that is no taller than the screen is all on it, in the middle.
    // (On a narrow screen the words are under the window, and it keeps clear of them.)
    if (wide >= 768 && WINDOW.height * to.chat.s < tall * 0.92)
      to.chat.y = (tall - WINDOW.height * to.chat.s) / 2

    const length = AT.outro[1]
    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: { trigger: tour, start: 'top top', end: 'bottom bottom', scrub: true },
    })

    /** The way from one stop to the next: the window, and the model in it. */
    const go = (name: Stop, from: number, more: Partial<Look> = {}) => {
      const { x, y, s, mx, my, far } = to[name]
      const duration = AT[name][0] - from
      tl.to(cam, { x, y, s, duration }, from)
      tl.to(look, { x: mx, y: my, distance: far, ...more, duration }, from)
    }
    // On a phone the captions are in one band that stays, and the band is gone along
    // sideways from each to the next on the way to its stop: see styles.scss.
    const band = wide < 768 ? one('.home__captions') : null
    const trail = one('.home__trail')
    /** What is said of a stop, or of the stops from one to another, while it is there. */
    const caption = (index: number, name: Stop, last: Stop = name) => {
      const arrive = AT[name][0]
      const leave = AT[last][1]
      if (band) {
        if (index === 0)
          tl.fromTo(
            band,
            { autoAlpha: 0, y: 24 },
            { autoAlpha: 1, y: 0, duration: 3, ease: 'power2.out' },
            arrive - 3,
          )
        else
          tl.to(
            trail,
            { xPercent: (-index * 100) / captions.length, duration: 4, ease: 'power2.inOut' },
            arrive - 4.6,
          )
        return
      }
      tl.fromTo(
        captions[index],
        { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 2.4, ease: 'power2.out' },
        arrive - 1.8,
      )
      tl.to(captions[index], { autoAlpha: 0, y: -14, duration: 2, ease: 'power2.in' }, leave - 1)
    }
    // How far open each thing that can be put away is, 0 to 1, and how much each
    // thing that gives way is there. They are numbers of the timeline's own, and the
    // page is set from them: a style the timeline changed would be put back, on the
    // way up the page, to whatever the browser had worked it out to be on the way
    // down, and a row's height in px is right only for what was in it then.
    const open = new Map<HTMLElement, { by: number }>()
    for (const one of all('.app__tuck, .app__chips')) one.style.gridTemplateRows = ''
    /** Something put away or brought back: it closes up to nothing, or opens from it. */
    const tuck = (targets: HTMLElement | HTMLElement[], opened: boolean, at: number, duration = 2) => {
      for (const target of [targets].flat()) {
        let how = open.get(target)
        if (!how) {
          how = { by: getComputedStyle(target).gridTemplateRows === '0px' ? 0 : 1 }
          open.set(target, how)
        }
        const set = how
        tl.to(
          set,
          {
            by: opened ? 1 : 0,
            duration,
            ease: 'power2.inOut',
            onUpdate: () => (target.style.gridTemplateRows = `${set.by}fr`),
          },
          at,
        )
      }
    }
    /** A button's tip comes up, the button is pressed (or let go), and the tip goes. */
    const press = (button: HTMLElement, on: number | null, at: number, held = 2.4) => {
      tl.to(button, { '--tip': 1, duration: 0.8, ease: 'power2.out' }, at)
      if (on !== null) tl.to(button, { '--on': on, duration: 0.5 }, at + 0.8)
      tl.to(button, { '--tip': 0, duration: 0.6, ease: 'power2.in' }, at + held)
    }
    const says = (target: HTMLElement, text: () => string) => () => {
      const next = text()
      if (target.textContent !== next) target.textContent = next
    }

    // ── from the top of the page to the project cards ─────────────────────
    // What the page says first goes up as fast as the page is scrolled.
    const perUnit = (tour.offsetHeight - tall) / length
    tl.to(hero, { y: -perUnit * 12, duration: 12, ease: 'none' }, 0)
    tl.to(hero, { autoAlpha: 0, duration: 5, ease: 'none' }, 1.5)
    // (Written on the mark from the start, and not left to the stylesheet, which has
    // it there only while this is the page that is up: see `stop`.)
    if (mark)
      tl.fromTo(mark, { '--fly': 1 }, { '--fly': 0, duration: 9, ease: 'power2.inOut' }, 0)
    go('projects', 0, { azimuth: -38 })
    caption(0, 'projects')

    // The cards that were not there come in one after another, and the earlier
    // conversations of the first come out from under it.
    const later = all('[data-app="later"]')
    later.forEach((card, index) => {
      const at = AT.projects[0] + index * 1.7
      tuck(card, true, at)
      tl.fromTo(card, { marginBottom: -6 }, { marginBottom: 0, duration: 2, immediateRender: false }, at)
      tl.to(card.querySelector('.app__card'), { opacity: 1, duration: 1.4 }, at + 0.6)
    })
    const spread = one('[data-app="spread"]')
    const stacked = one('.app__card[data-under]')
    tuck(spread, true, AT.projects[0] + 6, 3)
    tl.to(stacked, { marginBottom: 0, duration: 1 }, AT.projects[0] + 6)
    tl.to(one('[data-app="sliver"]'), { opacity: 0, duration: 0.6 }, AT.projects[0] + 6)
    tl.to(all('[data-app="earlier"]'), { opacity: 1, duration: 1.4, stagger: 0.7 }, AT.projects[0] + 6.8)
    // the cards grow down the screen, and the window goes up to keep their foot on it
    const { foot, footAt } = stops.projects
    tl.to(
      cam,
      { y: Math.min(to.projects.y, footAt * tall - foot * to.projects.s), duration: 11, ease: 'sine.inOut' },
      AT.projects[0] + 1,
    )
    tl.to(look, { azimuth: -24, duration: 14, ease: 'none' }, AT.projects[0])

    // ── the buttons down the edge of the view ─────────────────────────────
    const talk = one('[data-app="talk"]')
    const button = (id: string) => one(`[data-switch="${id}"]`)
    press(talk, 0, AT.projects[1] + 0.5)
    tl.to(app, { '--shut': 1, duration: 4 }, AT.projects[1] + 1.5)
    go('parts', AT.projects[1], { azimuth: -58, elevation: 30 })
    caption(1, 'parts', 'menu')

    // The first of them brings up the list of the model's parts, and the model is
    // moved over to what the list leaves of the view.
    const [listed, listedEnds] = AT.parts
    const list = one('[data-app="parts"]')
    const groups = one('[data-app="groups"]')
    const picked = one('[data-app="picked"]')
    press(button('parts'), 1, listed - 1.4)
    tl.fromTo(
      list,
      { autoAlpha: 0, x: 14 },
      { autoAlpha: 1, x: 0, duration: 1.6, ease: 'power2.out' },
      listed - 0.4,
    )
    // The list is gone down, as far as has one of its groups in the middle of it,
    tl.to(
      groups,
      {
        y: -(picked.offsetTop - (list.clientHeight - picked.offsetHeight) / 2),
        duration: 4.4,
        ease: 'sine.inOut',
      },
      listed + 1.2,
    )
    // and that group is picked: it is shown on its own, and the eye goes in to it.
    const alone = listed + 6
    tl.to(picked, { '--lit': 1, duration: 0.4 }, alone)
    tl.to(look, { others: 0, duration: 1, ease: 'power2.out' }, alone + 0.3)
    tl.to(look, { alone: 1, distance: stops.parts.near, duration: 2.4 }, alone + 0.3)
    tl.to(look, { azimuth: -34, duration: listedEnds - listed, ease: 'none' }, listed)
    // A press on anything else puts the list away, and the rest of the model is back.
    tl.to(picked, { '--lit': 0, duration: 0.4 }, listedEnds)
    tl.to(look, { others: 1, duration: 2, ease: 'power2.in' }, listedEnds + 0.4)
    tl.to(look, { alone: 0, duration: 2.4 }, listedEnds)
    tl.to(list, { autoAlpha: 0, x: 14, duration: 1.2, ease: 'power2.in' }, listedEnds)
    tl.to(button('parts'), { '--on': 0, duration: 0.5 }, listedEnds + 0.2)
    go('menu', listedEnds, { azimuth: -62, elevation: 30 })

    const [menu, menuEnds] = AT.menu
    press(button('grid'), 1, menu)
    tl.to(look, { grid: 1, duration: 2 }, menu + 0.8)
    press(button('explode'), 1, menu + 4, 3)
    tl.to(look, { apart: 1, distance: stops.menu.apart, duration: 6, ease: 'power2.inOut' }, menu + 4.8)
    tl.to(look, { azimuth: -18, elevation: 24, duration: 13, ease: 'sine.inOut' }, menu + 4.8)
    tl.to(look, { apart: 0, distance: to.menu.far, duration: 5 }, menuEnds - 5.5)
    tl.to(button('explode'), { '--on': 0, duration: 0.5 }, menuEnds - 1)
    tl.to(button('grid'), { '--on': 0, duration: 0.5 }, menuEnds - 0.5)
    tl.to(look, { grid: 0, duration: 2 }, menuEnds - 0.5)

    // ── the conversation ──────────────────────────────────────────────────
    const messages = one('[data-app="messages"]')
    const scroll = messages.parentElement!
    // it comes back as it was left a long while ago: at its beginning
    const above = Math.max(0, messages.offsetHeight - scroll.clientHeight)
    tl.set(messages, { y: above }, menuEnds + 0.4)
    press(talk, 1, menuEnds + 0.5)
    tl.to(app, { '--shut': 0, duration: 4 }, menuEnds + 1.5)
    go('chat', menuEnds, { azimuth: -40, elevation: 34 })
    caption(2, 'chat')

    const [chat, chatEnds] = AT.chat
    tl.to(messages, { y: 0, duration: 9, ease: 'none' }, chat)

    const typed = one('[data-app="typed"]')
    const chip = one('[data-app="typed-part"]')
    const written = { letters: 0 }
    const write = says(typed, () => TYPED.text.slice(0, Math.round(written.letters)))
    tuck(chip, true, chat + 9, 1)
    tl.to(chip, { opacity: 1, paddingTop: 10, duration: 1 }, chat + 9)
    tl.to(one('[data-app="placeholder"]'), { opacity: 0, duration: 0.3 }, chat + 10)
    tl.to(one('[data-app="send"]'), { '--on': 1, duration: 0.3 }, chat + 10)
    tl.to(written, { letters: TYPED.text.length, duration: 4, ease: 'none', onUpdate: write }, chat + 10)
    const sent = chat + 14.6
    tl.to(written, { letters: 0, duration: 0.05, ease: 'none', onUpdate: write }, sent)
    tl.to(one('[data-app="placeholder"]'), { opacity: 1, duration: 0.3 }, sent)
    tl.to(one('[data-app="send"]'), { '--on': 0, duration: 0.3 }, sent)
    tuck(chip, false, sent, 0.5)
    tl.to(chip, { opacity: 0, paddingTop: 0, duration: 0.3 }, sent)
    tl.to(
      one('[data-app="sent"]'),
      { height: 'auto', marginTop: 0, opacity: 1, duration: 1.2, ease: 'power2.out' },
      sent,
    )
    tl.to(
      one('[data-app="working"]'),
      { height: 20, marginTop: 0, opacity: 1, duration: 0.8 },
      sent + 1,
    )
    tl.eventCallback('onUpdate', () => {
      render()
      working(tl.time() >= sent + 1)
    })
    tl.to(look, { azimuth: -52, duration: 18, ease: 'none' }, chat)

    // ── the project's own tools ───────────────────────────────────────────
    const panel = one('[data-app="panel"]')
    press(talk, 0, chatEnds + 0.3, 2)
    tl.to(app, { '--shut': 1, duration: 3.5 }, chatEnds + 1.1)
    go('tools', chatEnds, { azimuth: -64, elevation: 22 })
    caption(3, 'tools')
    press(button('tools'), 1, chatEnds + 2.4, 2.6)
    tl.fromTo(
      panel,
      { autoAlpha: 0, x: 14 },
      { autoAlpha: 1, x: 0, duration: 1.6, ease: 'power2.out' },
      chatEnds + 3.4,
    )
    // the cables are drawn where they lie at rest: moved, the arm would leave them behind
    tl.to(look, { cables: 0, duration: 1 }, chatEnds + 4)

    const [tools, toolsEnds] = AT.tools
    const slider = one('[data-app="slider"]')
    const set = { along: 0 }
    const count = says(one('[data-app="count"]'), () => String(3 + Math.round(set.along * 7)))
    const doing = one('[data-app="doing"]')
    const routine = gsap.timeline({ defaults: { ease: 'sine.inOut' } })
    ROUTINE.forEach((pose) => routine.to(look, { ...pose, duration: 1 }))
    tl.add(routine.duration(toolsEnds + 2.5 - (tools - 2)), tools - 2)
    tl.to(
      set,
      {
        along: 1,
        duration: toolsEnds - tools - 2,
        ease: 'none',
        onUpdate() {
          slider.style.setProperty('--along', String(set.along))
          count()
          const beat = Math.min(ACTIVITIES.length - 1, Math.floor(set.along * ACTIVITIES.length))
          if (doing.textContent !== ACTIVITIES[beat]) doing.textContent = ACTIVITIES[beat]
        },
      },
      tools + 0.5,
    )
    tl.to(look, { azimuth: -30, duration: toolsEnds - tools, ease: 'none' }, tools)

    // ── the model's drawings ──────────────────────────────────────────────
    const sheets = one('[data-app="sheets"]')
    const row = one('[data-app="sheet-row"]')
    const canvas = one('[data-app="canvas"]')
    const others = [...all('[data-app="other"]'), ...later]
    tl.to(panel, { autoAlpha: 0, x: 14, duration: 1.4, ease: 'power2.in' }, toolsEnds)
    tl.to(button('tools'), { '--on': 0, duration: 0.5 }, toolsEnds + 0.6)
    // (the arm's routine ends folded, as it began: its cables are where it is again)
    tl.to(look, { cables: 1, duration: 0.8 }, toolsEnds + 2.6)
    go('sheets', toolsEnds, { azimuth: -45, elevation: 35 })
    caption(4, 'sheets')
    press(button('blueprint'), 1, toolsEnds + 1.6, 2.6)
    tuck(others, false, toolsEnds + 2.4, 2.4)
    tl.to(others, { marginBottom: -6, duration: 2.4, immediateRender: false }, toolsEnds + 2.4)
    const giveWay = [
      canvas,
      gizmo,
      one('[data-app="add"]'),
      ...others.map((card) => card.querySelector<HTMLElement>('.app__project')),
    ]
    const there = { by: 1 }
    const shown = () => {
      // all there, each is as the page has it: the view comes in when its model does
      for (const one of giveWay) if (one) one.style.opacity = there.by === 1 ? '' : String(there.by)
    }
    shown()
    tl.to(there, { by: 0, duration: 1.6, onUpdate: shown }, toolsEnds + 2.4)
    tl.to(sheets, { autoAlpha: 1, duration: 0.6 }, toolsEnds + 3)
    tl.fromTo(
      all('[data-app="sheet"]'),
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: 2, stagger: 0.5, ease: 'power3.out' },
      toolsEnds + 3,
    )
    tl.fromTo(
      one('[data-app="options"]'),
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 1.2, ease: 'power2.out' },
      toolsEnds + 4.4,
    )
    const [drawings, drawingsEnd] = AT.sheets
    const inSight = (wide - Math.max(0, to.sheets.x)) / to.sheets.s
    tl.to(
      row,
      { x: -Math.max(0, row.offsetWidth - inSight), duration: drawingsEnd - drawings - 1, ease: 'none' },
      drawings + 0.5,
    )

    // ── and the whole window again ────────────────────────────────────────
    if (band) tl.to(band, { autoAlpha: 0, y: 24, duration: 2.4, ease: 'power2.in' }, drawingsEnd - 0.4)
    tl.to(sheets, { autoAlpha: 0, duration: 1.4 }, drawingsEnd)
    tl.to(button('blueprint'), { '--on': 0, duration: 0.5 }, drawingsEnd + 0.4)
    tuck(others, true, drawingsEnd + 1, 2.4)
    tl.to(others, { marginBottom: 0, duration: 2.4 }, drawingsEnd + 1)
    tl.to(there, { by: 1, duration: 1.8, onUpdate: shown }, drawingsEnd + 1.2)
    tl.to(talk, { '--on': 1, duration: 0.5 }, drawingsEnd + 1)
    tl.to(app, { '--shut': 0, duration: 4 }, drawingsEnd + 1)
    go('outro', drawingsEnd, { azimuth: -51.1 + 360, elevation: 37 })

    // the timeline is as long as the last stop says, whatever its last tween is
    tl.set({}, {}, length)
    render()
  }

  // Built again whenever the screen is another size: every stop is worked out from it.
  let context = gsap.context(build)
  let size = `${stage.clientWidth}x${stage.clientHeight}`
  let waiting = 0
  const resized = () => {
    fit()
    window.clearTimeout(waiting)
    waiting = window.setTimeout(() => {
      const now = `${stage.clientWidth}x${stage.clientHeight}`
      if (now === size) return
      size = now
      context.revert()
      frame.style.transform = ''
      context = gsap.context(build)
    }, 160)
  }
  window.addEventListener('resize', resized)

  return {
    /**
     * The model has arrived, and is drawn: from the front to begin with, and brought
     * round to how the window has it.
     */
    arrive() {
      const { azimuth, elevation, duration, ease } = resolveTokens(tokens).arrive
      gsap.fromTo(
        yet,
        { azimuth: azimuth - REST.azimuth, elevation: elevation - REST.elevation },
        { azimuth: 0, elevation: 0, duration, ease, onUpdate: render, overwrite: true },
      )
      render()
    },
    /** The most the window is ever scaled, which is how sharp its view has to be. */
    most: () => {
      const stops = resolveTokens(tokens).stops
      return Math.max(...TOLD.map((name) => (stops[name].wide * stage.clientWidth) / WINDOW.width))
    },
    stop() {
      gsap.killTweensOf(yet)
      window.clearInterval(counting)
      atWork.removeAttribute('data-working')
      window.removeEventListener('resize', resized)
      window.clearTimeout(waiting)
      // The mark is the shell's, and on its way to where the next page has it: it
      // goes from wherever this page left it, so that is left written on it.
      const flown = mark?.style.getPropertyValue('--fly') ?? ''
      context.revert()
      frame.style.transform = ''
      if (flown) mark?.style.setProperty('--fly', flown)
    },
  }
}
