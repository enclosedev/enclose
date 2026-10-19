// The camera: how it moves under the hand, and the set views it can be sent to.
//
// There are two cameras. The one a model opens with has a lens: things further away
// are smaller, which is how an object looks. The flat views - front, top, from the end
// of an axis - use one with no lens, so that a side is seen exactly side-on, with
// nothing of the top showing. Getting from one to the other is done by narrowing the
// lens while standing further back, until it is so narrow that taking it away changes
// nothing.
//
// The lens narrows and opens with the turn of the camera, not with the clock: over the
// last of the turn into a flat view, and over the first of the turn out of one. A change
// of perspective is easy to see in a view that is otherwise still, and hard to see in
// one that is turning anyway.
//
// The controls keep the camera the right way up, and so stop it straight above the model
// and straight below. Here it goes on over the top instead, and comes down the far side
// with the model upside down. That is done by having the controls carry on from the
// opposite side, which leaves the picture turned half way round about its middle, and
// turning the picture back: the two cancel, and nothing is seen to jump.
//
// Set in a reference scene, a model stands on something that stands on the ground, and
// the camera keeps above that ground, as an eye would. It goes down round what it looks
// at as far as the ground and stops there; what it looks at stays above the ground too;
// and it is not sent to the view from underneath.
import * as React from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { CameraControls, CameraControlsImpl } from "@react-three/drei"

import type { Vec3 } from "@shared/api"
import { dragOf, type Button } from "@/lib/navigation"
import {
  carriedRound,
  facingFrom,
  lowestPolar,
  nearestTurn,
  viewFrom,
  type Axis,
  type Sign,
} from "@/lib/orient"
import { MAC } from "@/lib/platform"
import { usePreferences } from "@/lib/preferences"
import { SCROLL_PAUSE, scrollSource } from "@/lib/scroll"
import { bridge, publishOrientation } from "./bridge"

// The model is Z-up; three.js is Y-up. Everything inside the root group is in model mm.
export const MODEL_TO_WORLD: [number, number, number] = [-Math.PI / 2, 0, 0]
const MODEL_TO_WORLD_TURN = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(...MODEL_TO_WORLD)
)
export const toWorld = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.z, -v.y)

export const FOV = 30
const HALF_FOV = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
/** How close the camera gets to what it looks at, and how far, in model radii. */
export const REACH = { nearest: 0.02, furthest: 40 }

/** Where the camera sits when a model opens: front right, looking down on it. */
export const HOME_DIRECTION = new THREE.Vector3(0.5, -0.62, 0.6).normalize()
/** How hard a wheel zooms, against the controls' own pace; and a pinch, against a wheel. */
const ZOOM_SPEED = 3
export const PINCH = 2.25

/**
 * How much a flat view's scale changes by for a scroll of `delta` pixels, at the zoom
 * speed the settings have: what drawings that are zoomed as a flat view is go by too.
 */
export const flatZoom = (delta: number, zoomSpeed: number) =>
  Math.pow(0.95, (delta / 10) * ZOOM_SPEED * zoomSpeed)
/**
 * How far the view turns, in radians a pixel: under a drag on the axes in the corner,
 * which are small, and under fingers moving across a trackpad.
 */
const TURN = { axes: 0.012, swipe: 0.006 }
/** How far a swipe has to go, in pixels, before it turns a flat view. */
const GRIP = 16
/**
 * Seconds for the camera to settle: quick behind a zoom, unhurried for a turn, a little
 * brisker for a flight to a set view.
 */
const SMOOTH = { zoom: 0.1, turn: 0.3, flight: 0.2 }
/** How narrow the lens gets on the way into a flat view: at this, losing it is not seen. */
const FLATTEN = 24
/** The least of the lens there ever is, as a share of the whole of it. */
const FLATTEST = 1 / FLATTEN
/** How far the camera turns, in radians, while the lens opens or closes. */
const GIVE = Math.PI / 6
/** How near a set view, in radians, counts as there. */
const THERE = 0.004
/** The longest step of time, in seconds, that a single frame moves the camera by. */
const STEP = 1 / 30
/**
 * The camera going round a model by itself: how fast, in radians a second (once round
 * in some twenty of them), and the seconds it takes to get up to that.
 */
const CIRCLE = { rate: 0.3, ease: 1.2 }
/** Seconds for a picture that is upside down to come most of the way upright again. */
const RIGHTING = 0.1
/** Room left around the model when a flat view is fitted to it. */
const MARGIN = 1.35
/** The least of the view's width, in pixels, for a part to be shown beside what covers the rest. */
const LEAST_CLEAR = 240
/** And when the view it opens with is: less, since that one is seen from a corner. */
const HOME_MARGIN = 1.18
/**
 * How big a model is seen while Claude looks it over, and the camera goes round it by
 * itself, as a share of how big it opens: the camera stands further back to watch. So
 * that when Claude is through, and the camera goes back to where a model opens, the view
 * comes in to the model as it does.
 */
const WATCHING = 0.75

const { ACTION } = CameraControlsImpl
/**
 * What a drag is to the controls, by what it does to the view. One that zooms is not
 * theirs: it is passed on as so many turns of a wheel, so that every zoom is of the one
 * kind, with the lens and without it.
 */
const DRAGGED = {
  turn: ACTION.ROTATE,
  pan: ACTION.TRUCK,
  zoom: ACTION.NONE,
} as const
/** How far a wheel would have to scroll to zoom as a drag does, for each pixel of the drag. */
const DRAG_ZOOM = 0.2

/**
 * What a turn of the view goes about, as the user has it: the middle of what is picked
 * out; or the place on the model under the pointer, `at`, where there is a pointer. Null
 * for what the camera looks at, which is what the controls turn it about themselves.
 */
function turnedAbout(
  at: { clientX: number; clientY: number } | null,
  /** it is the model's view that is turned: what is picked out, and under the pointer, are its */
  bridged = true
): THREE.Vector3 | null {
  if (!bridged) return null
  const { pivot } = usePreferences.getState()
  if (pivot === "selection") {
    const box = bridge.picked?.()
    return box ? toWorld(box.getCenter(new THREE.Vector3())) : null
  }
  if (pivot === "pointer" && at)
    return bridge.under?.(at.clientX, at.clientY) ?? null
  return null
}

/** What ties the lens to the turn of the camera, while something does. */
type Tie =
  | {
      /** on the way to a flat view: the lens closes as the camera nears it */
      kind: "closing"
      turn: number
      polar: number
      toward: THREE.Vector3
      /** the share of the lens there was to begin with */
      share: number
      /** the turn, in radians, that the closing is spread over */
      over: number
      /** the scale the view is to end at, in pixels per mm */
      fit: number
    }
  | {
      /** turning away from where the lens was narrowed: it opens as the camera goes */
      kind: "opening"
      from: THREE.Vector3
      share: number
      over: number
    }

/** Everything that moves the camera other than the hand directly on the view. */
function direct(stage: {
  controls: CameraControlsImpl
  lens: THREE.PerspectiveCamera
  flat: THREE.OrthographicCamera
  box: () => THREE.Box3
  /**
   * How high the ground is that the camera keeps above, in the model's frame: what a
   * scene the model is set in stands on. Null where the model is set in none.
   */
  ground: () => number | null
  size: () => { width: number; height: number }
  /** say which way the camera faces, for the axes in the corner: the model's view does */
  publish: boolean
  /** draw with this camera from now on */
  show: (camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) => void
  redraw: () => void
}) {
  const { controls, lens, flat } = stage
  let mode: "lens" | "flat" = "lens"
  /** how many times narrower than itself the lens is: 1 when it is whole */
  let narrowing = 1
  let tie: Tie | null = null
  /** true until the user moves the camera themselves */
  let atHome = true
  /** how big the model is seen from where the camera stands, as a share of how it opens */
  let seen = 1
  /** counts the times the camera was sent to a set view */
  let sent = 0
  /** the scale the flat view is at, or on its way to, in pixels per mm */
  let goal = 1
  /**
   * How far the picture is turned about its middle, in radians, and how far it is to be:
   * nothing the right way up, half a turn upside down.
   */
  let roll = 0
  let rollTo = 0
  /** the turn last given to the camera, to know when it has to be given again */
  let rolled = 0
  /** the part the camera was brought to, as the box it fills in the model's frame */
  let subject: THREE.Box3 | null = null
  /**
   * What the camera was looking at before it was brought to a part, and at what scale;
   * and the way it faced, if that was the view the model opened with.
   */
  let before: {
    target: THREE.Vector3
    scale: number
    home: { theta: number; phi: number } | null
  } | null = null
  /**
   * What the camera was looking at before the model was set in something to be seen
   * beside, at what scale and from which side: where it comes back in to when that is
   * taken away.
   */
  let outside: {
    target: THREE.Vector3
    scale: number
    theta: number
    phi: number
  } | null = null
  /** whether the model is set in such a thing, as far as the camera has been told */
  let surrounded = false
  /** the ground that what the camera looks at was last kept above; null with none */
  let grounded: number | null = null
  /** the point a drag that turns the view has hold of it by, and turns it about */
  let held: THREE.Vector3 | null = null

  /**
   * How far down round what it looks at the camera can be, as the angle from straight
   * above, without being below the ground: all the way, where there is no ground. With
   * no lens there is nowhere that the camera is, only a way that it looks, and it sees
   * the ground from underneath as soon as it looks up at all.
   */
  const lowest = (target: THREE.Vector3, distance: number) => {
    const ground = stage.ground()
    if (ground === null) return Math.PI
    if (mode === "flat") return Math.PI / 2
    return lowestPolar(target.y - ground, distance)
  }

  const reach = () => stage.box().getSize(new THREE.Vector3()).length() / 2
  /** What the set views frame: the part the camera was brought to, or else all of it. */
  const framed = () => subject ?? stage.box()
  const middle = () => toWorld(framed().getCenter(new THREE.Vector3()))
  /** Which way the camera is from what it looks at. */
  const facing = () =>
    new THREE.Vector3().setFromSphericalCoords(
      1,
      controls.polarAngle,
      controls.azimuthAngle
    )
  /** A set view is seen the right way up: the picture turns back on the way there. */
  const upright = (animate: boolean) => {
    // the short way round, whichever way up it is now
    roll -= Math.round(roll / (2 * Math.PI)) * 2 * Math.PI
    rollTo = 0
    if (!animate) roll = 0
  }
  const ease = (share: number) => THREE.MathUtils.smoothstep(share, 0, 1)
  /** How far back the whole lens has to be to show things at a scale, in pixels per mm. */
  const distanceAt = (scale: number) =>
    stage.size().height / (2 * scale * HALF_FOV)
  /** The scale that what the camera looks at is shown at now, in pixels per mm. */
  const scaleNow = () =>
    mode === "flat"
      ? flat.zoom
      : (stage.size().height * narrowing) / (2 * controls.distance * HALF_FOV)
  /** Where the camera will be from what it looks at, once it has come to rest. */
  const heading = () => controls.getSpherical(new THREE.Spherical(), true)
  /** And the scale that will be shown at then. */
  const scaleThen = () => {
    if (tie?.kind === "closing") return tie.fit
    if (mode === "flat") return goal
    return (stage.size().height * narrowing) / (2 * heading().radius * HALF_FOV)
  }
  /** Go to showing what the camera looks at at a scale, with the lens or without. */
  const scaleTo = (scale: number) => {
    // a flight to a flat view ends at the scale it was given: it ends at this one now
    if (tie?.kind === "closing") tie.fit = scale
    if (mode === "flat") {
      goal = THREE.MathUtils.clamp(scale, controls.minZoom, controls.maxZoom)
      void controls.zoomTo(goal, true)
    } else {
      void controls.dollyTo(distanceAt(scale) * narrowing, true)
    }
  }

  /**
   * What it takes to have all of a box in the view from a side, its middle in the middle
   * of the view: how far back the whole lens has to stand, and the scale that does it
   * with no lens. Every corner of the box is in the view, whatever its shape: a cube
   * needs more room than a slab does.
   */
  const fitting = (
    box: THREE.Box3,
    turn: number,
    polar: number,
    ratio: number,
    margin: number
  ) => {
    const target = toWorld(box.getCenter(new THREE.Vector3()))
    const toward = new THREE.Vector3().setFromSphericalCoords(1, polar, turn)
    // from the turn, not from `toward`: straight above and below it is still a direction
    const right = new THREE.Vector3(Math.cos(turn), 0, -Math.sin(turn))
    const up = toward.clone().cross(right)
    const corner = new THREE.Vector3()
    let distance = 0
    let across = 0
    let upward = 0
    for (let i = 0; i < 8; i++) {
      corner
        .copy(
          toWorld(
            new THREE.Vector3(
              i & 1 ? box.max.x : box.min.x,
              i & 2 ? box.max.y : box.min.y,
              i & 4 ? box.max.z : box.min.z
            )
          )
        )
        .sub(target)
      // how near the camera the corner is, and how far off the middle of the view
      const near = corner.dot(toward)
      const aside = Math.abs(corner.dot(right)) * margin
      const above = Math.abs(corner.dot(up)) * margin
      distance = Math.max(
        distance,
        near + aside / (HALF_FOV * ratio),
        near + above / HALF_FOV
      )
      across = Math.max(across, aside)
      upward = Math.max(upward, above)
    }
    const { height } = stage.size()
    const scale = Math.min((height * ratio) / across, height / upward) / 2
    return { target, distance, scale }
  }

  /** Have all of a box in the view, from the side the camera is on already. */
  const takeIn = (box: THREE.Box3) => {
    const { theta, phi } = heading()
    const { width, height } = stage.size()
    const { target, distance, scale } = fitting(
      box,
      theta,
      phi,
      width / height,
      HOME_MARGIN
    )
    void controls.moveTo(target.x, target.y, target.z, true)
    if (mode === "flat" || tie?.kind === "closing") scaleTo(scale)
    else void controls.dollyTo(distance * narrowing, true)
  }

  /**
   * Bring the camera to what fills a box, from the side it is on already: it goes to the
   * middle of the view and fills it. `covered` is how much of the view's right side, in
   * pixels, something lies over: it goes to the middle of what is left, and fills that.
   */
  const bringTo = (box: THREE.Box3, covered: number) => {
    const { theta, phi } = heading()
    const { width, height } = stage.size()
    // too little left of the view to show a part in: it has all of it after all
    const over = width - covered < LEAST_CLEAR ? 0 : Math.max(0, covered)
    const { target, distance, scale } = fitting(
      box,
      theta,
      phi,
      (width - over) / height,
      MARGIN
    )
    const flatly = mode === "flat" || tie?.kind === "closing"
    if (over > 0) {
      // The camera looks at a point to the right of the part, by half of what is
      // covered: that puts the part as far to the left of the middle of the view.
      // Right is as the picture has it, which may be turned on the way it looks.
      const toward = new THREE.Vector3().setFromSphericalCoords(1, phi, theta)
      const right = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta))
      const up = toward.cross(right)
      const shown = flatly ? scale : height / (2 * distance * HALF_FOV)
      target
        .addScaledVector(right, (Math.cos(rollTo) * over) / 2 / shown)
        .addScaledVector(up, (Math.sin(rollTo) * over) / 2 / shown)
    }
    void controls.moveTo(target.x, target.y, target.z, true)
    if (flatly) scaleTo(scale)
    else void controls.dollyTo(distance * narrowing, true)
  }

  /** How far the user may zoom, either way. */
  const limits = () => {
    const r = reach()
    if (mode === "flat") {
      controls.minZoom = distanceAt(1) / (r * REACH.furthest)
      controls.maxZoom = distanceAt(1) / (r * REACH.nearest)
      controls.minDistance = 0
      controls.maxDistance = Infinity
      return
    }
    controls.minZoom = 0.01
    controls.maxZoom = Infinity
    // a narrowed lens stands further back, by as much as it is narrowed
    controls.minDistance = r * REACH.nearest * narrowing
    controls.maxDistance = r * REACH.furthest * narrowing
  }

  /** Narrow the lens this many times, and stand back by as much: nothing changes size. */
  const lensTo = (next: number) => {
    if (next === narrowing) return
    const by = next / narrowing
    // where the camera is, and where a zoom still under way is taking it
    const settling = heading().radius
    narrowing = next
    limits()
    void controls.dollyTo(controls.distance * by, false)
    void controls.dollyTo(settling * by, true)
    void controls.zoomTo(next, false)
    stage.redraw()
  }

  /** Swap the narrowed lens for none, keeping everything the size it is. */
  const flatten = () => {
    const scale = scaleNow()
    const { width, height } = stage.size()
    const r = reach()
    Object.assign(flat, {
      left: -width / 2,
      right: width / 2,
      top: height / 2,
      bottom: -height / 2,
      near: -r * 50,
      far: r * 50,
    })
    mode = "flat"
    controls.camera = flat
    limits()
    void controls.dollyTo(r * 4, false)
    void controls.zoomTo(scale, false)
    // the controls only pass this on when they next update: `scaleNow` reads it before
    flat.zoom = scale
    goal = scale
    stage.show(flat)
  }

  /** From no lens to one so narrow that it looks the same. */
  const narrow = () => {
    if (mode !== "flat") return
    const distance = distanceAt(scaleNow())
    const { width, height } = stage.size()
    mode = "lens"
    narrowing = FLATTEN
    lens.aspect = width / height
    controls.camera = lens
    limits()
    void controls.zoomTo(FLATTEN, false)
    void controls.dollyTo(distance * FLATTEN, false)
    stage.show(lens)
  }

  /** The user is turning the view: a flight to a set view gives way to them. */
  const letGo = () => {
    if (tie?.kind !== "closing") return
    tie = {
      kind: "opening",
      from: facing(),
      share: mode === "flat" ? FLATTEST : 1 / narrowing,
      over: GIVE,
    }
  }

  limits()

  return {
    isFlat: () => mode === "flat",
    sends: () => sent,
    /** For a script checking the view: what the camera is doing, in numbers. */
    probe: () => ({
      // where the camera is this instant, not where it is headed
      eye: [facing().x, -facing().z, facing().y],
      flat: mode === "flat",
      lens: mode === "flat" ? 0 : 1 / narrowing,
      scale: scaleNow(),
      tie: tie?.kind ?? null,
      roll,
      turn: controls.camera.quaternion.toArray(),
      target: controls.getTarget(new THREE.Vector3(), false).toArray(),
      // where the last frame was drawn from, which the ground may have had a say in
      from: controls.camera.position.toArray(),
    }),

    /**
     * The view a model opens with, framing all of it: or from further back than that,
     * where the model is seen `small` times as big.
     */
    home(animate: boolean, ratio: number, small = 1) {
      ++sent
      seen = small
      const toward = toWorld(HOME_DIRECTION)
      const polar = Math.acos(toward.y)
      // stand back just far enough that all of what is framed is in the view
      const { target, distance } = fitting(
        framed(),
        Math.atan2(toward.x, toward.z),
        polar,
        ratio,
        HOME_MARGIN
      )
      narrow()
      // the lens opens over the first of the turn home, and is whole by the end of it
      const turn = facing().angleTo(toward)
      if (animate && narrowing > 1 && turn > THERE) {
        tie = {
          kind: "opening",
          from: facing(),
          share: 1 / narrowing,
          over: Math.min(GIVE, turn * 0.9),
        }
      } else {
        tie = null
        lensTo(1)
      }
      upright(animate)
      controls.smoothTime = SMOOTH.turn
      // the short way round: however many times the view has been turned about, it is
      // never more than half a turn from home
      void controls.rotateTo(
        nearestTurn(controls.azimuthAngle, Math.atan2(toward.x, toward.z)),
        polar,
        animate
      )
      void controls.moveTo(target.x, target.y, target.z, animate)
      void controls.dollyTo((distance / small) * narrowing, animate)
      atHome = true
      stage.redraw()
    },

    /**
     * What there is to see has changed all at once (see Rig's `refit`): frame it as the
     * model opens, where the camera has not been moved from that; or else take in what
     * there is, from the side the camera is on. Not while it is brought to a part, which
     * it stays with.
     */
    refit(ratio: number) {
      if (subject) return
      if (atHome) {
        this.home(true, ratio, seen)
        return
      }
      controls.smoothTime = SMOOTH.turn
      takeIn(stage.box())
      stage.redraw()
    },

    /** The view changed shape: keep the model framed, unless the user chose their own view. */
    reshape(ratio: number) {
      if (atHome && mode === "lens") this.home(false, ratio, seen)
    },

    /**
     * What there is to see has changed size: how far the camera may go from it, and how
     * much of the depth is drawn, are worked out from it afresh. The camera stays put.
     */
    resized() {
      limits()
      if (mode !== "flat") return
      const r = reach()
      flat.near = -r * 50
      flat.far = r * 50
      flat.updateProjectionMatrix()
    },

    /**
     * The model has been set in something far bigger than itself to be seen beside, a
     * reference scene, or taken out of it again: by now the stage's box is all there is
     * to see.
     *
     * Set in a scene it was not in (`fresh`), it is seen the way a model is when it
     * opens, whichever side it was being looked at from: all of the scene, from above
     * and in front. A scene is there to be taken in at a glance, and the side a part was
     * being looked at from, close to or from underneath, is seldom one to see it from.
     * Taken out, the camera goes back to what it was looking at before, from the side it
     * was on and as near as it was, if the view has not been turned since; turned, it
     * comes in to the model from the side it is now on.
     *
     * Where the scene is the same and there is only more in it to take in, or less, a
     * figure shown or hidden, the camera stands back or comes in from the side it is on.
     */
    surround(on: boolean, ratio: number, fresh: boolean) {
      controls.smoothTime = SMOOTH.turn
      const opening = atHome && mode === "lens" && tie === null
      const was = surrounded
      surrounded = on
      if (on && fresh) {
        // Where it comes back to: nowhere, from the view a model opens with or from
        // a flat one, which are views of the whole. Going from one scene to another,
        // it is still where it was before the first that it comes back to.
        if (!was) outside = null
        if (!was && !opening && mode === "lens" && tie === null) {
          const { theta, phi } = heading()
          outside = {
            target: controls.getTarget(new THREE.Vector3(), true),
            scale: scaleThen(),
            theta,
            phi,
          }
        }
        this.home(true, ratio, seen)
        return
      }
      if (opening) {
        if (!on && outside) {
          // not turned since it was set in the scene: back to where it was
          const { target, scale, theta, phi } = outside
          outside = null
          atHome = false
          void controls.rotateTo(
            nearestTurn(controls.azimuthAngle, theta),
            phi,
            true
          )
          void controls.moveTo(target.x, target.y, target.z, true)
          scaleTo(scale)
          stage.redraw()
          return
        }
        this.home(true, ratio, seen)
        return
      }
      // the view has been turned since: what there was to come back to is let go of
      if (!on) outside = null
      takeIn(on ? stage.box() : framed())
      stage.redraw()
    },

    /** Look at the model square-on from the end of one of its axes, flat and fitted. */
    lookFrom(axis: Axis, sign: Sign) {
      const { azimuth, polar } = viewFrom(axis, sign)
      // there is no looking up from under the ground
      if (stage.ground() !== null && polar > Math.PI / 2 + THERE) return
      const { width, height } = stage.size()
      // what of the model shows from there, and the scale at which it fits the view
      const extent = framed().getSize(new THREE.Vector3())
      const [across, up] =
        axis === "x"
          ? [extent.y, extent.z]
          : axis === "y"
            ? [extent.x, extent.z]
            : [extent.x, extent.y]
      const fit = Math.min(width / across, height / up) / MARGIN
      const target = middle()
      const turn = nearestTurn(controls.azimuthAngle, azimuth)
      const toward = new THREE.Vector3().setFromSphericalCoords(1, polar, turn)

      ++sent
      atHome = false
      upright(true)
      // the lens closes over the last of the turn; `tick` takes it away on arrival
      tie = {
        kind: "closing",
        turn,
        polar,
        toward,
        share: 1 / narrowing,
        over: Math.max(Math.min(GIVE, facing().angleTo(toward)), THERE),
        fit,
      }
      controls.smoothTime = SMOOTH.flight
      void controls.rotateTo(turn, polar, true)
      void controls.moveTo(target.x, target.y, target.z, true)
      if (mode === "flat") {
        // from one flat view to another there is no lens to bring back
        goal = fit
        void controls.zoomTo(fit, true)
      } else {
        void controls.dollyTo(distanceAt(fit) * narrowing, true)
      }
    },

    /**
     * Bring the camera to one part of the model, from the side it is on already: the part
     * goes to the middle of the view and fills it, and the set views frame it from then
     * on. With no part given, the camera goes back to what it was looking at before it
     * was brought to one, as near as it was then, still from the side it is on now.
     *
     * `covered` is how much of the view's right side, in pixels, something lies over:
     * the part goes to the middle of what is left, and fills that.
     */
    focus(box: THREE.Box3 | null, covered = 0) {
      if (box ? subject?.equals(box) : !subject) return
      controls.smoothTime = SMOOTH.turn
      const { theta, phi } = heading()
      if (!box) {
        subject = null
        if (!before) return
        const { target, scale, home } = before
        before = null
        // and that is the view the model opened with again, if it has not been turned
        atHome =
          home !== null &&
          mode === "lens" &&
          tie === null &&
          Math.abs(theta - home.theta) < THERE &&
          Math.abs(phi - home.phi) < THERE
        void controls.moveTo(target.x, target.y, target.z, true)
        scaleTo(scale)
        stage.redraw()
        return
      }
      // going from one part to another, it is still the first that it goes back from
      before ??= {
        target: controls.getTarget(new THREE.Vector3(), true),
        scale: scaleThen(),
        home: atHome ? { theta, phi } : null,
      }
      subject = box.clone()
      atHome = false
      bringTo(box, covered)
      stage.redraw()
    },

    /**
     * Bring the camera to what fills a box of the model as `focus` does, but for this
     * once: the set views go on framing what they did, and there is nothing to go back
     * to. Asked again of the same box, it goes there again, from wherever it was taken.
     */
    goTo(box: THREE.Box3, covered = 0) {
      controls.smoothTime = SMOOTH.turn
      atHome = false
      bringTo(box, covered)
      stage.redraw()
    },

    /**
     * Zoom a flat view by a scroll of `delta` pixels, keeping what is under the pointer
     * (given as -1..1 across and up the view) where it is. With no lens this is a change
     * of scale, like zooming a drawing: it is applied at once, each scroll event on top
     * of the last, so it is as strong as the same scroll is with the lens.
     */
    zoomFlat(delta: number, across: number, up: number) {
      const { width, height } = stage.size()
      const scale = THREE.MathUtils.clamp(
        goal * Math.pow(0.95, (delta / 10) * controls.dollySpeed),
        controls.minZoom,
        controls.maxZoom
      )
      // the pointer's offset from the middle of the view shrinks as the scale grows;
      // move what the camera looks at by the difference
      const shift = 1 / goal - 1 / scale
      const target = controls
        .getTarget(new THREE.Vector3())
        .addScaledVector(
          new THREE.Vector3().setFromMatrixColumn(flat.matrixWorld, 0),
          ((across * width) / 2) * shift
        )
        .addScaledVector(
          new THREE.Vector3().setFromMatrixColumn(flat.matrixWorld, 1),
          ((up * height) / 2) * shift
        )
      goal = scale
      void controls.zoomTo(scale, false)
      void controls.moveTo(target.x, target.y, target.z, false)
      stage.redraw()
    },

    /**
     * Orbit by these angles, the way a drag to the right and down turns the view: about
     * what the camera looks at, or about some other point.
     */
    orbit(right: number, down: number, about: THREE.Vector3 | null = null) {
      atHome = false
      letGo()
      void this.turn(-right, -down, about)
      stage.redraw()
    },

    /** A drag that turns the view has hold of it by this point, or (null) has let go. */
    hold(point: THREE.Vector3 | null) {
      held = point
    },

    /**
     * Turn the camera by these angles, the way the controls would - but on past straight
     * above and straight below, where they stop. Every turn the hand makes comes through
     * here: a drag, fingers on the trackpad, a drag on the axes in the corner.
     *
     * It goes about what the camera looks at, or about some other point, `about`: the
     * one a drag has hold of the view by, unless another is given.
     */
    turn(azimuth: number, polar: number, about: THREE.Vector3 | null = held) {
      // seen upside down, the same movement of the hand turns the camera the other way
      const way = rollTo === 0 ? 1 : -1
      // From where the camera is, not from where a flight was taking it: the hand takes
      // over, and what was left of the flight's turn is dropped.
      let theta = controls.azimuthAngle + way * azimuth
      // down as far as the ground and no further: and from there, if a zoom or a pan
      // has left the camera for the moment lower than it is drawn
      const target = controls.getTarget(new THREE.Vector3(), false)
      const most = lowest(target, controls.distance)
      const from = Math.min(controls.polarAngle, most)
      const was = facingFrom(controls.azimuthAngle, from, rollTo)
      let phi = from + way * polar
      if (most < Math.PI) phi = Math.min(phi, most)
      if (phi < 0 || phi > Math.PI) {
        if (rollTo === 0 && usePreferences.getState().upright) {
          // kept the right way up: straight above, or straight below, is as far as it goes
          phi = phi < 0 ? 0 : Math.PI
        } else {
          // over the top, or under the bottom: on down the far side, the other way up
          phi = phi < 0 ? -phi : 2 * Math.PI - phi
          theta += Math.PI
          const half = rollTo === 0 ? Math.PI : -Math.PI
          rollTo += half
          roll += half
        }
      }
      if (about) {
        // what the camera looks at goes round the point with it, which leaves the point
        // where it is in the picture
        const to = carriedRound(
          target,
          about,
          was,
          facingFrom(theta, phi, rollTo)
        )
        void controls.moveTo(to.x, to.y, to.z, false)
      }
      return controls.rotateTo(theta, phi, false)
    },

    /**
     * Where a point of the view is in the picture the controls believe they are showing,
     * which is the same place unless the picture is turned about its middle.
     */
    asControlsSee(x: number, y: number, rect: DOMRect) {
      if (roll === 0) return { x, y }
      const middle = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
      const [right, up] = [x - middle.x, middle.y - y]
      const [cos, sin] = [Math.cos(roll), Math.sin(roll)]
      return {
        x: middle.x + right * cos - up * sin,
        y: middle.y - (right * sin + up * cos),
      }
    },

    /** Where the camera is from what it looks at, as a direction in the model's frame. */
    eye(): Vec3 {
      const eye = controls
        .getPosition(new THREE.Vector3())
        .sub(controls.getTarget(new THREE.Vector3()))
        .normalize()
      return [eye.x, -eye.z, eye.y]
    },

    /** The user has taken hold of the view. */
    taken() {
      atHome = false
      // only turning takes the camera off its way to a flat view: panning and zooming
      // on the way there are let be
      const turning =
        (controls.currentAction & (ACTION.ROTATE | ACTION.TOUCH_ROTATE)) !== 0
      if (turning) letGo()
    },

    /** Called every frame that is drawn, with the seconds since the last. */
    tick(delta: number) {
      const ground = stage.ground()
      if (ground !== grounded) {
        // what the camera looks at keeps above the ground, however the view is moved
        grounded = ground
        controls.setBoundary(
          ground === null
            ? undefined
            : new THREE.Box3(
                new THREE.Vector3(-Infinity, ground, -Infinity),
                new THREE.Vector3(Infinity, Infinity, Infinity)
              )
        )
      }
      if (ground !== null) {
        // Standing back, or looking lower, would take the camera under the ground from
        // where it is: it comes up round what it looks at instead, as far as it has to.
        const to = heading()
        const then = lowest(
          controls.getTarget(new THREE.Vector3(), true),
          to.radius
        )
        if (to.phi > then + THERE) void controls.rotateTo(to.theta, then, true)
        // And on the way there it is never drawn from under it: this frame is drawn
        // from as low as the ground lets it be, from where the camera is now.
        const target = controls.getTarget(new THREE.Vector3(), false)
        const most = lowest(target, controls.distance)
        if (controls.polarAngle > most) {
          const camera = controls.camera
          camera.position
            .setFromSphericalCoords(
              controls.distance,
              Math.max(most, THERE),
              controls.azimuthAngle
            )
            .add(target)
          camera.position.y = Math.max(camera.position.y, ground)
          camera.lookAt(target)
          camera.updateMatrixWorld()
        }
      }
      // The picture turns back upright on the way to a set view...
      if (roll !== rollTo) {
        const left = roll - rollTo
        roll =
          Math.abs(left) < 0.002
            ? rollTo
            : rollTo + left * Math.exp(-delta / RIGHTING)
        stage.redraw()
      }
      // ...and is turned here, each frame, from how the controls have just left the
      // camera: the right way up. This is the camera the frame is drawn with, even if
      // what follows swaps it for the other.
      if (roll !== 0 || rolled !== 0) {
        const camera = controls.camera
        camera.lookAt(controls.getTarget(new THREE.Vector3(), false))
        camera.rotateZ(roll)
        camera.updateMatrixWorld()
        rolled = roll
      }

      if (tie?.kind === "closing") {
        const there =
          roll === 0 &&
          Math.abs(controls.azimuthAngle - tie.turn) < THERE &&
          Math.abs(controls.polarAngle - tie.polar) < THERE
        if (there) {
          // As good as arrived: finish here rather than wait for the camera to come
          // fully to rest, which takes seconds longer.
          void controls.rotateTo(tie.turn, tie.polar, false)
          if (mode === "lens") {
            flatten()
            goal = tie.fit
            void controls.zoomTo(goal, true)
          }
          // and from here the lens comes back as the camera is turned away
          tie = {
            kind: "opening",
            from: tie.toward,
            share: FLATTEST,
            over: GIVE,
          }
        } else if (mode === "lens") {
          const left = facing().angleTo(tie.toward) / tie.over
          lensTo(1 / (FLATTEST + (tie.share - FLATTEST) * ease(left)))
        }
      } else if (tie) {
        const turned = facing().angleTo(tie.from)
        if (mode === "flat" && turned > THERE) narrow()
        if (mode === "lens") {
          if (turned < tie.over) {
            const share = tie.share + (1 - tie.share) * ease(turned / tie.over)
            lensTo(1 / share)
          } else {
            lensTo(1)
            tie = null
          }
        }
      }
      if (mode === "lens") {
        // A narrowed lens sits far back. Draw only the slice of depth the model is in,
        // or surfaces close together would start to show through one another. The
        // slice is measured from where the camera is drawn from this frame, which is
        // not yet where the controls have just been told it goes: on the way into a
        // flat view that is far enough behind it to slice the front off the model.
        const r = reach()
        const away = lens.position.distanceTo(
          controls.getTarget(new THREE.Vector3(), false)
        )
        const near =
          narrowing > 1.01
            ? Math.max((r * REACH.nearest) / 4, away - 3 * r)
            : (r * REACH.nearest) / 4
        const far = Math.max(r * REACH.furthest * 2, away + 3 * r)
        if (lens.near !== near || lens.far !== far) {
          lens.near = near
          lens.far = far
          lens.updateProjectionMatrix()
        }
      }
      if (stage.publish)
        publishOrientation(
          controls.camera.quaternion
            .clone()
            .invert()
            .multiply(MODEL_TO_WORLD_TURN)
        )
    },
  }
}

/** The camera: orbit, pan, zoom, a home view that frames the whole model, and flat views. */
export function Rig({
  box,
  homeKey,
  refit = "",
  circling = false,
  small = 1,
  around = null,
  more = null,
  ground = null,
  bridged = true,
}: {
  /** all there is to see: the model, with whatever it is set in */
  box: THREE.Box3
  homeKey: string
  /**
   * Changes when what there is to see changes all at once, as the model's own tools put
   * parts out of sight or back: the camera takes in what there is then. (Not so as the
   * user hides a part: that is no reason to move the camera.)
   */
  refit?: string
  /** the camera goes slowly round the model by itself, for as long as this is so */
  circling?: boolean
  /**
   * How big what there is to see is seen when it opens, as a share of all the view
   * takes in: less, for what is only standing in for a model
   */
  small?: number
  /**
   * What the model is set in to be seen beside, a reference scene, by a name that tells
   * one such thing from another; null while it is set in nothing.
   */
  around?: string | null
  /**
   * What more there is in that to take in, by a name: the figure of a person, which
   * comes and goes. Null where there is nothing more.
   */
  more?: string | null
  /**
   * How high the ground is that such a thing stands on, in the model's frame: the
   * camera keeps above it. Null while the model is set in nothing.
   */
  ground?: number | null
  /**
   * It is the camera of the model's view: what the keys, the axes in the corner and the
   * rest of the app move the camera with is this one's (see bridge.ts). Not so of another
   * view that has a camera of the same kind, a circuit board's, which keeps to itself.
   */
  bridged?: boolean
}) {
  const bridging = React.useRef(bridged)
  const controls = React.useRef<CameraControls>(null)
  const director = React.useRef<ReturnType<typeof direct> | null>(null)
  const get = useThree((state) => state.get)
  const set = useThree((state) => state.set)
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const aspect = size.width / size.height
  /** the shape of the view, wide to high, as the camera last framed for it */
  const shape = React.useRef(aspect)
  const turnSpeed = usePreferences((state) => state.turnSpeed)
  const zoomSpeed = usePreferences((state) => state.zoomSpeed)

  const latest = React.useRef(box)
  React.useEffect(() => {
    latest.current = box
    director.current?.resized()
  }, [box])
  // (after what there is to see is known afresh, above)
  const refitted = React.useRef(refit)
  React.useEffect(() => {
    if (refit === refitted.current) return
    refitted.current = refit
    director.current?.refit(shape.current)
  }, [refit])
  const floor = React.useRef(ground)
  React.useEffect(() => {
    floor.current = ground
    // the camera is brought above it in the frames that follow
    invalidate()
  }, [ground, invalidate])

  // the camera the view was created with has the lens; the flat one is made here
  const [lens] = React.useState(() => get().camera as THREE.PerspectiveCamera)
  const [flat] = React.useState(() => new THREE.OrthographicCamera())

  React.useEffect(() => {
    if (!controls.current) return
    // The view is only drawn when something changes, so the first frame of a move is
    // handed all the time the view sat still as its step, and the camera would jump
    // most of the way there at once. No frame gets to count for more than a slow one.
    const impl = controls.current
    const update = impl.update.bind(impl)
    impl.update = (delta) => update(Math.min(delta, STEP))
    // and every turn the controls make of their own accord goes by way of `turn`, which
    // takes the camera on over the top where they would stop it
    const rotate = impl.rotate.bind(impl)
    impl.rotate = (azimuth, polar) => made.turn(azimuth, polar)
    // The main button is not the camera's: it picks parts out, at a click or by drawing
    // a box across them (see Marquee). With a mouse it is the other buttons that move
    // the view, each as the user has it: a press of one says what it does.
    impl.mouseButtons.left = ACTION.NONE
    const made = direct({
      controls: impl,
      lens,
      flat,
      box: () => latest.current,
      ground: () => floor.current,
      size: () => get().size,
      publish: bridging.current,
      show: (camera) => {
        set({ camera })
        invalidate()
      },
      redraw: invalidate,
    })
    director.current = made
    if (!bridging.current) {
      // a board's camera: only the keys' set views, and going to a part of it, are had
      // of it from outside
      bridge.board = {
        lookFrom: (axis, sign) => made.lookFrom(axis, sign),
        home: () => made.home(true, shape.current),
        goTo: (box, covered) => made.goTo(box, covered),
      }
      return () => {
        impl.update = update
        impl.rotate = rotate
        director.current = null
        bridge.board = null
      }
    }
    // what the axis gizmo, the section planes and the keyboard move the camera with
    bridge.lookFrom = (axis, sign) => made.lookFrom(axis, sign)
    bridge.orbit = (dx, dy) =>
      made.orbit(dx * TURN.axes, dy * TURN.axes, turnedAbout(null))
    bridge.eye = () => made.eye()
    bridge.flat = () => made.isFlat()
    bridge.focus = (box, covered) => made.focus(box, covered)
    bridge.goTo = (box, covered) => made.goTo(box, covered)
    // lets a script see what the camera is doing when the app is checked without a person
    if (import.meta.env.DEV) Object.assign(window, { __camera: made.probe })
    return () => {
      impl.update = update
      impl.rotate = rotate
      director.current = null
      bridge.lookFrom = bridge.orbit = bridge.eye = bridge.flat = null
      bridge.focus = bridge.goTo = null
    }
  }, [lens, flat, get, set, invalidate])

  // Not for whoever has asked for less to move: the camera going round by itself, and
  // its standing back to do it.
  const still = React.useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )
  const watching = circling && !still

  // Reframes when a different model opens or home is asked for - not when the same
  // model is rebuilt, which should not move the camera. And when the camera begins to go
  // round by itself, or is through: it watches from a little further back, and comes in
  // again to where a model opens when there is no more to watch.
  const first = React.useRef(true)
  React.useEffect(() => {
    director.current?.home(
      !first.current,
      shape.current,
      (watching ? WATCHING : 1) * small
    )
    first.current = false
  }, [homeKey, watching, small])

  // the view changed shape: a panel opened, or the window was resized
  React.useEffect(() => {
    shape.current = aspect
    if (!first.current) director.current?.reshape(aspect)
  }, [aspect])

  // Set in a reference scene, taken out of one, or moved from one to another: the
  // camera goes to where a model opens, to take all of the scene in, and comes back in
  // when there is no more of it. With more in the same scene to take in, or less, it
  // stands back or comes in from where it is. Not when the same scene is built again,
  // which should not move the camera.
  const within = React.useRef({ around, more })
  React.useEffect(() => {
    const was = within.current
    if (was.around === around && was.more === more) return
    within.current = { around, more }
    director.current?.surround(
      around !== null,
      shape.current,
      was.around !== around
    )
  }, [around, more])

  // What the hand does on the view. Fingers moving across a trackpad turn the model, a
  // pinch zooms, and so does a mouse wheel; with Shift held, either pans. A drag with a
  // mouse's right button, or its middle one, does what the user has said that button
  // does, and what they have said a key held with it makes of that (see navigation.ts).
  React.useEffect(() => {
    const canvas = gl.domElement
    const around = canvas.parentElement
    if (!around) return
    const source = scrollSource()
    /** scrolls made here for the controls: not to be read a second time */
    const passed = new WeakSet<Event>()
    /** when the last pinch came */
    let pinched = -Infinity
    /**
     * The swipe under way: when it last moved, how far it has gone, `sends` then, and
     * what it turns the view about.
     */
    const swipe = {
      at: -Infinity,
      travel: 0,
      sends: 0,
      about: null as THREE.Vector3 | null,
    }
    /** the drag that is zooming: where it began, and how far down the window it has got */
    let zooming: { x: number; y: number; last: number } | null = null

    /** The button that a press is of, of those that move the view: a finger has none. */
    const buttonOf = (event: PointerEvent): Button | null =>
      event.pointerType === "touch"
        ? null
        : event.button === 1
          ? "middle"
          : event.button === 2
            ? "right"
            : null
    const swallow = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
    }

    /**
     * Zoom as a wheel would that scrolled this far, in pixels (or in lines, where `mode`
     * is 1), on the place in the window it is given. The controls would answer a pinch
     * by changing the lens instead of moving the camera, and a drag in their own way:
     * so all of them go to the controls as a turn of a wheel, and every zoom is the same
     * kind, towards the pointer and within the same limits. And upside down, the
     * controls have to be told where the pointer is in the picture as they know it.
     */
    const zoom = (delta: number, x: number, y: number, mode = 0) => {
      const camera = controls.current
      const made = director.current
      if (!camera || !made) return
      // a zoom should keep up with the hand
      camera.smoothTime = SMOOTH.zoom
      const rect = canvas.getBoundingClientRect()
      if (made.isFlat()) {
        made.zoomFlat(
          // a mouse wheel may count in lines
          delta * (mode === 1 ? 10 : 1),
          ((x - rect.left) / rect.width) * 2 - 1,
          1 - ((y - rect.top) / rect.height) * 2
        )
        return
      }
      // (whatever a key held with it would make of a wheel that was really turned)
      camera.mouseButtons.wheel = ACTION.DOLLY
      const at = made.asControlsSee(x, y, rect)
      const plain = new WheelEvent("wheel", {
        deltaY: delta,
        deltaMode: mode,
        clientX: at.x,
        clientY: at.y,
        bubbles: true,
        cancelable: true,
      })
      passed.add(plain)
      canvas.dispatchEvent(plain)
    }

    const press = (event: PointerEvent) => {
      const camera = controls.current
      const made = director.current
      if (!camera || !made) return
      // The controls sit a press of the main button out altogether: left to hear of
      // it, they would take the view for moved by a drag that moves nothing.
      if (event.button === 0) {
        camera.enabled = false
        return
      }
      const button = buttonOf(event)
      if (!button) return
      const buttons = usePreferences.getState()
      const held = { shift: event.shiftKey, ctrl: event.ctrlKey }
      camera.mouseButtons.right = DRAGGED[dragOf(buttons, "right", held)]
      camera.mouseButtons.middle = DRAGGED[dragOf(buttons, "middle", held)]
      const does = dragOf(buttons, button, held)
      if (does === "zoom")
        zooming = { x: event.clientX, y: event.clientY, last: event.clientY }
      // a turn may go about the place the drag began on, or about what is picked out
      else if (does === "turn") made.hold(turnedAbout(event, bridging.current))
    }
    const drag = (event: PointerEvent) => {
      const made = director.current
      if (!zooming || !made) return
      const down = event.clientY - zooming.last
      zooming.last = event.clientY
      if (down === 0) return
      // Up the window zooms in, as a wheel turned away does, on the place the drag
      // began. (Off a Mac the controls count a wheel's pixels for a third as much,
      // a notch of one sending so many more of them there: a drag's are made up for it.)
      const counted = MAC || made.isFlat() ? 1 : 3
      zoom(down * DRAG_ZOOM * counted, zooming.x, zooming.y)
    }
    const lift = () => {
      zooming = null
      director.current?.hold(null)
      if (controls.current) controls.current.enabled = true
    }

    const turn = (event: WheelEvent, now: number) => {
      const camera = controls.current
      const made = director.current
      if (!camera || !made) return
      // one that follows the last without a pause is the same movement
      if (now - swipe.at > SCROLL_PAUSE) {
        swipe.travel = 0
        swipe.sends = made.sends()
        swipe.about = turnedAbout(event, bridging.current)
      }
      swipe.at = now
      // Fingers drift as they pinch, and a swipe coasts on after they lift. Neither
      // should turn a view that is being zoomed, or one sent to a set view since.
      if (now - pinched < SCROLL_PAUSE || swipe.sends !== made.sends()) return
      // a flat view is exact: it gives way only to a swipe that means it
      swipe.travel += Math.hypot(event.deltaX, event.deltaY)
      if (made.isFlat() && swipe.travel < GRIP) return
      camera.smoothTime = SMOOTH.turn
      // the model goes the way the fingers do, as it does under a drag
      const rate = TURN.swipe * usePreferences.getState().turnSpeed
      made.orbit(-event.deltaX * rate, -event.deltaY * rate, swipe.about)
    }

    const wheel = (event: WheelEvent) => {
      const camera = controls.current
      const made = director.current
      if (!camera || !made || passed.has(event)) return
      camera.mouseButtons.wheel = event.shiftKey ? ACTION.TRUCK : ACTION.DOLLY
      // a pan should keep up with the fingers
      camera.smoothTime = SMOOTH.zoom
      if (event.shiftKey) return
      const now = performance.now()
      // what it was made with is worked out, unless the user has said which it always is
      const { scrolling, wheelReversed } = usePreferences.getState()
      const from =
        scrolling === "auto"
          ? source(event, now)
          : scrolling === "trackpad"
            ? "fingers"
            : "wheel"
      swallow(event)
      // a pinch arrives as a scroll with Ctrl held
      if (!event.ctrlKey && from === "fingers") {
        turn(event, now)
        return
      }
      if (event.ctrlKey) pinched = now
      // a wheel zooms the other way round for whoever has asked it to: not a pinch,
      // which goes the way the fingers do
      const way = !event.ctrlKey && wheelReversed ? -1 : 1
      zoom(
        event.deltaY * (event.ctrlKey ? PINCH : 1) * way,
        event.clientX,
        event.clientY,
        event.deltaMode
      )
    }
    // capturing, one element up: these run before the controls' own listeners on the canvas
    around.addEventListener("wheel", wheel, { capture: true, passive: false })
    around.addEventListener("pointerdown", press, { capture: true })
    window.addEventListener("pointermove", drag)
    window.addEventListener("pointerup", lift)
    window.addEventListener("pointercancel", lift)
    return () => {
      around.removeEventListener("wheel", wheel, { capture: true })
      around.removeEventListener("pointerdown", press, { capture: true })
      window.removeEventListener("pointermove", drag)
      window.removeEventListener("pointerup", lift)
      window.removeEventListener("pointercancel", lift)
    }
  }, [gl])

  // Going round by itself: a little further each frame, the way a drag would take it,
  // and gently into it.
  const round = React.useRef(0)
  useFrame((_, delta) => {
    const step = Math.min(delta, STEP)
    if (watching) {
      round.current += step
      const pace = Math.min(1, round.current / CIRCLE.ease)
      director.current?.orbit(CIRCLE.rate * pace * pace * step, 0)
      // nothing else asks for the next frame
      invalidate()
    } else round.current = 0
    director.current?.tick(step)
  })

  return (
    <CameraControls
      ref={controls}
      // always this one: the flat camera is handed to the same controls when it is wanted
      camera={lens}
      makeDefault
      onControl={() => director.current?.taken()}
      // a drag turns as fast as the user has asked the view to turn
      azimuthRotateSpeed={turnSpeed}
      polarRotateSpeed={turnSpeed}
      // and a wheel zooms as fast as they have asked it to zoom
      dollySpeed={ZOOM_SPEED * zoomSpeed}
      dollyToCursor
      smoothTime={SMOOTH.turn}
      draggingSmoothTime={0.08}
    />
  )
}
