// A tool at work: what its file declared, the model's parts as it was told of them, and
// what it does with them each time the view is drawn. It runs shut away from the window
// (see runner.ts), and all that comes out of it is said here: where the parts are, how
// they look, and how its controls stand.
import type { Vec3 } from "@shared/api"
import { PALETTE_NAMES, type PaletteName } from "@shared/palette"

import { fitted, type Declared } from "./declare"
import { Glide } from "./glide"
import { after, AT_HOME, atHome, carrying, turning, type Pose } from "./pose"
import type { Control, FromRunner, Looks, PartFact, Value } from "./types"

/** The longest a frame is taken to have lasted, in seconds: a pause is not a leap. */
const LONGEST_FRAME = 0.1
/** How long a number takes to get where it is going, in seconds, unless the tool says. */
const GLIDE_SECONDS = 0.6
/** How many numbers a tool can have on their way at once: more is a name made up afresh every frame. */
const MOST_GLIDES = 500

const AXES: Record<string, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n))

type Box = { min: Vec3; max: Vec3 }

/** The box round several, and what follows from it: its middle and how big it is. */
function boxed(boxes: Box[]) {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const box of boxes)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], box.min[axis])
      max[axis] = Math.max(max[axis], box.max[axis])
    }
  if (boxes.length === 0) {
    min.fill(0)
    max.fill(0)
  }
  return {
    min,
    max,
    center: min.map((n, axis) => (n + max[axis]) / 2) as Vec3,
    size: max.map((n, axis) => n - min[axis]) as Vec3,
  }
}

type Frame = Extract<FromRunner, { type: "frame" }>

/** Some of the model's parts, as a tool has hold of them: one, or several as one. */
export type Held = {
  /** of one part: what it is known by, what it is called and the group it is in */
  id?: string
  label?: string
  group?: string
  ids: string[]
  /** the box round it as built, in mm, with its middle and how big it is */
  min: Vec3
  max: Vec3
  center: Vec3
  size: Vec3
  turn(how: unknown): Held
  move(by: unknown): Held
  hide(): Held
  show(shown?: unknown): Held
  color(name: unknown): Held
}

/** What a tool's own functions are handed: its controls, the clock and the parts. */
export type Handed = {
  values: Record<string, Value | undefined>
  set(id: unknown, value: unknown): void
  model: {
    parts: (PartFact & { center: Vec3; size: Vec3 })[]
    min: Vec3
    max: Vec3
    center: Vec3
    size: Vec3
  }
  dt: number
  elapsed: number
  glide(name: unknown, to: unknown, seconds?: unknown): number
  part(id: unknown): Held
  parts(...ids: unknown[]): Held
  group(id: unknown): Held
}

export class Running {
  readonly name: string
  private controls: Control[]
  private parts: PartFact[]
  /** how each part that has been moved this frame is moved, by part */
  private poses = new Map<string, Pose>()
  private hidden = new Set<string>()
  private colours = new Map<string, PaletteName>()
  /** it is drawing a frame: the one time the parts are its to move */
  private drawing = false
  private last: number | null = null
  private elapsed = 0
  private dt = 0
  /** how many frames it has drawn */
  private frames = 0
  /**
   * The numbers it has on their way somewhere (see glide.ts), by what it calls each:
   * and the frame each was last taken on in, which is done once a frame.
   */
  private glides = new Map<string, { glide: Glide; frame: number }>()
  /** what was last said of each of these, to say them again only when they change */
  private said = { poses: "", looks: "", controls: "" }
  /** what is handed to everything the tool's file does */
  private tool: Handed
  private declared: Declared

  constructor(declared: Declared, parts: PartFact[]) {
    this.declared = declared
    this.name = declared.name
    this.controls = declared.controls
    this.parts = parts
    this.tool = this.handed()
    this.word()
  }

  /** The controls as they stand. */
  standing(): Control[] {
    return this.controls
  }

  private control(id: string): Control {
    const control = this.controls.find((one) => one.id === id)
    if (!control)
      throw new Error(
        `There is no control "${id}". The controls are ${this.controls.map((one) => one.id).join(", ") || "none"}.`
      )
    return control
  }

  /**
   * Set a control. By hand, what cannot be is let pass, and the tool hears of the
   * change; by the tool itself it is a mistake in the tool, and says so.
   */
  set(id: string, value: unknown, byHand: boolean) {
    const control = this.control(id)
    const next = fitted(control, value)
    if (next === undefined) {
      if (byHand) return
      throw new Error(
        `controls.${id} is a ${control.kind}: it cannot be set to ${JSON.stringify(value)}.`
      )
    }
    ;(control as { value: Value }).value = next
    if (byHand) this.declared.doing.change.get(id)?.(next, this.tool)
  }

  press(id: string, option: string) {
    const control = this.control(id)
    if (control.kind !== "buttons") return
    if (!control.options.some((one) => one.id === option)) return
    this.declared.doing.press.get(id)?.(option, this.tool)
  }

  /** Draw a frame, at this time by the window's clock (ms), and say what has changed. */
  tick(now: number, count: number): Frame {
    this.dt =
      this.last === null
        ? 0
        : Math.min(LONGEST_FRAME, Math.max(0, (now - this.last) / 1000))
    this.last = now
    this.elapsed += this.dt
    this.frames++
    this.tool.dt = this.dt
    this.tool.elapsed = this.elapsed
    this.poses.clear()
    this.hidden.clear()
    this.colours.clear()
    this.drawing = true
    try {
      this.declared.frame?.(this.tool)
    } finally {
      this.drawing = false
      // (outside of a frame, no time is passing)
      this.tool.dt = 0
    }
    this.word()

    const moved = this.parts.filter((part) => {
      const pose = this.poses.get(part.id)
      return pose && !atHome(pose)
    })
    const matrices = new Float32Array(moved.length * 16)
    moved.forEach((part, index) =>
      matrices.set(this.poses.get(part.id)!, index * 16)
    )
    const ids = moved.map((part) => part.id)
    const looks: Looks = {
      hidden: this.parts
        .filter((part) => this.hidden.has(part.id))
        .map((part) => part.id),
      colours: Object.fromEntries(this.colours),
    }
    const said = {
      poses: `${ids.join("|")}:${matrices.join()}`,
      looks: JSON.stringify(looks),
      controls: JSON.stringify(this.controls),
    }
    const before = this.said
    this.said = said
    return {
      type: "frame",
      poses: said.poses === before.poses ? null : { ids, matrices },
      looks: said.looks === before.looks ? null : looks,
      // (a copy: what is said is not changed under whoever was told)
      controls:
        said.controls === before.controls
          ? null
          : (JSON.parse(said.controls) as Control[]),
      // (of the numbers it took on in this frame: one it has left off asking for is
      // not waited for)
      settling: [...this.glides.values()].some(
        (going) => going.frame === this.frames && !going.glide.resting()
      ),
      count,
    }
  }

  /** Have each control that words its own value say it as it now is. */
  private word() {
    for (const control of this.controls) {
      if (control.kind !== "slider" && control.kind !== "pad") continue
      const format = this.declared.doing.format.get(control.id)
      if (!format) continue
      const says = format(control.value as never)
      control.says = says === undefined || says === null ? null : String(says)
    }
  }

  private move(ids: string[], pose: Pose) {
    if (!this.drawing)
      throw new Error(
        "Parts are moved in frame() only, which draws them afresh every time. Keep what a button or a change does in a variable, and move the parts by it in frame()."
      )
    for (const id of ids)
      this.poses.set(id, after(pose, this.poses.get(id) ?? AT_HOME))
  }

  /** Some of the model's parts, as something a tool has hold of: one, or several as one. */
  private hold(parts: PartFact[]): Held {
    const ids = parts.map((part) => part.id)
    const box = boxed(parts)
    const held: Held = {
      ...(parts.length === 1
        ? { id: parts[0].id, label: parts[0].label, group: parts[0].group }
        : {}),
      ids,
      ...box,
      /** turned so many degrees about a line: through its own middle and along Z, unless told */
      turn: (how: unknown) => {
        const given = (typeof how === "number" ? { by: how } : (how ?? {})) as {
          by?: unknown
          axis?: unknown
          about?: unknown
        }
        if (typeof given.by !== "number" || !Number.isFinite(given.by))
          throw new Error(
            "turn({ by, axis, about }): by is how many degrees, a number."
          )
        const axis =
          given.axis === undefined
            ? AXES.z
            : typeof given.axis === "string"
              ? AXES[given.axis.toLowerCase()]
              : given.axis
        if (!isVec3(axis))
          throw new Error(
            'turn({ by, axis, about }): axis is "x", "y", "z" or a direction [x, y, z].'
          )
        const about = given.about === undefined ? box.center : given.about
        if (!isVec3(about))
          throw new Error(
            "turn({ by, axis, about }): about is a point [x, y, z], in mm."
          )
        this.move(ids, turning(about, axis, given.by))
        return held
      },
      /** carried this far, in mm */
      move: (by: unknown) => {
        if (!isVec3(by))
          throw new Error("move([x, y, z]): how far to carry it, in mm.")
        this.move(ids, carrying(by))
        return held
      },
      hide: () => held.show(false),
      show: (shown: unknown = true) => {
        this.move([], AT_HOME)
        for (const id of ids)
          if (shown === false) this.hidden.add(id)
          else this.hidden.delete(id)
        return held
      },
      /** drawn in one of the app's colours; or (null) in its own again */
      color: (name: unknown) => {
        this.move([], AT_HOME)
        const colour = PALETTE_NAMES.find((one) => one === name)
        if (name !== null && name !== undefined && !colour)
          throw new Error(
            `color(${JSON.stringify(name)}): the colours are ${PALETTE_NAMES.join(", ")}.`
          )
        for (const id of ids)
          if (colour) this.colours.set(id, colour)
          else this.colours.delete(id)
        return held
      },
    }
    return held
  }

  private find(id: unknown): PartFact {
    const part = this.parts.find((one) => one.id === id)
    if (!part)
      throw new Error(
        `The model has no part "${String(id)}". Its parts are ${this.parts.map((one) => one.id).join(", ")}.`
      )
    return part
  }

  /** What the tool's own functions are handed: the controls, the clock and the parts. */
  private handed(): Handed {
    const set = (id: unknown, value: unknown) =>
      this.set(String(id), value, false)
    const values = new Proxy<Handed["values"]>(
      {},
      {
        get: (_, id) => {
          const control = this.controls.find((one) => one.id === id)
          return control && "value" in control ? control.value : undefined
        },
        set: (_, id, value) => {
          set(id, value)
          return true
        },
        has: (_, id) => this.controls.some((one) => one.id === id),
        ownKeys: () =>
          this.controls.filter((one) => "value" in one).map((one) => one.id),
        getOwnPropertyDescriptor: (_, id) => {
          const control = this.controls.find((one) => one.id === id)
          return control && "value" in control
            ? { value: control.value, enumerable: true, configurable: true }
            : undefined
        },
      }
    )
    const model = {
      parts: this.parts.map((part) => ({ ...part, ...boxed([part]) })),
      ...boxed(this.parts),
    }
    return {
      values,
      set,
      model,
      /** seconds since the frame before this one; nothing, outside of a frame */
      dt: 0,
      /** seconds the tool has been running */
      elapsed: 0,
      /**
       * A number of the tool's on its way to where it is to be, as a machine would take
       * it there: where it has got to by this frame. It starts at rest, where it is
       * first told to be.
       */
      glide: (name: unknown, to: unknown, seconds: unknown = GLIDE_SECONDS) => {
        if (typeof name !== "string" || name === "")
          throw new Error(
            'glide(name, to, seconds): name is what you call this number, a word of your own: "lid".'
          )
        if (typeof to !== "number" || !Number.isFinite(to))
          throw new Error(
            `glide("${name}", to, seconds): to is where it is to be, a number.`
          )
        if (
          typeof seconds !== "number" ||
          !Number.isFinite(seconds) ||
          seconds < 0
        )
          throw new Error(
            `glide("${name}", to, seconds): seconds is how long it takes to get there, a number.`
          )
        const going = this.glides.get(name)
        if (!going) {
          if (this.glides.size >= MOST_GLIDES)
            throw new Error(
              `glide("${name}", ...): that is more than ${MOST_GLIDES} numbers on their way. Call each by the same name every frame.`
            )
          this.glides.set(name, {
            glide: new Glide(to, seconds),
            frame: this.frames,
          })
          return to
        }
        if (going.frame === this.frames) return going.glide.now()
        going.frame = this.frames
        return going.glide.next(to, this.dt, seconds)
      },
      part: (id: unknown) => this.hold([this.find(id)]),
      parts: (...ids: unknown[]) =>
        this.hold(
          ids.length === 0 ? this.parts : ids.flat().map((id) => this.find(id))
        ),
      group: (id: unknown) => {
        const parts = this.parts.filter((part) => part.group === id)
        if (parts.length === 0)
          throw new Error(
            `The model has no group "${String(id)}". Its groups are ${[...new Set(this.parts.map((part) => part.group))].join(", ")}.`
          )
        return this.hold(parts)
      },
    }
  }
}
