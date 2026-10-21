// The handle of a section, where it cuts: what the cut is pushed through the model by,
// and tilted by. It is drawn the same size on the screen wherever the cut is, and over
// everything, so that it can always be got at. Every line of it has an edge of the other
// shade, so that it shows on whatever of the model it lies over, light or dark.
import * as React from "react"
import * as THREE from "three"
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { calculateScaleFactor, Edges, Line } from "@react-three/drei"

import type { Vec3 } from "@shared/api"
import type { ThemeColors } from "@/lib/css-color"
import { nearestOn } from "@/lib/cuts"
import type { Turn } from "@/lib/orient"
import type { Section } from "@/lib/store"
import { bridge } from "./bridge"
import { dragAlong, seenAs } from "./drag"
import { EDGE } from "./paint"
import { stillAway, useCutsChosen, type PutAway } from "./put-away"

/** How long the arrow is on the screen, in pixels. The rest is in parts of that. */
const SIZE = 78
const LINE = 3
/** How wide the faint rings are drawn, in pixels. */
const RING_LINE = 1.25
/** Drawn after everything else, and whatever is in front of it. */
const OVER = { depthTest: false, transparent: true, renderOrder: 20 }
/** Its edges are drawn just before it, all of them: none lies over a line of the handle. */
const UNDER = { ...OVER, renderOrder: OVER.renderOrder - 1 }
/** How wide the edge round each line and arrowhead is, in pixels. */
const EDGED = 1.5
/** How far out from the middle the tilts are drawn. */
const RING = 0.65
/** The part of each ring that is taken hold of, in degrees round it. */
const ARC = { from: 24, to: 66 }
const HEAD = { length: 0.17, radius: 0.06 }
/** How thick the handle is to the pointer, which is thicker than it is to the eye. */
const GRIP = 0.09
/** The tip of the arrow: the one part of the handle that says which way is which. */
const TIP = "#e5484d"
/** With Shift held, a tilt goes by steps of this many degrees. */
const NOTCH = 10
const NOT_PICKED = () => {}

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
/** A tilt is about one of the two directions that lie in the cut: the ring it is drawn
 *  as runs from `from` round to `to`, the way a turn about `about` goes. */
const TILTS = [
  { about: X, from: Y, to: Z },
  { about: Y, from: Z, to: X },
]

type Moved = { position: Vec3; turn: Turn }
type Press = ThreeEvent<PointerEvent>
/** What the scene can do with the handle from outside it. */
export type HandleControls = { putAway: () => void }

/** The shade the handle is edged in: dark round a light handle, light round a dark one. */
const edgeOf = (colors: ThemeColors) => (colors.dark ? EDGE : "#ffffff")

/** A line of the handle, with its edge. */
function Stroke({
  points,
  color,
  edge,
  width,
}: {
  points: THREE.Vector3[] | [number, number, number][]
  color: THREE.ColorRepresentation
  edge: string
  width: number
}) {
  return (
    <>
      <Line
        points={points}
        color={edge}
        lineWidth={width + 2 * EDGED}
        raycast={NOT_PICKED}
        {...UNDER}
      />
      <Line
        points={points}
        color={color}
        lineWidth={width}
        raycast={NOT_PICKED}
        {...OVER}
      />
    </>
  )
}

/**
 * One of the faint rings, with its edge. It is see-through, and a line that is would
 * show every joint in it, where one stretch lies over the next: so it is a hoop, which
 * is the same all the way round. `about` is what it goes round.
 */
function Hoop({
  about,
  color,
  edge,
  opacity,
}: {
  about: THREE.Vector3
  color: THREE.ColorRepresentation
  edge: string
  opacity: number
}) {
  const turned = React.useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(Z, about),
    [about]
  )
  const thick = RING_LINE / 2 / SIZE
  return (
    <>
      <mesh
        quaternion={turned}
        renderOrder={UNDER.renderOrder}
        raycast={NOT_PICKED}
      >
        <torusGeometry args={[RING, thick + EDGED / SIZE, 8, 96]} />
        <meshBasicMaterial
          color={edge}
          opacity={opacity}
          depthTest={false}
          transparent
        />
      </mesh>
      <mesh
        quaternion={turned}
        renderOrder={OVER.renderOrder}
        raycast={NOT_PICKED}
      >
        <torusGeometry args={[RING, thick, 8, 96]} />
        <meshBasicMaterial
          color={color}
          opacity={opacity}
          depthTest={false}
          transparent
        />
      </mesh>
    </>
  )
}

/** An arrowhead of the handle, with its edge: the same again behind it, a little larger. */
function Head({
  radius,
  length,
  color,
  edge,
  ...placed
}: {
  radius: number
  length: number
  color: THREE.ColorRepresentation
  edge: string
  position: THREE.Vector3 | [number, number, number]
  quaternion?: THREE.Quaternion
  rotation?: [number, number, number]
}) {
  const by = EDGED / SIZE
  return (
    <>
      <mesh {...placed} renderOrder={UNDER.renderOrder} raycast={NOT_PICKED}>
        <coneGeometry args={[radius + by, length + 2 * by, 20]} />
        <meshBasicMaterial color={edge} depthTest={false} transparent />
      </mesh>
      <mesh {...placed} renderOrder={OVER.renderOrder} raycast={NOT_PICKED}>
        <coneGeometry args={[radius, length, 20]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
    </>
  )
}

/** Somewhere round a ring, in the handle's own measure. */
const round = (tilt: (typeof TILTS)[number], degrees: number) => {
  const angle = THREE.MathUtils.degToRad(degrees)
  return new THREE.Vector3()
    .addScaledVector(tilt.from, Math.cos(angle) * RING)
    .addScaledVector(tilt.to, Math.sin(angle) * RING)
}
/** The way the ring is going there: the way a turn carries a point on it. */
const onward = (tilt: (typeof TILTS)[number], degrees: number) => {
  const angle = THREE.MathUtils.degToRad(degrees)
  return new THREE.Vector3()
    .addScaledVector(tilt.from, -Math.sin(angle))
    .addScaledVector(tilt.to, Math.cos(angle))
}

/**
 * Taking hold of a piece of the handle and dragging it. `begin` is told where it was
 * taken hold of, and gives back what to do as the pointer moves: it is told how far the
 * pointer has gone since, in pixels. `end` is told when it is let go of.
 */
function useGrip(
  begin: (
    press: Press,
    size: { width: number; height: number }
  ) => (dx: number, dy: number, press: Press) => void,
  end: () => void
) {
  const get = useThree((state) => state.get)
  const [over, setOver] = React.useState(false)
  const [holding, setHolding] = React.useState(false)
  const held = React.useRef<{
    x: number
    y: number
    move: (dx: number, dy: number, press: Press) => void
  } | null>(null)
  const canvas = (press: Press) => press.nativeEvent.target as HTMLElement
  return {
    over: over || holding,
    grip: {
      onPointerOver: (press: Press) => {
        press.stopPropagation()
        setOver(true)
      },
      onPointerOut: (press: Press) => {
        setOver(false)
        if (!held.current) canvas(press).style.cursor = ""
      },
      onPointerDown: (press: Press) => {
        press.stopPropagation()
        held.current = {
          x: press.nativeEvent.clientX,
          y: press.nativeEvent.clientY,
          move: begin(press, get().size),
        }
        setHolding(true)
        canvas(press).style.cursor = "grabbing"
        // not the moment to turn the view, or to pick the part behind
        bridge.handling = true
        const { controls } = get()
        if (controls)
          (controls as unknown as { enabled: boolean }).enabled = false
        ;(press.target as Element).setPointerCapture(press.pointerId)
      },
      onPointerMove: (press: Press) => {
        if (!held.current) {
          canvas(press).style.cursor = "grab"
          return
        }
        press.stopPropagation()
        held.current.move(
          press.nativeEvent.clientX - held.current.x,
          press.nativeEvent.clientY - held.current.y,
          press
        )
      },
      onPointerUp: (press: Press) => {
        if (!held.current) return
        press.stopPropagation()
        held.current = null
        setHolding(false)
        canvas(press).style.cursor = ""
        const { controls } = get()
        if (controls)
          (controls as unknown as { enabled: boolean }).enabled = true
        // the click that ends the drag is still on its way
        setTimeout(() => {
          bridge.handling = false
        }, 0)
        ;(press.target as Element).releasePointerCapture(press.pointerId)
        end()
      },
    },
  }
}

type Piece = {
  section: Section
  /** the handle as it stands in the scene: where it is, and how it is turned */
  frame: React.RefObject<THREE.Group | null>
  colors: ThemeColors
  onChange: (moved: Moved) => void
  /** the pointer has come onto this piece (1), or has gone from it and let go of it (-1) */
  onLit: (by: 1 | -1) => void
  /** this piece has been let go of */
  onLetGo: () => void
}

/** Tells the handle while one of its pieces is under the pointer, or held. */
function useLit(over: boolean, onLit: Piece["onLit"]) {
  React.useEffect(() => {
    if (!over) return
    onLit(1)
    return () => onLit(-1)
  }, [over, onLit])
}

/** The arrow: drag it to push the cut through the model, along the way it faces. */
function Push({ section, frame, colors, onChange, onLit, onLetGo }: Piece) {
  const { over, grip } = useGrip((press, size) => {
    const standing = frame.current!.matrixWorld
    const along = dragAlong(
      press.camera,
      size,
      new THREE.Vector3().setFromMatrixPosition(standing),
      new THREE.Vector3().setFromMatrixColumn(standing, 2).normalize()
    )
    const from = new THREE.Vector3(...section.position)
    const way = Z.clone().applyQuaternion(new THREE.Quaternion(...section.turn))
    return (dx, dy) =>
      onChange({
        position: from.clone().addScaledVector(way, along(dx, dy)).toArray(),
        turn: section.turn,
      })
  }, onLetGo)
  useLit(over, onLit)
  const shaft = 1 - HEAD.length * 1.2
  const edge = edgeOf(colors)
  return (
    <>
      <Stroke
        points={[
          [0, 0, 0],
          [0, 0, shaft],
        ]}
        color={over ? colors.section : colors.foreground}
        edge={edge}
        width={LINE}
      />
      <Head
        position={[0, 0, shaft + (HEAD.length * 1.2) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        radius={HEAD.radius * 1.2}
        length={HEAD.length * 1.2}
        color={TIP}
        edge={edge}
      />
      <mesh
        position={[0, 0, 0.5]}
        rotation={[Math.PI / 2, 0, 0]}
        visible={false}
        {...grip}
      >
        <cylinderGeometry args={[GRIP, GRIP, 1, 8]} />
      </mesh>
    </>
  )
}

/**
 * One of the two tilts: a faint ring to show the turn it makes, and on it an arc with an
 * arrowhead at each end, which is what is dragged, either way round.
 */
function Tilt({
  tilt,
  section,
  frame,
  sized,
  stands,
  colors,
  onChange,
  onLit,
  onHold,
  onLetGo,
}: Piece & {
  tilt: (typeof TILTS)[number]
  /** the part of the handle that is kept the same size on the screen */
  sized: React.RefObject<THREE.Group | null>
  /** where the handle stands on the cut, which is what the cut is tilted about */
  stands: Vec3
  /** the handle is to stand here while it is tilted (or, with null, as it would) */
  onHold: (at: Vec3 | null) => void
}) {
  const letGo = () => {
    onHold(null)
    onLetGo()
  }
  const { over, grip } = useGrip((press, size) => {
    onHold(stands)
    const standing = frame.current!.matrixWorld
    const middle = new THREE.Vector3().setFromMatrixPosition(standing)
    const stood = (way: THREE.Vector3) =>
      way.clone().transformDirection(standing)
    const [from, to] = [stood(tilt.from), stood(tilt.to)]
    const out = press.point.clone().sub(middle)
    const angle = Math.atan2(out.dot(to), out.dot(from))
    const radius = RING * sized.current!.scale.x
    // It turns as far as the pointer goes the way the ring runs on the screen where it
    // was taken hold of, as if that were seen from the side: a ring seen edge-on then
    // turns no faster under the hand than one seen full on.
    const seen = seenAs(
      press.camera,
      size,
      middle
        .clone()
        .addScaledVector(from, Math.cos(angle) * radius)
        .addScaledVector(to, Math.sin(angle) * radius),
      from
        .clone()
        .multiplyScalar(-Math.sin(angle))
        .addScaledVector(to, Math.cos(angle))
    )
    const turn = new THREE.Quaternion(...section.turn)
    return (dx, dy, moved) => {
      if (!seen) return
      let by = (dx * seen.direction.x + dy * seen.direction.y) / (RING * SIZE)
      if (moved.shiftKey) {
        const notch = THREE.MathUtils.degToRad(NOTCH)
        by = Math.round(by / notch) * notch
      }
      const next = turn
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(tilt.about, by))
      onChange({
        position: stands,
        turn: [next.x, next.y, next.z, next.w],
      })
    }
  }, letGo)

  const drawn = React.useMemo(() => {
    const between = (from: number, to: number, steps: number) =>
      Array.from({ length: steps + 1 }, (_, step) =>
        round(tilt, from + ((to - from) * step) / steps)
      )
    const head = (degrees: number, forward: boolean) => {
      const way = onward(tilt, degrees).multiplyScalar(forward ? 1 : -1)
      return {
        position: round(tilt, degrees).addScaledVector(way, HEAD.length / 2),
        quaternion: new THREE.Quaternion().setFromUnitVectors(Y, way),
      }
    }
    return {
      arc: between(ARC.from, ARC.to, 16),
      heads: [head(ARC.from, false), head(ARC.to, true)],
      // what the pointer takes hold of: the arc and its heads, and a little to spare
      grip: new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(between(ARC.from - 20, ARC.to + 20, 12)),
        12,
        GRIP,
        6
      ),
    }
  }, [tilt])
  React.useEffect(() => () => drawn.grip.dispose(), [drawn])

  useLit(over, onLit)
  const color = over ? colors.section : colors.foreground
  const edge = edgeOf(colors)
  return (
    <>
      <Hoop
        about={tilt.about}
        color={color}
        edge={edge}
        opacity={over ? 0.55 : 0.3}
      />
      <Stroke points={drawn.arc} color={color} edge={edge} width={LINE} />
      {drawn.heads.map((head, index) => (
        <Head
          key={index}
          position={head.position}
          quaternion={head.quaternion}
          radius={HEAD.radius}
          length={HEAD.length}
          color={color}
          edge={edge}
        />
      ))}
      <mesh geometry={drawn.grip} visible={false} {...grip} />
    </>
  )
}

/**
 * The section's handle: an arrow to push the cut through the model, and two rings to
 * tilt it about the two directions that lie in it. With it, a faint square where the cut
 * is, so that its tilt can be read at a glance: for as long as the pointer is on the
 * handle, or has hold of it, and not otherwise, when it would only be in the way of the
 * model.
 *
 * It stands on the cut where that comes nearest the middle of what is on show of the
 * model, which is what it is there to cut open: where some of the model is put out of
 * sight, it keeps to the rest. It tilts the cut about where it stands.
 *
 * Once it has been dragged and let go of, the cut is where it was wanted, and the handle
 * goes, for as long as the cut stays there: it stands in the middle of what was cut open
 * to be looked at. A click on nothing puts it away as well. A cut chosen afresh brings
 * it back (S again, an axis, Reset cut), even one where the cut already was (put-away.ts).
 */
export function SectionHandle({
  section,
  middle,
  reach,
  colors,
  onChange,
  ref,
}: {
  section: Section
  /** the middle of what is on show of the model */
  middle: Vec3
  /** how far what is on show reaches from its middle */
  reach: number
  colors: ThemeColors
  onChange: (moved: Moved) => void
  ref?: React.Ref<HandleControls>
}) {
  const frame = React.useRef<THREE.Group>(null)
  const sized = React.useRef<THREE.Group>(null)
  // Held where it stood while the cut is tilted about there: the place nearest the
  // middle would go on moving as the cut turned, and the ring with it, under the hand.
  const [held, setHeld] = React.useState<Vec3 | null>(null)
  const stands = React.useMemo(
    () => held ?? nearestOn(section, middle),
    [held, section, middle]
  )
  const matrix = React.useMemo(
    () =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(...stands),
        new THREE.Quaternion(...section.turn),
        new THREE.Vector3(1, 1, 1)
      ),
    [stands, section.turn]
  )

  const at = React.useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    if (!frame.current || !sized.current) return
    sized.current.scale.setScalar(
      calculateScaleFactor(
        frame.current.getWorldPosition(at),
        SIZE,
        camera,
        size
      )
    )
  })

  // how many of its pieces are under the pointer, or held
  const [lit, setLit] = React.useState(0)
  const onLit = React.useCallback(
    (by: 1 | -1) => setLit((pieces) => pieces + by),
    []
  )

  // where the cut was last dragged to, until it is let go of; and where it was let go,
  // or put away, with how many cuts had been chosen afresh by then
  const dragged = React.useRef<Moved | null>(null)
  const [away, setAway] = React.useState<PutAway | null>(null)
  const chosen = useCutsChosen()
  const moved = React.useCallback(
    (to: Moved) => {
      dragged.current = to
      onChange(to)
    },
    [onChange]
  )
  const onLetGo = React.useCallback(() => {
    // taken hold of and let go without moving it, it stays
    if (dragged.current) setAway({ cut: dragged.current, chosen })
    dragged.current = null
  }, [chosen])
  React.useImperativeHandle(
    ref,
    () => ({
      putAway: () =>
        setAway({
          cut: { position: section.position, turn: section.turn },
          chosen,
        }),
    }),
    [section.position, section.turn, chosen]
  )
  if (stillAway(away, section, chosen)) return null

  const piece = { section, frame, colors, onChange: moved, onLit, onLetGo }
  return (
    <group ref={frame} matrix={matrix} matrixAutoUpdate={false}>
      <mesh visible={lit > 0} renderOrder={4} raycast={NOT_PICKED}>
        <planeGeometry args={[reach * 0.85, reach * 0.85]} />
        <meshBasicMaterial
          color={colors.section}
          transparent
          opacity={0.05}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
        <Edges color={colors.section} lineWidth={1} />
      </mesh>
      <group ref={sized}>
        <Push {...piece} />
        {TILTS.map((tilt, index) => (
          <Tilt
            key={index}
            tilt={tilt}
            sized={sized}
            stands={stands}
            onHold={setHeld}
            {...piece}
          />
        ))}
      </group>
    </group>
  )
}
