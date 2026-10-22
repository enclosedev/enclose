// The inspiration board: the pictures the user gathers of what the thing they are making
// should be like, for the agent to design by (see shared/inspiration-format.ts). It has
// the view's place, as a board does in PCB mode, on a ground of the user's bubbles' grey.
//
// The board goes on as far as it is wanted in every way. Fingers across a trackpad move
// over it, as does a drag with a mouse's right or middle button, and a pinch or a mouse
// wheel zooms, on the place under the pointer; a double click on the ground shows all of
// it. Pictures are dropped on it, or pasted, or a link to one is (or to a page, which
// gives the picture it is shared with), and lie where they were put, each where it
// covers no other, a little apart. Each is kept as a PNG or a JPEG. A drag moves one,
// or all that are picked out; a box drawn across the ground picks out what it takes in,
// as a box does in the view of the model, and Shift with a click adds a picture or
// takes it back out.
//
// A click on a picture goes up to it: the camera brings it to the middle and close, and
// what is round it is pushed aside to give it room. A click on it then pins a note to
// the place clicked, a dot, with what the user says of that place. Cmd+G puts what is
// picked out in a group, which they say the title of: its pictures lie in one pile, under
// the title, and a click on the pile spreads them out, pushing the rest aside. Pictures
// dragged over a group open its pile up, and let go there they go into it. Delete
// takes what is picked out off the board, once it is asked whether to; Cmd+Delete takes
// it off without asking. O organizes the board, everything in tidy rows. E spreads every
// group out at once, all the rest moved apart to give them room, and shows all of it; E
// again puts them back in their piles. Esc steps back out of each of the rest, the last
// first, and then out of the board.
import * as React from "react"
import { cn } from "cn"
import { LayoutGridIcon } from "lucide-react"

import {
  pastedLink,
  type InspirationBoard,
  type InspirationNote,
} from "@shared/inspiration-format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { organizedBoard, takenOn, useInspiration } from "@/lib/inspiration"
import { spokenFor } from "@/lib/keys"
import { isPicture } from "@/lib/pictures"
import { MAC } from "@/lib/platform"
import { usePreferences } from "@/lib/preferences"
import { scrollSource } from "@/lib/scroll"
import { useStore } from "@/lib/store"
import { ago, useNow } from "@/lib/time"
import { flatZoom, PINCH } from "@/components/viewport/rig"
import { BoardSearch, useBoardFinding } from "./board-search"
import { Card, type Key, type Shown, type Writing } from "./card"
import {
  allSpread,
  boundsOf,
  boxOf,
  fitting,
  heightOf,
  onBoard,
  pileOf,
  picturesOf,
  PILE_WIDTH,
  pushedAside,
  spreadOf,
  takenIn,
  zoomedOn,
  type Box,
  type Camera,
  type Edges,
} from "./layout"
import { NameGroup, type Naming } from "./name-group"

/**
 * How much of the view is kept clear, for what floats over the board: what it is called
 * at the top, the buttons down the right, what is said at the foot.
 */
const EDGES: Edges = { top: 64, right: 72, bottom: 88, left: 24 }
/** How much of what is left a picture gone up to fills, and a group spread out at most. */
const FOCUS_FILL = 0.88
const SPREAD_FILL = 0.92
/** How far a press has to go, in pixels, before it is a drag and no longer a click. */
const DRAG_FROM = 4
/** How long the camera takes to go somewhere by itself, ms. */
const GLIDE_MS = 520
/** How far apart what is pushed aside is kept from what it makes room for, in units. */
const ROOM = 48
/**
 * How much further a pile fans out while pictures are held over it, to go in: and how
 * much bigger its pictures are then.
 */
const OPEN_FAN = 4.5
const OPEN_GROW = 1.06

const NONE: string[] = []

/** How each project's board was last looked at, for it to be looked at so again. */
const cameras = new Map<string, Camera>()

/** Whoever has asked for less to move has things put where they go at once. */
const still = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

const counted = (many: number, what: string) =>
  `${many} ${what}${many === 1 ? "" : "s"}`

/** The press of the pointer under way, from where it began. */
type Press = {
  pointer: number
  from: [number, number]
  /** what was pressed, or null for the ground; and the picture itself, where it was one */
  key: Key | null
  image: string | null
  /** where on that picture, as a share of its width and its height */
  share: [number, number] | null
  shift: boolean
  /** it moves the board, being made with a mouse's other buttons */
  pan: boolean
  moved: boolean
  /** what it drags, once it is a drag, and what was picked out before a box was begun */
  dragging: Key[] | null
  before: Key[]
}

/** The ground of the board while it is read, and the board once it is. */
export function InspirationMode({ projectId }: { projectId: string }) {
  const board = useInspiration((state) => state.boards[projectId])
  React.useEffect(() => {
    void useInspiration.getState().load(projectId)
  }, [projectId])
  return (
    <div className="absolute inset-0 animate-in overflow-hidden bg-user-message duration-300 fade-in motion-reduce:animate-none">
      {board && <Board projectId={projectId} board={board} />}
    </div>
  )
}

/** Keys as a set, from what is picked out: so that each is looked up once. */
const setOf = (keys: Key[]) => new Set<string>(keys)

function Board({
  projectId,
  board,
}: {
  projectId: string
  board: InspirationBoard
}) {
  const stage = React.useRef<HTMLDivElement>(null)
  const world = React.useRef<HTMLDivElement>(null)
  const chooser = React.useRef<HTMLInputElement>(null)
  const view = React.useRef({ width: 0, height: 0 })
  const camera = React.useRef<Camera | null>(cameras.get(projectId) ?? null)
  /** where the camera goes back to, as what it went to is let go of: the latest last */
  const back = React.useRef<Camera[]>([])
  const gliding = React.useRef(0)

  const analysing = useInspiration((s) => s.analysing[projectId] ?? NONE)
  const notesShown = useInspiration((s) => s.notesShown)
  const goneUpTo = useInspiration((s) => s.focused)
  const focused =
    goneUpTo !== null && board.images.some((image) => image.id === goneUpTo)
      ? goneUpTo
      : null
  const setFocused = useInspiration((s) => s.setFocused)
  const change = useInspiration((s) => s.change)
  const finding = useStore((s) => s.finding)
  const say = useStore((s) => s.say)

  const [selected, setSelected] = React.useState<Key[]>([])
  const [spreadOne, setSpread] = React.useState<string | null>(null)
  const spread =
    spreadOne !== null && board.groups.some((group) => group.id === spreadOne)
      ? spreadOne
      : null
  const expanded = useInspiration((s) => s.expanded)
  /** where each picture lies with every group spread out: null while they are not */
  const laidOut = React.useMemo(
    () => (expanded ? allSpread(board.images, board.groups) : null),
    [expanded, board]
  )
  const [writing, setWriting] = React.useState<Writing | null>(null)
  const [moving, setMoving] = React.useState<{
    keys: Key[]
    by: [number, number]
  } | null>(null)
  /** the box being drawn across the board, in the view's pixels, and which way */
  const [box, setBox] = React.useState<{
    left: number
    top: number
    width: number
    height: number
    leftwards: boolean
  } | null>(null)
  const [naming, setNaming] = React.useState<Naming | null>(null)
  /** the group that pictures being dragged are held over, to go into it on release */
  const [over, setOver] = React.useState<string | null>(null)

  useBoardFinding()

  React.useEffect(() => () => useInspiration.getState().setFocused(null), [])

  // --- where everything is shown --------------------------------------------------

  const shown = React.useMemo(() => {
    const out: Shown[] = []
    for (const group of board.groups) {
      const pictures = picturesOf(board.images, group)
      if (laidOut || group.id === spread) {
        const boxes = laidOut
          ? pictures.map((image) => laidOut.get(image.id) ?? boxOf(image))
          : spreadOf(pictures, group.at)
        boxes.forEach((box, index) =>
          out.push({
            image: pictures[index],
            key: `i:${pictures[index].id}`,
            box,
            turn: 0,
            z: 2,
            pile: null,
            top: true,
          })
        )
        continue
      }
      const fan = group.id === over ? OPEN_FAN : 1
      const width = group.id === over ? PILE_WIDTH * OPEN_GROW : PILE_WIDTH
      // all as wide as each other in the pile, the tallest lie at the back and the
      // shortest on top, for each to show over the one behind it
      const stacked = [...pictures].sort(
        (a, b) => heightOf(a.pixels, 1) - heightOf(b.pixels, 1)
      )
      pileOf(stacked.length).forEach((laid, index) => {
        const image = stacked[index]
        out.push({
          image,
          key: `g:${group.id}`,
          box: {
            x: group.at[0] + laid.dx * fan,
            y: group.at[1] + laid.dy * fan,
            w: width,
            h: heightOf(image.pixels, width),
          },
          turn: laid.turn * fan,
          z: 1 + (pictures.length - index) / (pictures.length + 1),
          pile: group.id,
          top: index === 0,
        })
      })
    }
    for (const image of board.images)
      if (image.group === null)
        out.push({
          image,
          key: `i:${image.id}`,
          box: laidOut?.get(image.id) ?? boxOf(image),
          turn: 0,
          z: 1,
          pile: null,
          top: true,
        })

    // what is being dragged goes with the pointer: a picture of a group spread out takes
    // the whole of its group along
    if (moving) {
      const keys = setOf(moving.keys)
      for (const one of out)
        if (
          keys.has(one.key) ||
          (one.image.group !== null && keys.has(`g:${one.image.group}`))
        )
          one.box = {
            ...one.box,
            x: one.box.x + moving.by[0],
            y: one.box.y + moving.by[1],
          }
    }

    // and what is in the way of a picture gone up to, or of a group spread out, is
    // pushed aside: each picture by itself, and each pile as one
    const near = focused
      ? out.find((one) => one.image.id === focused && one.pile === null)
      : undefined
    const opened = spread
      ? boundsOf(
          out.filter((one) => one.image.group === spread).map((one) => one.box)
        )
      : null
    const clear = near?.box ?? opened
    if (clear) {
      const units = new Map<string, Box[]>()
      for (const one of out) {
        if (near ? one === near : one.image.group === spread) continue
        const unit = one.pile ? `g:${one.pile}` : one.key
        units.set(unit, [...(units.get(unit) ?? []), one.box])
      }
      const margin = near ? ROOM + 0.08 * Math.max(clear.w, clear.h) : ROOM
      const pushed = pushedAside(
        [...units].map(([id, boxes]) => ({ id, box: boundsOf(boxes)! })),
        clear,
        margin
      )
      for (const one of out) {
        const by = pushed.get(one.pile ? `g:${one.pile}` : one.key)
        if (by)
          one.box = { ...one.box, x: one.box.x + by[0], y: one.box.y + by[1] }
      }
    }
    if (near) near.z = 5
    if (moving) {
      const keys = setOf(moving.keys)
      for (const one of out)
        if (keys.has(one.key) || keys.has(`g:${one.image.group}`)) one.z += 3
    }
    return out
  }, [board, laidOut, spread, focused, moving, over])

  /** What can be picked out, each as the box it takes: a picture, or a pile. */
  const units = React.useMemo(() => {
    const boxes = new Map<Key, Box[]>()
    for (const one of shown)
      boxes.set(one.key, [...(boxes.get(one.key) ?? []), one.box])
    return [...boxes].map(([id, all]) => ({
      id: id as Key,
      box: boundsOf(all)!,
    }))
  }, [shown])

  // --- the camera -------------------------------------------------------------------

  const show = React.useCallback(() => {
    const on = world.current
    const at = camera.current
    if (!on || !at) return
    const { width, height } = view.current
    on.style.transform = `translate(${width / 2 - at.x * at.zoom}px, ${height / 2 - at.y * at.zoom}px) scale(${at.zoom})`
    on.style.setProperty("--zoom", String(at.zoom))
  }, [])
  const put = React.useCallback(
    (to: Camera) => {
      cancelAnimationFrame(gliding.current)
      camera.current = to
      cameras.set(projectId, to)
      show()
    },
    [projectId, show]
  )
  /** Take the camera somewhere by itself, easing in to where it goes. */
  const glide = React.useCallback(
    (to: Camera) => {
      const from = camera.current
      if (!from || still()) return put(to)
      cancelAnimationFrame(gliding.current)
      const began = performance.now()
      const step = () => {
        const t = Math.min(1, (performance.now() - began) / GLIDE_MS)
        const eased = 1 - (1 - t) ** 3
        // zoomed in steps that look alike, near or far
        const zoom = from.zoom * (to.zoom / from.zoom) ** eased
        camera.current = {
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased,
          zoom,
        }
        cameras.set(projectId, camera.current)
        show()
        if (t < 1) gliding.current = requestAnimationFrame(step)
      }
      gliding.current = requestAnimationFrame(step)
    },
    [projectId, put, show]
  )
  React.useEffect(() => () => cancelAnimationFrame(gliding.current), [])

  /** The camera that shows all of the board, or the middle of it where it is empty. */
  const whole = React.useCallback((): Camera => {
    const all = boundsOf(units.map((unit) => unit.box))
    return all
      ? fitting(all, view.current, EDGES, 0.9, 1)
      : { x: 0, y: 0, zoom: 1 }
  }, [units])
  const wholeNow = React.useRef(whole)
  React.useLayoutEffect(() => {
    wholeNow.current = whole
  }, [whole])

  React.useLayoutEffect(() => {
    const on = stage.current
    if (!on) return
    const sized = () => {
      const { width, height } = on.getBoundingClientRect()
      view.current = { width, height }
      if (!camera.current && width > 0) put(wholeNow.current())
      else show()
    }
    sized()
    const observer = new ResizeObserver(sized)
    observer.observe(on)
    return () => observer.disconnect()
  }, [put, show])

  /** Where on the board a place in the window is, by its pixels. */
  const boardAt = React.useCallback(
    (x: number, y: number): [number, number] => {
      const at = camera.current ?? { x: 0, y: 0, zoom: 1 }
      const box = stage.current?.getBoundingClientRect()
      return onBoard(
        at,
        view.current,
        x - (box?.left ?? 0),
        y - (box?.top ?? 0)
      )
    },
    []
  )

  // fingers move over the board; a pinch, or a wheel, zooms on the place under the
  // pointer: as the drawings of a board do in PCB mode
  React.useEffect(() => {
    const on = stage.current
    if (!on) return
    const source = scrollSource()
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const at = camera.current
      if (!at) return
      const { scrolling, wheelReversed, zoomSpeed } = usePreferences.getState()
      const from =
        scrolling === "auto"
          ? source(event, performance.now())
          : scrolling === "trackpad"
            ? "fingers"
            : "wheel"
      if (!event.ctrlKey && from === "fingers")
        return put({
          ...at,
          x: at.x + event.deltaX / at.zoom,
          y: at.y + event.deltaY / at.zoom,
        })
      // (as hard as the model's flat views zoom, and the same way: the board's zoom is
      // how close it is, as theirs is, where a PCB drawing's scale is how far)
      const lines = event.deltaMode === 1 ? 10 : 1
      const way = !event.ctrlKey && wheelReversed ? -1 : 1
      const box = on.getBoundingClientRect()
      put(
        zoomedOn(
          at,
          view.current,
          flatZoom(
            event.deltaY * lines * (event.ctrlKey ? PINCH : 1) * way,
            zoomSpeed
          ),
          event.clientX - box.left,
          event.clientY - box.top
        )
      )
    }
    on.addEventListener("wheel", wheel, { passive: false })
    return () => on.removeEventListener("wheel", wheel)
  }, [put])

  // --- going up to a picture, spreading a group out -----------------------------------

  /** The camera that has a box close, in the middle of what is left of the view. */
  const closeTo = (box: Box, fill: number, nearest: number) =>
    fitting(box, view.current, EDGES, fill, nearest)

  /** Where a picture lies when nothing pushes it aside: by itself, or in its group spread out. */
  const homeOf = (id: string): Box | null => {
    const image = board.images.find((one) => one.id === id)
    if (!image) return null
    if (laidOut) return laidOut.get(id) ?? null
    if (image.group === null) return boxOf(image)
    const group = board.groups.find((one) => one.id === image.group)
    if (!group || group.id !== spread) return null
    const pictures = picturesOf(board.images, group)
    return spreadOf(pictures, group.at)[pictures.indexOf(image)] ?? null
  }

  const focusOn = (id: string) => {
    const home = homeOf(id)
    if (!home || !camera.current) return
    if (focused === null) back.current.push(camera.current)
    setFocused(id)
    setSelected([`i:${id}`])
    setWriting(null)
    glide(closeTo(home, FOCUS_FILL, 4))
  }
  const unfocus = () => {
    setFocused(null)
    setWriting(null)
    const to = back.current.pop()
    if (to) glide(to)
  }
  const spreadOut = (groupId: string, on = board) => {
    const group = on.groups.find((one) => one.id === groupId)
    const at = camera.current
    // (with every group spread out, it is already)
    if (!group || !at || laidOut) return
    // (another spread out is put back first: the camera goes back to before it)
    if (spread === null) back.current.push(at)
    setSpread(groupId)
    setFocused(null)
    setWriting(null)
    setSelected([])
    const all = boundsOf(spreadOf(picturesOf(on.images, group), group.at))
    // brought into view where it does not fit as the board is seen
    if (all) glide(closeTo(all, SPREAD_FILL, Math.max(at.zoom, 0.6)))
  }
  /**
   * Spread every group out at once, or put them all back in their piles: and show all of
   * the board as it lies then.
   */
  const expandAll = (on: boolean) => {
    if (on && board.groups.length === 0)
      return say("There are no groups on the board to expand yet")
    back.current = []
    setWriting(null)
    setFocused(null)
    setSpread(null)
    useInspiration.setState({ expanded: on })
    const all = boundsOf(
      on ? [...allSpread(board.images, board.groups).values()] : takenOn(board)
    )
    if (all) glide(fitting(all, view.current, EDGES, 0.9, 1))
  }
  const putBack = () => {
    const wasFocused = focused !== null
    setSpread(null)
    setFocused(null)
    setWriting(null)
    // (what was picked out of it is in the pile now, and picked out no longer)
    setSelected([])
    if (wasFocused) back.current.pop()
    const to = back.current.pop()
    if (to) glide(to)
  }

  // --- changing the board -------------------------------------------------------------

  const changed = (next: InspirationBoard) => change(projectId, next)

  /** The pictures these stand for: each by itself, and a group's all. */
  const picturesIn = (keys: Key[]): string[] => {
    const wanted = setOf(keys)
    return board.images
      .filter(
        (image) =>
          wanted.has(`i:${image.id}`) ||
          (image.group !== null && wanted.has(`g:${image.group}`))
      )
      .map((image) => image.id)
  }

  /** The board without groups that have fewer than two pictures: a lone one lies where its pile did. */
  const tidied = (next: InspirationBoard): InspirationBoard => {
    const count = new Map<string, number>()
    for (const image of next.images)
      if (image.group) count.set(image.group, (count.get(image.group) ?? 0) + 1)
    const gone = new Map(
      next.groups
        .filter((group) => (count.get(group.id) ?? 0) < 2)
        .map((group) => [group.id, group])
    )
    if (gone.size === 0) return next
    return {
      ...next,
      groups: next.groups.filter((group) => !gone.has(group.id)),
      images: next.images.map((image) => {
        const group = image.group && gone.get(image.group)
        return group
          ? { ...image, group: null, at: group.at, width: PILE_WIDTH }
          : image
      }),
    }
  }

  const moveBy = (keys: Key[], by: [number, number]) => {
    const wanted = setOf(keys)
    const shift = ([x, y]: [number, number]): [number, number] => [
      Math.round(x + by[0]),
      Math.round(y + by[1]),
    ]
    changed({
      ...board,
      images: board.images.map((image) =>
        image.group === null && wanted.has(`i:${image.id}`)
          ? { ...image, at: shift(image.at) }
          : image
      ),
      groups: board.groups.map((group) =>
        wanted.has(`g:${group.id}`) ? { ...group, at: shift(group.at) } : group
      ),
    })
  }

  /**
   * The group a place on the board is over, for pictures being dragged there to go into
   * it: its pile, or its pictures spread out. Only pictures that lie by themselves go
   * into one, and none while a group is among them.
   */
  const groupAt = (dragging: Key[], at: [number, number]): string | null => {
    if (!dragging.every((key) => key.startsWith("i:"))) return null
    for (const group of board.groups) {
      const all = boundsOf(
        shown
          .filter((one) => one.image.group === group.id)
          .map((one) => one.box)
      )
      if (
        all &&
        Math.abs(at[0] - all.x) <= all.w / 2 &&
        Math.abs(at[1] - all.y) <= all.h / 2
      )
        return group.id
    }
    return null
  }

  /** Put pictures that lie by themselves in a group, first among its pictures, and open it. */
  const putInGroup = (keys: Key[], groupId: string) => {
    const wanted = setOf(keys)
    const going = board.images.filter(
      (image) => image.group === null && wanted.has(`i:${image.id}`)
    )
    if (going.length === 0) return
    const rest = board.images.filter((image) => !going.includes(image))
    const first = rest.findIndex((image) => image.group === groupId)
    const at = first < 0 ? rest.length : first
    const next = {
      ...board,
      images: [
        ...rest.slice(0, at),
        ...going.map((image) => ({ ...image, group: groupId })),
        ...rest.slice(at),
      ],
    }
    changed(next)
    spreadOut(groupId, next)
  }

  const groupPicked = () => {
    const keys =
      selected.length > 0 ? selected : focused ? [`i:${focused}` as Key] : []
    const images = picturesIn(keys)
    if (images.length < 2)
      return say("Pick out two or more images to group first")
    const first = keys.find((key) => key.startsWith("g:"))
    const title =
      board.groups.find((group) => `g:${group.id}` === first)?.title ?? ""
    setNaming({ kind: "new", images, title })
  }

  const named = (title: string) => {
    if (!naming) return
    setNaming(null)
    if (naming.kind === "rename") {
      changed({
        ...board,
        groups: board.groups.map((group) =>
          group.id === naming.group ? { ...group, title } : group
        ),
      })
      return
    }
    const id = `g-${Date.now().toString(36)}`
    const wanted = new Set(naming.images)
    const all = boundsOf(
      shown.filter((one) => wanted.has(one.image.id)).map((one) => one.box)
    )
    const at: [number, number] = all
      ? [Math.round(all.x), Math.round(all.y)]
      : [0, 0]
    changed(
      tidied({
        ...board,
        images: board.images.map((image) =>
          wanted.has(image.id) ? { ...image, group: id } : image
        ),
        groups: [...board.groups, { id, title, at }],
      })
    )
    if (
      spread !== null &&
      board.images.some((one) => wanted.has(one.id) && one.group === spread)
    )
      setSpread(null)
    setFocused(null)
    setSelected([`g:${id}`])
  }

  /**
   * Take what is picked out out of its groups: each group, all of it, its pictures left
   * lying as they lay spread out, and what was in the way of them pushed aside for good.
   */
  const ungroupPicked = () => {
    const ids = new Set<string>()
    for (const key of selected) {
      if (key.startsWith("g:")) ids.add(key.slice(2))
      const image = board.images.find((one) => `i:${one.id}` === key)
      if (image?.group) ids.add(image.group)
    }
    if (ids.size === 0 && spread) ids.add(spread)
    if (ids.size === 0) return say("Pick out a group to ungroup first")
    let images = board.images
    let groups = board.groups
    const freed: string[] = []
    for (const id of ids) {
      const group = groups.find((one) => one.id === id)
      if (!group) continue
      const pictures = picturesOf(images, group)
      const boxes = laidOut
        ? pictures.map((image) => laidOut.get(image.id) ?? boxOf(image))
        : spreadOf(pictures, group.at)
      const laid = new Map(
        pictures.map((image, index) => [image.id, boxes[index]])
      )
      freed.push(...pictures.map((image) => image.id))
      const clear = boundsOf(boxes)!
      const others = [
        ...images
          .filter((image) => image.group === null)
          .map((image) => ({ id: `i:${image.id}`, box: boxOf(image) })),
        ...groups
          .filter((one) => one.id !== id)
          .map((one) => ({
            id: `g:${one.id}`,
            box: boundsOf(
              units
                .filter((unit) => unit.id === `g:${one.id}`)
                .map((unit) => unit.box)
            ) ?? { x: one.at[0], y: one.at[1], w: PILE_WIDTH, h: PILE_WIDTH },
          })),
      ]
      const pushed = pushedAside(others, clear, ROOM)
      const by = (key: string, [x, y]: [number, number]): [number, number] => {
        const moved = pushed.get(key)
        return moved
          ? [Math.round(x + moved[0]), Math.round(y + moved[1])]
          : [x, y]
      }
      images = images.map((image) => {
        const box = laid.get(image.id)
        if (box)
          return {
            ...image,
            group: null,
            at: [Math.round(box.x), Math.round(box.y)],
            width: Math.round(box.w),
          }
        return image.group === null
          ? { ...image, at: by(`i:${image.id}`, image.at) }
          : image
      })
      groups = groups
        .filter((one) => one.id !== id)
        .map((one) => ({ ...one, at: by(`g:${one.id}`, one.at) }))
    }
    changed({ ...board, images, groups })
    if (spread && ids.has(spread)) {
      setSpread(null)
      back.current.pop()
    }
    setSelected(freed.map((id) => `i:${id}` as Key))
  }

  /**
   * Lay everything on the board out in tidy rows (see `organizedBoard`), shaped for the
   * view, and show all of it: out of whatever was gone up to or spread out first, but
   * with every group still spread out where they all are.
   */
  const organize = () => {
    if (board.images.length === 0)
      return say("There is nothing on the board to organize yet")
    const { width, height } = view.current
    const across = width - EDGES.left - EDGES.right
    const down = height - EDGES.top - EDGES.bottom
    const next = organizedBoard(
      board,
      across > 0 && down > 0 ? across / down : 1.5,
      expanded
    )
    back.current = []
    setWriting(null)
    setFocused(null)
    setSpread(null)
    changed(next)
    const all = boundsOf(
      expanded
        ? [...allSpread(next.images, next.groups).values()]
        : takenOn(next)
    )
    if (all) glide(fitting(all, view.current, EDGES, 0.9, 1))
  }

  /** Take what is picked out off the board: once the user says to, unless `ask` is false. */
  const removePicked = async (ask: boolean) => {
    const keys =
      selected.length > 0 ? selected : focused ? [`i:${focused}` as Key] : []
    const images = picturesIn(keys)
    if (images.length === 0) return
    const groups = board.groups
      .filter((group) => keys.includes(`g:${group.id}`))
      .map((group) => group.title)
    if (
      ask &&
      !(await window.cad.inspiration.confirmRemove(projectId, {
        images: images.length,
        groups,
      }))
    )
      return
    // as the board is by then, which may have changed while it was asked
    const now = useInspiration.getState().boards[projectId] ?? board
    const gone = new Set(images)
    change(
      projectId,
      tidied({
        ...now,
        images: now.images.filter((image) => !gone.has(image.id)),
      })
    )
    setSelected([])
    setWriting(null)
    if (focused && gone.has(focused)) unfocus()
  }

  const writeNote = (writing: Writing) => {
    setWriting(null)
    const said = writing.text.trim()
    changed({
      ...board,
      images: board.images.map((image) => {
        if (image.id !== writing.image) return image
        const had = image.notes.find((note) => note.id === writing.note)
        if (!said)
          return had
            ? { ...image, notes: image.notes.filter((note) => note !== had) }
            : image
        if (had)
          return {
            ...image,
            notes: image.notes.map((note) =>
              note === had ? { ...note, text: said } : note
            ),
          }
        const note: InspirationNote = {
          id: `n-${Date.now().toString(36)}`,
          at: writing.at,
          text: said,
          added: Date.now(),
        }
        return { ...image, notes: [...image.notes, note] }
      }),
    })
  }

  const dropNote = (image: string, note: string) => {
    setWriting(null)
    changed({
      ...board,
      images: board.images.map((one) =>
        one.id === image
          ? { ...one, notes: one.notes.filter((each) => each.id !== note) }
          : one
      ),
    })
  }

  // --- pictures coming on to the board -----------------------------------------------

  const addFiles = React.useCallback(
    (files: File[], x?: number, y?: number) => {
      const pictures = files.filter(isPicture)
      if (pictures.length === 0) return
      const at =
        x !== undefined && y !== undefined
          ? boardAt(x, y)
          : camera.current
            ? onBoard(
                camera.current,
                view.current,
                view.current.width / 2,
                view.current.height / 2
              )
            : ([0, 0] as [number, number])
      void useInspiration
        .getState()
        .add(projectId, pictures, at)
        .then((added) => {
          if (added < pictures.length)
            useStore
              .getState()
              .say(
                added === 0
                  ? "Those images could not be put on the board"
                  : `${counted(pictures.length - added, "image")} could not be put on the board`
              )
        })
    },
    [projectId, boardAt]
  )
  // what is dropped on the window comes here, while the board is on screen
  React.useEffect(() => {
    useInspiration.setState({ dropping: addFiles })
    return () => useInspiration.setState({ dropping: null })
  }, [addFiles])
  // and so does a picture pasted, other than into something being written: or the one
  // at a link pasted, or that the page at it puts forward for itself
  React.useEffect(() => {
    const pasted = (event: ClipboardEvent) => {
      if (spokenFor(event.target)) return
      const files = [...(event.clipboardData?.files ?? [])].filter(isPicture)
      if (files.length > 0) {
        event.preventDefault()
        addFiles(files)
        return
      }
      const link = pastedLink(event.clipboardData?.getData("text/plain") ?? "")
      if (!link) return
      event.preventDefault()
      void window.cad.inspiration.fetch(link).then((linked) => {
        if (linked)
          addFiles([
            new File([linked.data], linked.name, { type: linked.mimeType }),
          ])
        else useStore.getState().say("No image could be found at that link")
      })
    }
    window.addEventListener("paste", pasted)
    return () => window.removeEventListener("paste", pasted)
  }, [addFiles])

  // --- what is looked for -------------------------------------------------------------

  /** The pictures that go by what is looked for: null while nothing is. */
  const found = React.useMemo(() => {
    const words = (finding ?? "").toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return null
    const titles = new Map(board.groups.map((group) => [group.id, group.title]))
    return new Set(
      board.images
        .filter((image) => {
          const said = [
            image.name,
            image.group ? titles.get(image.group) : "",
            ...image.notes.map((note) => note.text),
            image.overview ?? "",
          ]
            .join(" ")
            .toLowerCase()
          return words.every((word) => said.includes(word))
        })
        .map((image) => image.id)
    )
  }, [finding, board])
  const showFound = () => {
    if (!found || found.size === 0) return
    if (found.size === 1) {
      const [only] = found
      const one = board.images.find((image) => image.id === only)
      if (one?.group && !laidOut && one.group !== spread)
        return spreadOut(one.group)
      useStore.getState().find(null)
      return focusOn(only)
    }
    const all = boundsOf(
      shown.filter((one) => found.has(one.image.id)).map((one) => one.box)
    )
    if (all) glide(closeTo(all, 0.9, 1))
    useStore.getState().find(null)
  }

  // --- the keys -----------------------------------------------------------------------

  // (the handlers as this drawing has them, for the keys and the pointer to go by)
  const latest = {
    selected,
    focused,
    spread,
    writing,
    units,
    focusOn,
    unfocus,
    spreadOut,
    putBack,
    groupPicked,
    ungroupPicked,
    removePicked,
    moveBy,
    whole,
    organize,
    expandAll,
  }
  const now = React.useRef(latest)
  React.useLayoutEffect(() => {
    now.current = latest
  })

  // Heard before the view's own keys, which wait while the board is on screen: Esc
  // steps back out of what the board has open, the last first, before it is the view's
  // to leave the board with.
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const state = useStore.getState()
      if (state.settingsOpen || event.altKey || spokenFor(event.target)) return
      const it = now.current
      const held = MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey
      const taken = () => {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === "Escape") {
        if (event.defaultPrevented || state.finding !== null) return
        if (it.writing) setWriting(null)
        else if (it.focused) it.unfocus()
        else if (it.spread) it.putBack()
        else if (it.selected.length > 0) setSelected([])
        else return
        taken()
        return
      }
      if (held && event.key.toLowerCase() === "g") {
        taken()
        if (event.repeat) return
        if (event.shiftKey) it.ungroupPicked()
        else it.groupPicked()
        return
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        taken()
        if (!event.repeat) void it.removePicked(!held)
        return
      }
      if (held && !event.shiftKey && event.key.toLowerCase() === "a") {
        taken()
        setSelected(it.units.map((unit) => unit.id))
        return
      }
      if (held && event.code === "Digit1") {
        taken()
        back.current = []
        setFocused(null)
        setSpread(null)
        glide(it.whole())
        return
      }
      if (!held && !event.shiftKey && event.key.toLowerCase() === "n") {
        taken()
        if (event.repeat) return
        const { notesShown, setNotesShown } = useInspiration.getState()
        setNotesShown(!notesShown)
        return
      }
      if (!held && !event.shiftKey && event.key.toLowerCase() === "o") {
        taken()
        if (!event.repeat) it.organize()
        return
      }
      if (!held && !event.shiftKey && event.key.toLowerCase() === "e") {
        taken()
        if (!event.repeat) it.expandAll(!useInspiration.getState().expanded)
      }
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [glide, setFocused])
  // and so are the buttons that do them, beside the board
  React.useEffect(() => {
    useInspiration.setState({
      organizing: () => now.current.organize(),
      expanding: (on) => now.current.expandAll(on),
    })
    return () => useInspiration.setState({ organizing: null, expanding: null })
  }, [])

  // --- the pointer --------------------------------------------------------------------

  const press = React.useRef<Press | null>(null)
  const frame = React.useRef(0)

  const down = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (writing) {
      writeNote(writing)
      return
    }
    const card = target.closest<HTMLElement>("[data-key]")
    const pan = event.button === 1 || event.button === 2
    if (event.button !== 0 && !pan) return
    let share: [number, number] | null = null
    if (card) {
      const box = card.getBoundingClientRect()
      share = [
        (event.clientX - box.left) / box.width,
        (event.clientY - box.top) / box.height,
      ]
    }
    press.current = {
      pointer: event.pointerId,
      from: [event.clientX, event.clientY],
      key: (card?.dataset.key as Key | undefined) ?? null,
      image: card?.dataset.image ?? null,
      share,
      shift: event.shiftKey,
      pan,
      moved: false,
      dragging: null,
      before: selected,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    cancelAnimationFrame(gliding.current)
  }

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const pressed = press.current
    const at = camera.current
    if (!pressed || pressed.pointer !== event.pointerId || !at) return
    const dx = event.clientX - pressed.from[0]
    const dy = event.clientY - pressed.from[1]
    if (pressed.pan) {
      put({
        ...at,
        x: at.x - event.movementX / at.zoom,
        y: at.y - event.movementY / at.zoom,
      })
      return
    }
    if (!pressed.moved) {
      if (Math.hypot(dx, dy) < DRAG_FROM) return
      pressed.moved = true
      if (pressed.key) {
        // a picture gone up to is noted on, and stays where it is
        if (pressed.image === focused && pressed.key.startsWith("i:")) return
        const own = (key: Key): Key => {
          const image = board.images.find((one) => `i:${one.id}` === key)
          return image?.group ? `g:${image.group}` : key
        }
        const picked = selected.includes(pressed.key)
        pressed.dragging = [
          ...new Set((picked ? selected : [pressed.key]).map(own)),
        ]
        if (!picked)
          setSelected(
            pressed.shift ? [...selected, pressed.key] : [pressed.key]
          )
      }
    }
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      if (pressed.dragging) {
        setMoving({ keys: pressed.dragging, by: [dx / at.zoom, dy / at.zoom] })
        setOver(
          groupAt(pressed.dragging, boardAt(event.clientX, event.clientY))
        )
      } else if (!pressed.key) {
        const to: [number, number] = [event.clientX, event.clientY]
        const within = stage.current?.getBoundingClientRect()
        setBox({
          left: Math.min(pressed.from[0], to[0]) - (within?.left ?? 0),
          top: Math.min(pressed.from[1], to[1]) - (within?.top ?? 0),
          width: Math.abs(to[0] - pressed.from[0]),
          height: Math.abs(to[1] - pressed.from[1]),
          leftwards: to[0] < pressed.from[0],
        })
        const [x0, y0] = boardAt(...pressed.from)
        const [x1, y1] = boardAt(...to)
        const drawn = {
          x: (x0 + x1) / 2,
          y: (y0 + y1) / 2,
          w: Math.abs(x1 - x0),
          h: Math.abs(y1 - y0),
        }
        // drawn from right to left, it takes what it touches
        const taken = takenIn(drawn, units, to[0] < pressed.from[0])
        setSelected(
          pressed.shift
            ? [...new Set([...pressed.before, ...(taken as Key[])])]
            : (taken as Key[])
        )
      }
    })
  }

  const up = (event: React.PointerEvent<HTMLDivElement>) => {
    const pressed = press.current
    if (!pressed || pressed.pointer !== event.pointerId) return
    press.current = null
    cancelAnimationFrame(frame.current)
    if (pressed.pan) return
    if (pressed.moved) {
      const at = camera.current
      const into =
        pressed.dragging &&
        groupAt(pressed.dragging, boardAt(event.clientX, event.clientY))
      if (pressed.dragging && into) putInGroup(pressed.dragging, into)
      else if (pressed.dragging && at)
        moveBy(pressed.dragging, [
          (event.clientX - pressed.from[0]) / at.zoom,
          (event.clientY - pressed.from[1]) / at.zoom,
        ])
      setMoving(null)
      setOver(null)
      setBox(null)
      return
    }
    const { key, image, share } = pressed
    if (!key) {
      if (focused) unfocus()
      else if (spread) putBack()
      else setSelected([])
      return
    }
    if (pressed.shift) {
      setSelected(
        selected.includes(key)
          ? selected.filter((one) => one !== key)
          : [...selected, key]
      )
      return
    }
    if (key.startsWith("g:")) return spreadOut(key.slice(2))
    if (image && image === focused && share)
      return setWriting({
        image,
        note: null,
        at: [
          Math.min(1, Math.max(0, share[0])),
          Math.min(1, Math.max(0, share[1])),
        ],
        text: "",
      })
    if (image) focusOn(image)
  }

  const cancel = () => {
    press.current = null
    cancelAnimationFrame(frame.current)
    setMoving(null)
    setOver(null)
    setBox(null)
  }

  // --- drawn --------------------------------------------------------------------------

  const picked = setOf(selected)
  const looking = new Set(analysing)
  const empty = board.images.length === 0
  const groupsShown = board.groups.flatMap((group) => {
    const pictures = shown.filter((one) => one.image.group === group.id)
    const all = boundsOf(pictures.map((one) => one.box))
    if (!all) return []
    const coming = over === group.id && moving ? moving.keys.length : 0
    return [
      {
        group,
        count: pictures.length + coming,
        top: all.y - all.h / 2,
        x: all.x,
      },
    ]
  })

  return (
    <>
      <div
        ref={stage}
        className={cn(
          "absolute inset-0 touch-none select-none",
          box ? "cursor-crosshair" : "cursor-default"
        )}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-key]")) return
          back.current = []
          setFocused(null)
          setSpread(null)
          glide(whole())
        }}
      >
        <div
          ref={world}
          className="absolute top-0 left-0 origin-top-left"
          style={{ "--zoom": 1 } as React.CSSProperties}
        >
          {shown.map((one) => (
            <Card
              key={one.image.id}
              projectId={projectId}
              shown={one}
              // (a pile has the line round its top picture alone; and one gone up to
              // is plain enough to be seen without one)
              picked={
                picked.has(one.key) && one.top && one.image.id !== focused
              }
              focused={one.image.id === focused && one.pile === null}
              dim={found !== null && !found.has(one.image.id)}
              moving={
                moving !== null &&
                (moving.keys.includes(one.key) ||
                  moving.keys.includes(`g:${one.image.group}` as Key))
              }
              going={over !== null && moving?.keys.includes(one.key) === true}
              analysing={looking.has(one.image.id)}
              notesShown={notesShown}
              writing={writing?.image === one.image.id ? writing : null}
              onNote={(note) => {
                if (one.image.id !== focused) focusOn(one.image.id)
                setWriting({
                  image: one.image.id,
                  note: note.id,
                  at: note.at,
                  text: note.text,
                })
              }}
              onText={(text) =>
                setWriting((was) => (was ? { ...was, text } : was))
              }
              onWritten={writeNote}
              onDropNote={(note) => dropNote(one.image.id, note)}
              onStopWriting={() => setWriting(null)}
            />
          ))}
          {groupsShown.map(({ group, count, top, x }) => (
            <button
              key={group.id}
              type="button"
              // over the pile, at the size it is read at whatever the zoom, unless the
              // board is seen from so far that it would stand over the pictures round it
              className={cn(
                "absolute flex origin-bottom items-center gap-2 px-1 text-sm font-medium whitespace-nowrap transition-[translate,opacity] duration-450 ease-out select-none motion-reduce:transition-none",
                found !== null &&
                  !shown.some(
                    (one) =>
                      one.image.group === group.id && found.has(one.image.id)
                  ) &&
                  "opacity-25"
              )}
              style={{
                left: x,
                top,
                translate: "-50% calc(-100% - 14px)",
                scale: "calc(1 / max(var(--zoom), 0.45))",
                zIndex: 6,
              }}
              title="Rename the group"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() =>
                setNaming({
                  kind: "rename",
                  group: group.id,
                  title: group.title,
                })
              }
            >
              <span className="max-w-72 truncate">{group.title}</span>
              <Badge variant="secondary" className="tabular-nums">
                {count}
              </Badge>
            </button>
          ))}
        </div>
        {box && (
          <div
            className={cn(
              "pointer-events-none absolute border border-foreground bg-foreground/15 ring-1 inset-ring-1 ring-black/30 inset-ring-black/30",
              box.leftwards && "border-dashed"
            )}
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              zIndex: 1000,
            }}
          />
        )}
      </div>

      {empty && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center select-none">
          <LayoutGridIcon
            className="mb-6 size-10 text-foreground/45"
            strokeWidth={1}
            absoluteStrokeWidth
          />
          <div className="text-xl/[1.3] font-bold">Your inspiration board</div>
          <div className="max-w-md text-xl/[1.3] text-balance text-foreground/45">
            Drop in images of things you want this to be like.
          </div>
          <Button
            variant="secondary"
            className="pointer-events-auto mt-6"
            onClick={() => chooser.current?.click()}
          >
            Choose images
          </Button>
        </div>
      )}
      <input
        ref={chooser}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])])
          event.target.value = ""
        }}
      />

      {finding === null ? (
        <Called updated={board.updated} />
      ) : (
        <BoardSearch found={found} onShow={showFound} />
      )}

      {naming && (
        <NameGroup
          naming={naming}
          onNamed={named}
          onCancel={() => setNaming(null)}
        />
      )}
    </>
  )
}

/** What the board is, at the top of it, and when it was last changed. */
function Called({ updated }: { updated: number | null }) {
  const now = useNow()
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
      <div className="flex max-w-[50%] items-center gap-2 text-sm select-none">
        <span className="truncate font-medium">Inspiration Board</span>
        {updated !== null && (
          <span className="shrink-0 text-foreground/45 tabular-nums">
            {ago(updated, now) === "now"
              ? "Updated just now"
              : `Last updated ${ago(updated, now)} ago`}
          </span>
        )}
      </div>
    </div>
  )
}
