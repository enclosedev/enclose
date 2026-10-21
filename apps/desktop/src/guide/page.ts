// The page of an assembly guide: what a guide is opened as in a browser, from the app or
// from the folder it was taken away in.
//
// At the left, what the guide is to and when it was written, and under that its steps,
// one below another. One of them is the one shown, and the model beside them shows that
// step: its parts come in and go on, over the ones that are on already. A turn of the
// wheel, a key or a swipe goes on a step, or back one, and never part of the way: the
// steps come up to their place one at a time, as the pages of a blueprint are turned.
//
// A step done to something that is made up apart, before it goes on, says what that is
// beside its number: the model shows that thing alone while it is made up.
//
// It is one page for every guide. What it shows it is told, by a file loaded ahead of
// this one (see electron/guide-page.ts): the guide, and the model's parts.
import type { Looks } from "@shared/api"
import { partsIn, type Guide, type Need } from "@shared/assembly-format"
import { readModel } from "@/lib/model"
import { drawn, iconFor } from "./icons"
import { madeWith } from "./made-with"
import { stageOf, type Room, type Stage } from "./stage"
import { wheelHeard } from "./wheel"
import "./page.css"

declare global {
  interface Window {
    /** what the page is of: the guide, the model it shows, and how its parts are drawn */
    ENCLOSE_GUIDE?: { guide: Guide; model: unknown; looks: Looks }
    /** the model's files by name, in base64, where they came with the page */
    ENCLOSE_FILES?: Record<string, string>
  }
}

/**
 * How the page is laid out: with the steps beside the model, or, where it is too narrow
 * for that, with the model over them. For each, how far down the window the step shown
 * begins, as a share of the window's height; the room the model has to itself; and how
 * far down the window what is written begins to come out of nothing: so many px, or
 * that share of the window's height. (These are what page.css says, for working out
 * where a step will be.)
 */
const NARROW = "(max-width: 820px)"
const BESIDE = { shown: 0.45, column: 340, edge: 44, clear: 116 }
const OVER = { shown: 0.6, model: 0.52, top: 84, clear: 0.5 }
/**
 * How far what is written takes to come out of nothing, at the top, and how much of the
 * foot of the window it goes back into nothing over, in px.
 */
const COMES = 72
const FOOT = 88

/** How many of the parts a step puts on it names, at the most: the rest are counted. */
const NAMED = 6

/** How far a finger has to go up or down the page, in px, to go on a step or back one. */
const SWIPE = 36
/**
 * How much of the room what is written has, a step too long for that room is gone down
 * at a time, before the step after it is gone to: most of it, so that the last lines
 * read are still in sight.
 */
const AT_A_TIME = 0.7

const counted = (many: number, what: string) =>
  `${many} ${what}${many === 1 ? "" : "s"}`

/** Something of the page: a thing of this kind, called this, saying this. */
function made<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  called: string,
  ...within: (Node | string | null)[]
): HTMLElementTagNameMap[Tag] {
  const one = document.createElement(tag)
  if (called) one.className = called
  for (const thing of within) if (thing !== null) one.append(thing)
  return one
}

/** What was written, as paragraphs: a line left empty begins another. */
const written = (text: string, called: string) =>
  text
    .split(/\n\s*\n/)
    .map((words) => words.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((words) => made("p", called, words))

/** What a guide that needs nothing to hand is said to need: the page says so in every guide. */
const NOTHING: Need = { name: "Nothing but your hands", icon: "helper" }

/**
 * What is needed to hand, one thing to a line: its picture in a square of its own, and
 * beside that what it is. Every guide says, and one that needs nothing says that. (A
 * guide written before things had pictures says only what each is called.)
 */
function needed(needs: (Need | string)[]) {
  return made(
    "ul",
    "needs",
    ...(needs.length > 0 ? needs : [NOTHING]).map((need) => {
      const { name, icon } =
        typeof need === "string" ? { name: need, icon: null } : need
      return made(
        "li",
        "",
        made("span", "tile", drawn(iconFor(name, icon))),
        made("span", "", name)
      )
    })
  )
}

function page(told: NonNullable<Window["ENCLOSE_GUIDE"]>) {
  const { guide } = told
  // what the parts are called, for a step to say which it puts on
  const called = new Map<string, string>()
  try {
    for (const part of readModel(told.model).parts)
      called.set(part.id, part.label)
  } catch {
    // none of the guide's parts are in the model any more: it is still to be read
  }
  const shown = partsIn(guide)
  const when =
    guide.made === null
      ? null
      : new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(guide.made)

  const canvas = made("canvas", "stage")
  canvas.setAttribute("aria-label", `${guide.title}, in 3D`)
  const sections = [
    made(
      "section",
      "step",
      made("p", "label", "Before you start"),
      made(
        "h2",
        "",
        `${counted(guide.steps.length, "step")}, ${counted(shown.length, "part")}`
      ),
      ...(guide.summary ? written(guide.summary, "") : []),
      made("p", "label", "You will need"),
      needed(guide.needs)
    ),
    ...guide.steps.map((step, index) => {
      const names = [
        ...step.fits,
        ...step.parts.flatMap((id) => called.get(id) ?? []),
      ]
      const parts =
        names.length > NAMED + 1
          ? [...names.slice(0, NAMED), `${names.length - NAMED} more`]
          : names
      return made(
        "section",
        "step",
        made(
          "p",
          "label",
          [`Step ${index + 1}`, step.sub].filter(Boolean).join(" · ")
        ),
        made("h2", "", step.title),
        ...written(step.text, ""),
        step.tip
          ? made(
              "p",
              "tip",
              made("span", "tile", drawn("lamp")),
              made("span", "", step.tip)
            )
          : null,
        parts.length > 0 ? made("p", "parts", parts.join(" · ")) : null
      )
    }),
    made(
      "section",
      "step",
      made("p", "label", "Finished"),
      made("h2", "", guide.title),
      made("p", "", "Every part is on.")
    ),
  ]
  // The steps are in a window of their own over the model, which they go up through:
  // so that they come out of nothing under the name of the thing, and go back into it
  // at the foot.
  const list = made("div", "list", ...sections)
  const thumb = made("i", "")
  const mark = made("div", "progress", thumb)
  // What puts the view back as the page has it, once a hand has turned it, moved it or
  // brought it nearer: a round button in the corner, as the app's own are. Until then
  // there is nothing for it to do.
  const again = made("button", "again", drawn("again"))
  again.type = "button"
  again.title = "Reset view"
  again.setAttribute("aria-label", "Reset view")
  again.disabled = true
  const loading = made("p", "loading", "Loading the parts")
  document.body.append(
    canvas,
    made("div", "shade"),
    made(
      "header",
      "cover",
      made("h1", "", guide.title),
      made("p", "", "Assembly Guide"),
      made("p", "", [when, `v${guide.version}`].filter(Boolean).join(" · "))
    ),
    made("main", "steps", list),
    mark,
    again,
    loading
  )

  const narrow = window.matchMedia(NARROW)
  let stage: Stage | null = null
  /** which of the sections is the one shown, by its place among them */
  let active = 0
  /** how far down the one shown has been gone, in px, where it is too long to be all in sight */
  let down = 0
  /** and how far down it there is to go */
  let further = 0
  /** how much of it is in sight at a time */
  let sight = 0

  /** The room the model has to itself. */
  const room = (): Room =>
    narrow.matches
      ? {
          left: 0,
          top: OVER.top,
          right: 0,
          bottom: window.innerHeight * (1 - OVER.model),
        }
      : { left: BESIDE.column, top: 0, right: BESIDE.edge, bottom: 0 }

  /**
   * Put the steps where the one shown is in its place: it begins a set way down the
   * window, or higher, where it is too long to be all in sight from there, as far up as
   * what is written is seen at all. One too long even for that is gone down a
   * windowful at a time (see `go`).
   */
  const place = () => {
    const high = window.innerHeight
    const [line, clear] = narrow.matches
      ? [high * OVER.shown, high * OVER.clear + COMES]
      : [high * BESIDE.shown, BESIDE.clear + COMES]
    const section = sections[active]
    const over = Math.max(0, section.offsetHeight - (high - line - FOOT))
    const risen = Math.min(over, Math.max(0, line - clear))
    sight = high - clear - FOOT
    further = over - risen
    down = Math.min(down, further)
    list.style.transform = `translateY(${sections[0].offsetTop - section.offsetTop - risen - down}px)`
    const track = mark.clientHeight - thumb.clientHeight
    thumb.style.transform = `translateY(${(active / (sections.length - 1)) * track}px)`
  }

  /** Go to one of the sections: the step shown is that one, and the model shows it. */
  const goTo = (index: number) => {
    const next = Math.min(sections.length - 1, Math.max(0, index))
    if (next === active) return
    sections[active].classList.remove("shown")
    active = next
    down = 0
    sections[active].classList.add("shown")
    place()
    // (the first of them is the thing whole, which is before the first step)
    stage?.go(active - 1)
  }

  /**
   * Go on, or back: to the step after the one shown, or the one before. But first down
   * the rest of the one shown, where that is too long to be all in sight, or back up it.
   */
  const go = (on: boolean) => {
    const to = on
      ? Math.min(further, down + sight * AT_A_TIME)
      : Math.max(0, down - sight * AT_A_TIME)
    if (Math.abs(to - down) < 1) return goTo(active + (on ? 1 : -1))
    down = to
    place()
  }

  sections.forEach((section, index) =>
    section.addEventListener("click", () => goTo(index))
  )
  again.addEventListener("click", () => stage?.again())
  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const on =
      ["ArrowDown", "ArrowRight", "PageDown", "j"].includes(event.key) ||
      (event.key === " " && !event.shiftKey)
    const back =
      ["ArrowUp", "ArrowLeft", "PageUp", "k"].includes(event.key) ||
      (event.key === " " && event.shiftKey)
    if (!on && !back) return
    event.preventDefault()
    go(on)
  })
  // A turn of the wheel goes one step, however far it is turned (see wheel.ts). With
  // the key held that a pinch comes with it is the model's, to be brought nearer by.
  const heard = wheelHeard()
  window.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const asked = heard(event)
      if (asked) go(asked === "on")
    },
    { passive: false }
  )
  // And so does a finger drawn up the page, or down it: once for each time it is put
  // down. (Drawn across, it is turning the model.)
  let finger: { x: number; y: number } | null = null
  window.addEventListener(
    "touchstart",
    (event) => {
      const [touch] = event.touches
      finger =
        event.touches.length === 1
          ? { x: touch.clientX, y: touch.clientY }
          : null
    },
    { passive: true }
  )
  window.addEventListener(
    "touchmove",
    (event) => {
      if (!finger) return
      const [touch] = event.touches
      const [across, drawn] = [
        touch.clientX - finger.x,
        touch.clientY - finger.y,
      ]
      if (Math.abs(drawn) < SWIPE || Math.abs(drawn) < Math.abs(across)) return
      finger = null
      go(drawn < 0)
    },
    { passive: true }
  )
  window.addEventListener("touchend", () => (finger = null), { passive: true })

  window.addEventListener("resize", () => {
    stage?.give(room())
    place()
  })
  // (what is written takes another size once its typeface is here)
  new ResizeObserver(place).observe(list)
  sections[active].classList.add("shown")
  place()
  // from here on the steps go to their place, and are not put there
  requestAnimationFrame(() => document.body.classList.add("laid"))

  void stageOf(
    canvas,
    told,
    (done, total) => {
      loading.textContent =
        total > 0 ? `Loading ${done} of ${counted(total, "part")}` : ""
    },
    (byHand) => (again.disabled = !byHand)
  ).then(
    (ready) => {
      stage = ready
      stage.give(room())
      stage.go(active - 1, true)
      loading.remove()
      canvas.classList.add("ready")
    },
    (error: unknown) => {
      loading.textContent = "The model could not be shown here."
      console.error(error)
    }
  )
}

madeWith()
const told = window.ENCLOSE_GUIDE
if (told) page(told)
else
  document.body.append(
    made("p", "loading", "There is no guide here: guide.js is missing.")
  )
