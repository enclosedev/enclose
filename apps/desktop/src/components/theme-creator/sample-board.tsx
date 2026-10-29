// A circuit board for the theme creator's window to show in PCB mode, in the colours a
// theme gives one: the same board each time, built once with tscircuit and kept beside
// this, in sample/. Each of the three ways PCB mode looks at a board is drawn as PCB mode
// draws it, in 3D or as tscircuit draws it, and nothing in it does anything but show the
// colours.
//
// The board is plate.circuit.tsx, with the parts it brings in from lib/, after Scott
// Bezek's open-source split-flap display (github.com/scottbez1/splitflap). Of what is
// built of it, plate.circuit.json and plate.glb are kept. To change it, copy those
// sources into the pcb/ folder of a project of their own, build it there with
// kit/board.mjs as kit/pcb.md says, and copy those two back from its pcb/build/.
import * as React from "react"
import * as THREE from "three"
import { Canvas, useThree } from "@react-three/fiber"

import { copperLayerOf } from "@shared/board-format"
import type { PcbColours } from "@shared/theme-format"
import type { Circuit } from "@/components/pcb/boards"
import {
  KeepOuts,
  readDrawing,
  standing,
  useDrawn,
} from "@/components/pcb/board-mode"
import { disposeBoard, loadBoard } from "@/components/pcb/pictures"
import { FOV, HOME_DIRECTION, toWorld } from "@/components/viewport/rig"
import type { BoardAs } from "@/lib/store"
import circuitUrl from "./sample/plate.circuit.json?url"
import modelUrl from "./sample/plate.glb?url"

/** What the board is called, as PCB mode says over it. */
export const SAMPLE_NAME = "Main plate board"

/** How many layers of copper the board is shown with: a colour for each, to be seen. */
export const SAMPLE_LAYERS = 4

/**
 * The board, made 2 layers, as one of four, to show the colours of the layers inside:
 * of the traces underneath, a third go on each of them by turns, and the rest stay; and
 * what is poured over its top is poured over each of the others as well, for the colour
 * of each layer's pour to be seen. It is not a board that would work so, only one that
 * looks as one of four does.
 */
function fourLayered(board: Circuit): Circuit {
  let trace = 0
  const moved = (layer: unknown, to: string) =>
    layer === "bottom" ? to : layer
  const poured: Circuit = board.flatMap((element) =>
    element.type === "pcb_copper_pour" && element.layer === "top"
      ? ["inner1", "inner2", "bottom"].map((layer) => ({
          ...element,
          pcb_copper_pour_id: `${String(element.pcb_copper_pour_id)}-${layer}`,
          layer,
        }))
      : []
  )
  return [...board, ...poured].map((element) => {
    if (element.type === "pcb_board")
      return { ...element, num_layers: SAMPLE_LAYERS }
    if (element.type !== "pcb_trace" || !Array.isArray(element.route))
      return element
    const to = ["inner1", "inner2", "bottom"][trace++ % 3]
    return {
      ...element,
      route: (element.route as Record<string, unknown>[]).map((point) => ({
        ...point,
        ...("layer" in point ? { layer: moved(point.layer, to) } : {}),
        ...("from_layer" in point
          ? { from_layer: moved(point.from_layer, to) }
          : {}),
        ...("to_layer" in point ? { to_layer: moved(point.to_layer, to) } : {}),
      })),
    }
  })
}

/** The board as tscircuit has it: loaded once, the first time it is wanted. */
let circuit: Promise<Circuit> | null = null
const loadCircuit = () =>
  (circuit ??= fetch(circuitUrl)
    .then((response) => response.json() as Promise<Circuit>)
    .then(fourLayered))

/** The board as tscircuit has it, once it is loaded. */
export function useSampleCircuit(): Circuit | null {
  const [had, setHad] = React.useState<Circuit | null>(null)
  React.useEffect(() => {
    let over = false
    void loadCircuit().then((loaded) => {
      if (!over) setHad(loaded)
    })
    return () => {
      over = true
    }
  }, [])
  return had
}

/** How big the board is, as PCB mode says under its name: "90 × 60 mm". */
export function sampleSize(board: Circuit | null): string | null {
  const said = board?.find((element) => element.type === "pcb_board")
  if (typeof said?.width !== "number" || typeof said.height !== "number")
    return null
  return `${Math.round(said.width)} × ${Math.round(said.height)} mm`
}

/** How much of the room it has the board fills, in 3D and drawn: as PCB mode has it. */
const FIT = 0.86

/**
 * What of the board's schematic is shown, which whole is wide and would be small: its
 * stepper drive, where the most is drawn, by the names of what is in it. And how much
 * room is left round that, in the schematic's own units.
 */
const SCHEMATIC_SHOWN = new Set([
  "U3",
  "U4",
  "U6",
  "U7",
  "U8",
  "J3",
  "J4",
  "J5",
  "J6",
  "Q1",
  "R16",
  "R17",
  "C7",
  "C8",
  "C11",
])
const AROUND = 1

/**
 * The part of a drawing of the board's schematic that SCHEMATIC_SHOWN is in, in its own
 * pixels, as a viewBox: by where each of those is in the schematic, and how the drawing
 * says the schematic is put on it. Null where it does not say.
 */
function schematicShown(board: Circuit, svg: SVGSVGElement): string | null {
  const said = /matrix\(([^)]+)\)/.exec(
    svg.getAttribute("data-real-to-screen-transform") ?? ""
  )
  if (!said) return null
  const [a, b, c, d, e, f] = said[1].split(",").map(Number)
  const shown = new Set(
    board.flatMap((element) =>
      element.type === "source_component" &&
      SCHEMATIC_SHOWN.has(String(element.name))
        ? [element.source_component_id]
        : []
    )
  )
  const box = new THREE.Box2()
  for (const element of board) {
    if (
      element.type !== "schematic_component" ||
      !shown.has(element.source_component_id)
    )
      continue
    const { center, size } = element as {
      center: { x: number; y: number }
      size: { width: number; height: number }
    }
    for (const [x, y] of [
      [center.x - size.width / 2 - AROUND, center.y - size.height / 2 - AROUND],
      [center.x + size.width / 2 + AROUND, center.y + size.height / 2 + AROUND],
    ])
      box.expandByPoint(new THREE.Vector2(a * x + c * y + e, b * x + d * y + f))
  }
  if (box.isEmpty()) return null
  const { x, y } = box.getSize(new THREE.Vector2())
  return `${box.min.x} ${box.min.y} ${x} ${y}`
}

/** The board's own colours changed, drawn again in them. */
function Painting({
  shown,
  colours,
}: {
  shown: ReturnType<typeof standing>
  colours: PcbColours
}) {
  const invalidate = useThree((state) => state.invalidate)
  React.useEffect(() => {
    shown.paint(colours)
    invalidate()
  }, [shown, colours, invalidate])
  return null
}

/** The camera where a model's is when it opens, the whole board in view. */
function Framing({ seen }: { seen: THREE.Box3 }) {
  const get = useThree((state) => state.get)
  const size = useThree((state) => state.size)
  React.useLayoutEffect(() => {
    const { camera, invalidate } = get()
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    const middle = seen.getCenter(new THREE.Vector3())
    const toward = toWorld(HOME_DIRECTION)
    camera.aspect = size.width / size.height
    camera.position.copy(middle).add(toward)
    camera.lookAt(middle)
    camera.updateMatrixWorld()
    // as near as each of the box's corners lets it, along the way it looks: a corner
    // so far across, and so far toward it, needs it that far off
    const high = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * FIT
    const wide = high * camera.aspect
    const corner = new THREE.Vector3()
    const turned = new THREE.Matrix4().extractRotation(
      camera.matrixWorldInverse
    )
    let away = 0
    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? seen.max.x : seen.min.x,
          i & 2 ? seen.max.y : seen.min.y,
          i & 4 ? seen.max.z : seen.min.z
        )
        .sub(middle)
        .applyMatrix4(turned)
      away = Math.max(
        away,
        corner.z + Math.abs(corner.x) / wide,
        corner.z + Math.abs(corner.y) / high
      )
    }
    camera.position.copy(middle).addScaledVector(toward, away)
    camera.near = away / 50
    camera.far = away * 4
    camera.updateProjectionMatrix()
    invalidate()
  }, [get, size, seen])
  return null
}

/** The board in 3D, lit as PCB mode lights it, from where a model is first seen. */
function InThreeD({
  board,
  colours,
}: {
  /** the board as tscircuit has it, once it is loaded: where its keep-outs are */
  board: Circuit | null
  colours: PcbColours
}) {
  const [shown, setShown] = React.useState<ReturnType<typeof standing> | null>(
    null
  )
  // (in the colours as they are when it is loaded: Painting has it in others)
  const first = React.useRef(colours)
  React.useEffect(() => {
    let over = false
    let had: ReturnType<typeof standing> | null = null
    void loadBoard(modelUrl).then((loaded) => {
      if (over) return disposeBoard(loaded)
      had = standing(loaded, first.current)
      setShown(had)
    })
    return () => {
      over = true
      had?.dispose()
    }
  }, [])
  if (!shown) return null
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: FOV }}
      // (it is drawn scaled down to fit: sized by its own box, not as it is seen)
      resize={{ offsetSize: true }}
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#ffffff", "#7d828c", 0.7]} />
      <directionalLight position={[180, 320, 220]} intensity={1.7} />
      <directionalLight position={[-240, 160, -180]} intensity={0.55} />
      <primitive object={shown.holder} />
      <Framing seen={shown.seen} />
      <Painting shown={shown} colours={colours} />
      <KeepOuts shown={shown} circuit={board} />
    </Canvas>
  )
}

/**
 * The board drawn as tscircuit draws it, as it is made or as its schematic: as big as it
 * fits. While it is drawn again in other colours, it stays as it was.
 */
function Drawn({
  board,
  as,
  colours,
  dark,
  ground,
  layer,
}: {
  board: Circuit
  as: "pcb" | "schematic"
  colours: PcbColours
  dark: boolean
  ground: string
  /** which of its layers of copper is drawn, the top's 1, as PCB mode draws it */
  layer: number
}) {
  const markup = useDrawn(
    board,
    as,
    colours,
    dark,
    ground,
    as === "pcb" ? copperLayerOf(layer, SAMPLE_LAYERS) : "top"
  )
  const holder = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const held = holder.current
    if (!held || !markup) return
    const read = readDrawing(markup)
    if (!read) return
    read.svg.setAttribute(
      "viewBox",
      (as === "schematic" && schematicShown(board, read.svg)) ||
        `0 0 ${read.width} ${read.height}`
    )
    held.replaceChildren(read.svg)
  }, [markup, as, board])
  // (another way of drawing it starts afresh)
  React.useEffect(() => holder.current?.replaceChildren(), [as])
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        ref={holder}
        style={{ width: `${FIT * 100}%`, height: `${FIT * 100}%` }}
      />
    </div>
  )
}

/**
 * The board, the way it is looked at, in a theme's colours for it: on the view's ground
 * (`ground`), which shows through it where it is drawn as it is made.
 */
export function SampleBoard({
  as,
  layer,
  colours,
  dark,
  ground,
}: {
  as: BoardAs
  /** which of its layers of copper is drawn, in the technical view: the top's 1 */
  layer: number
  colours: PcbColours
  dark: boolean
  ground: string
}) {
  const board = useSampleCircuit()
  if (as === "3d") return <InThreeD board={board} colours={colours} />
  if (!board) return null
  return (
    <Drawn
      board={board}
      as={as}
      colours={colours}
      dark={dark}
      ground={ground}
      layer={layer}
    />
  )
}
