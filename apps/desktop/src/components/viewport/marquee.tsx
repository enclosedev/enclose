// Picking out several parts at once, by drawing a box across the view.
//
// A press of the main button that goes on to be a drag draws a box, from where it began
// to where the pointer is. Drawn from left to right it takes the parts that show wholly
// within it; drawn from right to left, every part it so much as touches, and its edge is
// dashed to say so: the way a CAD program has it. While it is drawn the view shows what
// it takes in so far, through all the rest, and when the button is let go those are
// what is picked out. Esc drops it, and leaves things as they were.
import * as React from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"

import { bridge } from "./bridge"
import { sidesOf, takenIn, type Shape } from "./within"

/** How far a press has to go, in pixels, before it is a drag and no longer a click. */
export const DRAG_FROM = 4

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index])

export function Marquee({
  root,
  plane,
  cut,
  onSweep,
  onTake,
}: {
  root: React.RefObject<THREE.Group | null>
  /** what every part is clipped against, and whether the model is cut open along it */
  plane: THREE.Plane
  cut: boolean
  /**
   * What the box takes in so far, as it is drawn, and whether that is to be added to
   * what is picked out already; null once the box is done with.
   */
  onSweep: (partIds: string[] | null, add: boolean) => void
  /** the button was let go: this is what the box took in */
  onTake: (partIds: string[], add: boolean) => void
}) {
  const gl = useThree((state) => state.gl)
  const get = useThree((state) => state.get)

  React.useEffect(() => {
    const canvas = gl.domElement
    const around = canvas.parentElement
    if (!around) return
    // Over the view and under whatever of the window floats over it. Its edge has a
    // hairline of dark either side, unseen on a dark ground, to show against the parts
    // it takes in, which turn as light as it is.
    const box = document.createElement("div")
    box.className =
      "pointer-events-none absolute hidden border border-foreground bg-foreground/22 ring-1 inset-ring-1 ring-black/30 inset-ring-black/30"
    around.append(box)

    /** the press that may become a box, or has: where it began, and where the pointer is */
    let press: {
      pointer: number
      from: { x: number; y: number }
      to: { x: number; y: number }
      add: boolean
    } | null = null
    let drawing = false
    let frame = 0
    /** what the box took in when it was last measured */
    let taken: string[] = []

    /** The parts on show, each as the meshes it is drawn with. */
    const shown = () => {
      const parts = new Map<string, Shape[]>()
      root.current?.traverse((object) => {
        const id = object.userData.partId as string | undefined
        if (!id || !(object as THREE.Mesh).isMesh) return
        const shapes = parts.get(id)
        if (shapes) shapes.push(object as THREE.Mesh)
        else parts.set(id, [object as THREE.Mesh])
      })
      return parts
    }

    /** The box as it is now: its corners on the screen, kept within the view. */
    const span = () => {
      const rect = canvas.getBoundingClientRect()
      const within = (at: { x: number; y: number }) => ({
        x: Math.min(Math.max(at.x, rect.left), rect.right),
        y: Math.min(Math.max(at.y, rect.top), rect.bottom),
      })
      const from = within(press!.from)
      const to = within(press!.to)
      return {
        rect,
        left: Math.min(from.x, to.x),
        right: Math.max(from.x, to.x),
        top: Math.min(from.y, to.y),
        bottom: Math.max(from.y, to.y),
        whole: to.x >= from.x,
      }
    }

    const place = () => {
      const { rect, left, right, top, bottom, whole } = span()
      Object.assign(box.style, {
        left: `${left - rect.left}px`,
        top: `${top - rect.top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
        borderStyle: whole ? "solid" : "dashed",
      })
    }

    const measure = () => {
      const { rect, left, right, top, bottom, whole } = span()
      const across = (x: number) => ((x - rect.left) / rect.width) * 2 - 1
      const up = (y: number) => 1 - ((y - rect.top) / rect.height) * 2
      const sides = sidesOf(get().camera, {
        left: across(left),
        right: across(right),
        bottom: up(bottom),
        top: up(top),
      })
      return takenIn(shown(), sides, cut ? plane : null, whole)
    }

    /** The box is done with, whether what it took in was picked out or it was dropped. */
    const done = () => {
      const pointer = press?.pointer
      press = null
      if (!drawing) return
      drawing = false
      cancelAnimationFrame(frame)
      frame = 0
      box.classList.add("hidden")
      if (pointer !== undefined && canvas.hasPointerCapture(pointer))
        canvas.releasePointerCapture(pointer)
      onSweep(null, false)
      // the click that ends the drag is still on its way
      setTimeout(() => {
        bridge.handling = false
      }, 0)
    }

    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === "touch") return
      const at = { x: event.clientX, y: event.clientY }
      press = {
        pointer: event.pointerId,
        from: at,
        to: at,
        add: event.shiftKey,
      }
    }
    const move = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointer) return
      // let go where the view did not hear of it
      if (event.buttons === 0) return done()
      press.to = { x: event.clientX, y: event.clientY }
      press.add = event.shiftKey
      if (!drawing) {
        if (bridge.handling) return done()
        const gone = Math.hypot(
          press.to.x - press.from.x,
          press.to.y - press.from.y
        )
        if (gone <= DRAG_FROM) return
        drawing = true
        bridge.handling = true
        canvas.setPointerCapture(press.pointer)
        box.classList.remove("hidden")
        place()
        taken = measure()
        onSweep(taken, press.add)
        return
      }
      place()
      // measured once for each time the view is drawn, however fast the pointer goes
      frame ||= requestAnimationFrame(() => {
        frame = 0
        if (!drawing || !press) return
        const now = measure()
        if (same(now, taken)) return
        taken = now
        onSweep(now, press.add)
      })
    }
    const up = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointer) return
      if (!drawing) return done()
      press.to = { x: event.clientX, y: event.clientY }
      const { add } = press
      const now = measure()
      // picked out before the view stops showing what the box took in: no flicker between
      onTake(now, add)
      done()
    }
    const drop = () => done()
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !drawing) return
      // and it is not taken for leaving anything else, by whoever else listens for it
      event.preventDefault()
      event.stopImmediatePropagation()
      done()
    }

    canvas.addEventListener("pointerdown", down)
    // on the window: the drag goes wherever the pointer does, and ends wherever it ends
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", drop)
    window.addEventListener("blur", drop)
    window.addEventListener("keydown", key, true)
    return () => {
      canvas.removeEventListener("pointerdown", down)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", drop)
      window.removeEventListener("blur", drop)
      window.removeEventListener("keydown", key, true)
      done()
      box.remove()
    }
  }, [gl, get, root, plane, cut, onSweep, onTake])

  return null
}
