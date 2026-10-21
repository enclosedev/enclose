// What a tool's file says of itself, read into what the window can show: its name and
// its controls. A tool is written by an agent for the one model, and read by nobody
// before it is run: so whatever is left out is given the plain thing it most likely
// meant, and what cannot be made sense of is said in words the agent can act on.
import { PALETTE_NAMES, type PaletteName } from "@shared/palette"

import {
  ICONS,
  type Control,
  type ControlKind,
  type IconName,
  type Option,
  type Value,
} from "./types"

const KINDS: ControlKind[] = [
  "slider",
  "pad",
  "buttons",
  "choice",
  "list",
  "toggle",
  "palette",
  "readout",
]

/** What a tool does when something happens to one of its controls, by control. */
export type Doing = {
  /** a button of it was pressed */
  press: Map<string, (option: string, tool: unknown) => unknown>
  /** it was set to something else, by hand */
  change: Map<string, (value: Value, tool: unknown) => unknown>
  /** how what it is set to is worded */
  format: Map<string, (value: never) => unknown>
}

export type Declared = {
  name: string
  controls: Control[]
  doing: Doing
  /** what it does each time the view is drawn: where it moves the parts */
  frame: ((tool: unknown) => unknown) | null
}

type Given = Record<string, unknown>

const isObject = (value: unknown): value is Given =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown, otherwise: string) =>
  typeof value === "string" && value.trim() ? value.trim() : otherwise

const number = (value: unknown, otherwise: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : otherwise

/** A key as a title: "lidAngle" and "lid-angle" are both "Lid angle". */
export function titled(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function optionsOf(where: string, given: unknown): Option[] {
  if (!Array.isArray(given) || given.length === 0)
    throw new Error(`${where} needs options: a list of what it offers.`)
  const options = given.map((one: unknown): Option => {
    if (typeof one === "string" || typeof one === "number")
      return { id: String(one), label: String(one), icon: null }
    if (!isObject(one))
      throw new Error(`${where}: an option is a word, or { id, label, icon }.`)
    const icon = ICONS.find((name) => name === one.icon) ?? null
    if (typeof one.icon === "string" && !icon)
      throw new Error(
        `${where}: there is no icon "${one.icon}". The icons are ${ICONS.join(", ")}.`
      )
    const label = text(one.label, "")
    const id = text(one.id, label || (icon ?? ""))
    if (!id) throw new Error(`${where}: an option needs an id or a label.`)
    return { id, label: label || (icon ? "" : id), icon: icon as IconName }
  })
  const twice = options.find(
    (one, index) => options.findIndex((other) => other.id === one.id) < index
  )
  if (twice) throw new Error(`${where} has two options called "${twice.id}".`)
  return options
}

function spanOf(where: string, given: unknown): { min: number; max: number } {
  const span = isObject(given) ? given : {}
  const min = number(span.min, -1)
  const max = number(span.max, 1)
  if (!(max > min)) throw new Error(`${where}: max has to be more than min.`)
  return { min, max }
}

/** The nearest to a number that a slider can be set to. */
export function snapped(
  value: number,
  { min, max, step }: { min: number; max: number; step: number }
): number {
  const within = Math.min(max, Math.max(min, value))
  if (!(step > 0)) return within
  const stepped = min + Math.round((within - min) / step) * step
  // (and not 0.30000000000000004)
  return Math.min(max, Number(stepped.toFixed(9)))
}

/**
 * What a control is set to when it is given this: the nearest thing it can be, or
 * undefined where what is given is nothing it can be set to.
 */
export function fitted(control: Control, value: unknown): Value | undefined {
  switch (control.kind) {
    case "slider":
      return typeof value === "number" && Number.isFinite(value)
        ? snapped(value, control)
        : undefined
    case "pad": {
      if (!Array.isArray(value) || value.length !== 2) return undefined
      const [x, y] = value as unknown[]
      if (typeof x !== "number" || typeof y !== "number") return undefined
      if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
      return [
        Math.min(control.x.max, Math.max(control.x.min, x)),
        Math.min(control.y.max, Math.max(control.y.min, y)),
      ]
    }
    case "toggle":
      return typeof value === "boolean" ? value : undefined
    case "choice":
    case "list":
      return control.options.find((option) => option.id === value)?.id
    case "palette":
      return control.options.find((name) => name === value)
    case "readout":
      return typeof value === "string" || typeof value === "number"
        ? String(value)
        : undefined
    case "buttons":
      return undefined
  }
}

function controlOf(id: string, given: unknown): Control {
  const where = `controls.${id}`
  if (!isObject(given))
    throw new Error(`${where} is not a control: { kind, title, ... }.`)
  const kind = KINDS.find((one) => one === given.kind)
  if (!kind)
    throw new Error(
      `${where}: kind is ${JSON.stringify(given.kind)}. It can be ${KINDS.join(", ")}.`
    )
  const base = {
    id,
    title: text(given.title, titled(id)),
    description: text(given.description, ""),
  }
  switch (kind) {
    case "slider": {
      const min = number(given.min, 0)
      const max = number(given.max, 1)
      if (!(max > min))
        throw new Error(`${where}: max has to be more than min.`)
      const step = Math.max(0, number(given.step, 0))
      const span = { min, max, step }
      return {
        ...base,
        kind,
        ...span,
        value: snapped(number(given.value, min), span),
        says: null,
      }
    }
    case "pad": {
      const x = spanOf(`${where}.x`, given.x)
      const y = spanOf(`${where}.y`, given.y)
      const pad: Control = {
        ...base,
        kind,
        x,
        y,
        springs: given.springs === true,
        value: [0, 0],
        says: null,
      }
      pad.value = (fitted(pad, given.value) as
        [number, number] | undefined) ?? [
        Math.min(x.max, Math.max(x.min, 0)),
        Math.min(y.max, Math.max(y.min, 0)),
      ]
      return pad
    }
    case "buttons":
      return { ...base, kind, options: optionsOf(where, given.options) }
    case "choice":
    case "list": {
      const options = optionsOf(where, given.options)
      const value =
        options.find((option) => option.id === given.value)?.id ?? options[0].id
      return { ...base, kind, options, value }
    }
    case "toggle":
      return { ...base, kind, value: given.value === true }
    case "palette": {
      const asked = Array.isArray(given.options) ? given.options : PALETTE_NAMES
      const options = asked.filter((name): name is PaletteName =>
        PALETTE_NAMES.includes(name as PaletteName)
      )
      if (options.length === 0)
        throw new Error(
          `${where}: its options are colours of the app's: ${PALETTE_NAMES.join(", ")}.`
        )
      const value = options.find((name) => name === given.value) ?? options[0]
      return { ...base, kind, options, value }
    }
    case "readout":
      return {
        ...base,
        kind,
        value:
          typeof given.value === "string" || typeof given.value === "number"
            ? String(given.value)
            : "",
      }
  }
}

/**
 * A tool, from what its file gives (its default export): `known` is what the file is
 * called, which is what the tool goes by where it gives itself no name, and `kept` what
 * its controls were last set to, which they are set to again where they still can be.
 */
export function declared(
  given: unknown,
  known: string,
  kept: Record<string, Value> = {}
): Declared {
  if (!isObject(given))
    throw new Error(
      "A tool's file ends with export default { name, controls, frame }."
    )
  const listed = given.controls ?? {}
  if (!isObject(listed))
    throw new Error(
      "controls is an object: one control to a key, in the order they are shown."
    )
  if (given.frame !== undefined && typeof given.frame !== "function")
    throw new Error("frame is a function: frame(tool) { ... }.")
  const doing: Doing = {
    press: new Map(),
    change: new Map(),
    format: new Map(),
  }
  const controls = Object.entries(listed).map(([id, one]) => {
    const control = controlOf(id, one)
    const said = one as Given
    for (const what of ["press", "change", "format"] as const) {
      const does = said[what]
      if (does === undefined) continue
      if (typeof does !== "function")
        throw new Error(`controls.${id}.${what} is a function.`)
      doing[what].set(id, does as never)
    }
    if (id in kept && "value" in control) {
      const value = fitted(control, kept[id])
      if (value !== undefined) (control as { value: Value }).value = value
    }
    return control
  })
  return {
    name: text(given.name, titled(known)),
    controls,
    doing,
    frame: (given.frame as Declared["frame"]) ?? null,
  }
}
