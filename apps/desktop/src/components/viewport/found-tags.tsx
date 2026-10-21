// The names of what is found when parts are looked for by name, drawn over the view: a
// tag at each part found, and one for each group, which goes where its part goes as the
// view is turned. A tag is pressed to have what it names shown on its own.
//
// A tag is beside what it names, not over it: just above it, where the thing is small on
// the screen, and in the middle of it only where it is large enough to have the room.
//
// What is found is often a good many things close together, and their names would lie
// over one another. So the tags are put in their places together, each time the view is
// drawn, the nearest to what was typed first: and one that would lie over a tag already
// placed is left out, until the view is turned and there is room for it.
import * as React from "react"
import * as THREE from "three"
import { createRoot, type Root } from "react-dom/client"
import { useFrame, useThree } from "@react-three/fiber"
import { BoxesIcon } from "lucide-react"

import type { Found } from "@/lib/find"
import type { LoadedModel } from "./load"

/** How many names are put in the view, at the most: those nearest to what was typed. */
const AT_MOST = 60
/** How near one tag may come to another, px; and to the thing it is put above. */
const APART = 4
const ABOVE = 6
/**
 * How many times as wide as its tag a thing has to be on the screen, and as high, for
 * the tag to go in the middle of it.
 */
const ROOMY = { wide: 2, high: 3 }

/** A name in the view: what it names, and the place it is kept at. */
export type Named = {
  key: string
  thing: Found
  /** the part that carries it, and goes where it goes */
  on: string
  /** the middle of what it names, in that part's own frame */
  at: THREE.Vector3
  /** how far what it names reaches from there, each way along that frame's axes */
  reach: THREE.Vector3
}

/**
 * Where the names of what was found go: a part's by the part, and a group's by the
 * group, carried by the part of it that is nearest its middle.
 */
export function namesOf(loaded: LoadedModel, things: Found[]): Named[] {
  const parts = new Map(loaded.parts.map((part) => [part.part.id, part]))
  return things.slice(0, AT_MOST).flatMap((thing): Named[] => {
    const own = thing.parts.flatMap((id) => {
      const part = parts.get(id)
      return part
        ? [{ part, box: part.box.clone().applyMatrix4(part.home) }]
        : []
    })
    if (own.length === 0) return []
    const middle = own
      .reduce((all, { box }) => all.union(box), new THREE.Box3())
      .getCenter(new THREE.Vector3())
    const far = ({ box }: (typeof own)[number]) =>
      box.getCenter(new THREE.Vector3()).distanceToSquared(middle)
    const { part } = own.reduce((a, b) => (far(b) < far(a) ? b : a))
    // the box round all of it, as the part that carries the name has it
    const back = part.home.clone().invert()
    const round = own.reduce(
      (all, each) =>
        all.union(
          each.part.box
            .clone()
            .applyMatrix4(back.clone().multiply(each.part.home))
        ),
      new THREE.Box3()
    )
    return [
      {
        key: `${thing.kind}:${thing.id}`,
        thing,
        on: part.part.id,
        at: round.getCenter(new THREE.Vector3()),
        reach: round.getSize(new THREE.Vector3()).multiplyScalar(0.5),
      },
    ]
  })
}

// The places and the tags, each by the key of what it names. One model is on show at a
// time, and these are its: the places are set down in the view, among the parts, and the
// tags are drawn by a root of their own over it.
const places = new Map<string, THREE.Object3D>()
const tags = new Map<string, HTMLElement>()

/** The place a name is kept at, set down in the part that carries it. */
export function Place({ name, at }: { name: string; at: THREE.Vector3 }) {
  return (
    <object3D
      position={at}
      ref={(place) => {
        if (!place) return
        places.set(name, place)
        return () => {
          if (places.get(name) === place) places.delete(name)
        }
      }}
    />
  )
}

// A press on a tag is not a press on the view under it: the view is not turned by it.
const held = (event: React.PointerEvent) => event.stopPropagation()

/**
 * A tag is the name tag a part has when it is picked out, a little smaller, since there
 * are many: and it is a button. It is not seen until it has been put in its place.
 */
const TAG =
  "pointer-events-none absolute top-0 left-0 flex h-7 max-w-96 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-medium whitespace-nowrap text-background opacity-0 shadow-sm ring-1 ring-background/25 outline-none transition-opacity duration-150 hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)_15%)] data-shown:pointer-events-auto data-shown:opacity-100"

function Tags({
  named,
  onShow,
  onMade,
}: {
  named: Named[]
  onShow: (thing: Found) => void
  /** they are there to be put in their places */
  onMade: () => void
}) {
  React.useLayoutEffect(() => onMade(), [named, onMade])
  return named.map(({ key, thing }) => (
    <button
      key={key}
      type="button"
      ref={(tag) => {
        if (!tag) return
        tags.set(key, tag)
        return () => {
          if (tags.get(key) === tag) tags.delete(key)
        }
      }}
      title={
        thing.kind === "group"
          ? `Show the ${thing.parts.length} parts of ${thing.label} on their own`
          : `Show ${thing.label} on its own`
      }
      onPointerDown={held}
      onClick={() => onShow(thing)}
      className={TAG}
    >
      {/* a group is told from a part of the same name by the sign the list of parts has */}
      {thing.kind === "group" && <BoxesIcon className="-ml-0.5 size-3.5" />}
      <span className="truncate">{thing.label}</span>
    </button>
  ))
}

const seen = new THREE.Vector3()
const corner = new THREE.Vector3()

/** Put each tag at its place as the view now shows it: or leave it out, for want of room. */
function arrange(
  named: Named[],
  camera: THREE.Camera,
  size: { width: number; height: number }
) {
  camera.updateMatrixWorld()
  const across = (x: number) => ((x + 1) / 2) * size.width
  const down = (y: number) => ((1 - y) / 2) * size.height
  // all of them measured before any is moved, so that the page is laid out once
  const sized = named.flatMap(({ key, reach }) => {
    const tag = tags.get(key)
    const place = places.get(key)
    return tag && place
      ? [{ tag, place, reach, wide: tag.offsetWidth, high: tag.offsetHeight }]
      : []
  })
  const taken: { left: number; right: number; top: number; bottom: number }[] =
    []
  for (const { tag, place, reach, wide, high } of sized) {
    place.updateWorldMatrix(true, false)
    seen.setFromMatrixPosition(place.matrixWorld).project(camera)
    // How much of the view the thing takes up, by the corners of the box round it: not
    // to be told where one of them is behind the camera, which is as near as it gets.
    const span = { left: Infinity, right: -Infinity, top: Infinity, bottom: 0 }
    let whole = true
    for (let which = 0; which < 8 && whole; which++) {
      corner
        .set(
          which & 1 ? reach.x : -reach.x,
          which & 2 ? reach.y : -reach.y,
          which & 4 ? reach.z : -reach.z
        )
        .applyMatrix4(place.matrixWorld)
        .project(camera)
      whole = Math.abs(corner.z) <= 1
      span.left = Math.min(span.left, across(corner.x))
      span.right = Math.max(span.right, across(corner.x))
      span.top = Math.min(span.top, down(corner.y))
      span.bottom = Math.max(span.bottom, down(corner.y))
    }
    const roomy =
      !whole ||
      (span.right - span.left >= wide * ROOMY.wide &&
        span.bottom - span.top >= high * ROOMY.high)
    const over = span.top - ABOVE - high
    const left = Math.round(across(seen.x) - wide / 2)
    const top = Math.round(roomy || over < 0 ? down(seen.y) - high / 2 : over)
    const right = left + wide
    const bottom = top + high
    const there =
      Math.abs(seen.z) <= 1 &&
      right > 0 &&
      left < size.width &&
      bottom > 0 &&
      top < size.height &&
      !taken.some(
        (other) =>
          left < other.right + APART &&
          right > other.left - APART &&
          top < other.bottom + APART &&
          bottom > other.top - APART
      )
    tag.toggleAttribute("data-shown", there)
    if (!there) continue
    taken.push({ left, right, top, bottom })
    tag.style.transform = `translate(${left}px, ${top}px)`
  }
}

/**
 * The tags themselves, over the view and under whatever of the window floats over it.
 * `named` is what they name, the nearest to what was typed first.
 */
export const FoundTags = React.memo(function FoundTags({
  named,
  onShow,
}: {
  named: Named[]
  /** a tag was pressed: what it names is to be shown on its own */
  onShow: (thing: Found) => void
}) {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const root = React.useRef<Root | null>(null)
  React.useLayoutEffect(() => {
    const around = gl.domElement.parentElement
    if (!around) return
    const over = document.createElement("div")
    over.className = "pointer-events-none absolute inset-0 overflow-hidden"
    around.append(over)
    const made = createRoot(over)
    root.current = made
    return () => {
      root.current = null
      over.remove()
      // not in the middle of whatever is taking the view down, which may be drawing
      setTimeout(() => made.unmount())
    }
  }, [gl])
  React.useLayoutEffect(() => {
    root.current?.render(
      <Tags named={named} onShow={onShow} onMade={invalidate} />
    )
  }, [named, onShow, invalidate])

  useFrame(({ camera, size }) => arrange(named, camera, size))
  return null
})
