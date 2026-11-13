// What makes the model saved for the web move as it does in the app: the project's own
// tools (see kit/tools.md), run on a page by the very code that runs them in the app
// (lib/custom-tools), and their poses put on the nodes of the GLB the app saved with
// them (components/viewport/web.ts).
//
// It is bundled by itself (scripts/electron-build.mjs), with nothing of three.js in it:
// the page has its own three, and the nodes it hands in are moved by their own methods.
// What the app saves as web/<name>.js is this, the project's tools and the model's parts
// (electron/web-export.ts), and it is used as that file's comment says.
import type { PaletteName } from "@shared/palette"
import { declared } from "@/lib/custom-tools/declare"
import { after, type Pose } from "@/lib/custom-tools/pose"
import { Running } from "@/lib/custom-tools/running"
import type { Control, PartFact, Value } from "@/lib/custom-tools/types"

/** As much of a three.js object as is used here. */
type Node = {
  name: string
  visible: boolean
  matrix: { elements: ArrayLike<number> } & {
    fromArray(array: ArrayLike<number>): unknown
    decompose(position: unknown, quaternion: unknown, scale: unknown): unknown
  }
  position: unknown
  quaternion: unknown
  scale: unknown
  updateMatrix(): void
  traverse(each: (node: Node) => void): void
  material?: Shade | Shade[]
}
type Shade = { color?: { getHex(): number; setHex(hex: number): unknown } }

/** What web/<name>.js hands in with the tools: the model's parts, and the colours a tool can give. */
export type WebData = {
  parts: PartFact[]
  palette: Record<PaletteName, string>
}

/** A tool, as web/<name>.js has it: what its file is called, and what makes it. */
export type WebTool = { id: string; load: () => unknown }

export type WebModel = {
  /** the tools, each with its controls as they stand now */
  tools: { id: string; name: string; controls: Control[] }[]
  /** set a control of a tool, as a hand on it would */
  set(tool: string, control: string, value: Value): void
  /** press one of a row of buttons */
  press(tool: string, control: string, option: string): void
  /** move the parts for this moment: each frame, before the scene is drawn */
  update(now?: number): void
  /** hear of a tool's controls changing, by the tool itself or by a hand */
  onChange(listener: (tool: string) => void): () => void
}

/** Model millimetres, Z up, to glTF's metres, Y up; and back. By columns. */
const TO_GLTF: Pose = [
  0.001, 0, 0, 0, 0, 0, -0.001, 0, 0, 0.001, 0, 0, 0, 0, 0, 1,
]
const FROM_GLTF: Pose = [
  1000, 0, 0, 0, 0, 0, 1000, 0, 0, -1000, 0, 0, 0, 0, 0, 1,
]

/**
 * The model's tools at work on the GLB's scene, `root`. Each part is the node of its id;
 * where the page has no such node, what moves it is let go of.
 */
export function enclose(root: Node, data: WebData, tools: WebTool[]): WebModel {
  const nodes = new Map<string, { node: Node; home: Pose }>()
  const wanted = new Set(data.parts.map((part) => part.id))
  root.traverse((node) => {
    if (!wanted.has(node.name) || nodes.has(node.name)) return
    node.updateMatrix()
    nodes.set(node.name, { node, home: Array.from(node.matrix.elements) })
  })
  // what each part's surfaces were before a tool gave them a colour
  const shades = new Map<string, { shade: Shade; hex: number }[]>()
  for (const [id, { node }] of nodes) {
    const found: { shade: Shade; hex: number }[] = []
    node.traverse((one) => {
      for (const shade of [one.material ?? []].flat())
        if (shade.color) found.push({ shade, hex: shade.color.getHex() })
    })
    shades.set(id, found)
  }

  type At = {
    id: string
    running: Running
    poses: Map<string, Pose>
    looks: { hidden: string[]; colours: Record<string, PaletteName> }
  }
  const at: At[] = []
  for (const tool of tools)
    try {
      at.push({
        id: tool.id,
        running: new Running(declared(tool.load(), tool.id), data.parts),
        poses: new Map(),
        looks: { hidden: [], colours: {} },
      })
    } catch (error) {
      console.error(`The tool "${tool.id}" could not be started`, error)
    }

  const listeners = new Set<(tool: string) => void>()
  const told = (id: string) => {
    for (const listener of listeners) listener(id)
  }
  const model: WebModel = {
    tools: at.map(({ id, running }) => ({
      id,
      name: running.name,
      controls: running.standing(),
    })),
    set(tool, control, value) {
      within(tool, (running) => running.set(control, value, true))
    },
    press(tool, control, option) {
      within(tool, (running) => running.press(control, option))
    },
    update(now = performance.now()) {
      let moved = false
      for (const tool of [...at]) {
        let frame
        try {
          frame = tool.running.tick(now, 0)
        } catch (error) {
          drop(tool, error)
          moved = true
          continue
        }
        if (frame.poses) {
          const { ids, matrices } = frame.poses
          tool.poses = new Map(
            ids.map((id, index) => [
              id,
              Array.from(matrices.subarray(index * 16, index * 16 + 16)),
            ])
          )
          moved = true
        }
        if (frame.looks) {
          tool.looks = frame.looks
          moved = true
        }
        if (frame.controls) {
          const shown = model.tools.find((one) => one.id === tool.id)
          if (shown) shown.controls = frame.controls
          told(tool.id)
        }
      }
      if (moved) draw()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }

  function within(id: string, does: (running: Running) => void) {
    const tool = at.find((one) => one.id === id)
    if (!tool) throw new Error(`There is no tool "${id}".`)
    try {
      does(tool.running)
    } catch (error) {
      drop(tool, error)
    }
  }

  /** A tool that went wrong stops, and what it did to the model is undone. */
  function drop(tool: At, error: unknown) {
    console.error(`The tool "${tool.id}" stopped`, error)
    at.splice(at.indexOf(tool), 1)
    model.tools = model.tools.filter((one) => one.id !== tool.id)
    told(tool.id)
  }

  /** Put every part where the tools between them have it, one tool after another, as the app does. */
  function draw() {
    const poses = new Map<string, Pose>()
    const hidden = new Set<string>()
    const colours: Record<string, PaletteName> = {}
    for (const tool of at) {
      for (const [id, moved] of tool.poses) {
        const before = poses.get(id)
        poses.set(id, before ? after(moved, before) : moved)
      }
      for (const id of tool.looks.hidden) hidden.add(id)
      Object.assign(colours, tool.looks.colours)
    }
    for (const [id, { node, home }] of nodes) {
      const pose = poses.get(id)
      // the move is in the model's frame: into glTF's, and after where the node was
      node.matrix.fromArray(
        pose ? after(after(after(TO_GLTF, pose), FROM_GLTF), home) : home
      )
      node.matrix.decompose(node.position, node.quaternion, node.scale)
      node.visible = !hidden.has(id)
      const colour = colours[id]
      for (const { shade, hex } of shades.get(id) ?? [])
        shade.color!.setHex(
          colour ? parseInt(data.palette[colour].slice(1), 16) : hex
        )
    }
  }

  // where the tools have the parts from the first
  model.update()
  return model
}
