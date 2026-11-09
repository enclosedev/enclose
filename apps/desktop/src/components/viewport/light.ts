// How the model is lit wherever it is drawn as it is modelled: in the view and a circuit
// board's 3D, in the small pictures of its parts and those Claude is shown, and in an
// assembly guide. Render lights it otherwise, as a photograph would be (see scene.tsx).
//
// The lights go round with the camera, the way a CAD program's do: the main one comes
// from over the viewer's left shoulder, whichever way the model is turned. What faces up
// and to the left on the screen is lit, what faces the viewer a little less, and what
// faces down and away is in shade. A box shows its three sides in three tones, and its
// shape reads from below as well as from above.
//
// Shade is not black. The room's light still falls there, a little more from above than
// from below, and a faint light from the other side keeps one face in shade apart from
// the next.
//
// Render's lights stay where they are as the camera goes round. They light it from above,
// the way things are, so seen from below the model would be in its own shadow, and what
// faces down all one dull grey. So Render also has a light under the model, which is
// out while the model is looked down on or along, and comes up as the camera goes under
// it. From straight below, what faces down is about as light as what faces up is from
// straight above.
import * as THREE from "three"

/**
 * Where the lights that go round with the camera shine from, as the camera has it: x to
 * the right of the screen, y up it, z out of it toward the viewer. And how strong each
 * is, with the room's light and the sky's.
 *
 * The main light is a lamp, not the sun: it stands as far from what is looked at as the
 * camera does, so it falls on each place at a slightly different angle, and a flat face
 * is a little lighter toward one side than the other.
 */
export const LIGHTING = {
  key: {
    from: new THREE.Vector3(-0.42, 0.62, 0.66).normalize(),
    strength: 2.6,
  },
  fill: {
    from: new THREE.Vector3(0.75, -0.2, 0.62).normalize(),
    strength: 0.3,
  },
  room: 0.22,
  sky: { above: "#ffffff", below: "#8c919a", strength: 0.32 },
}

/** How far off the lamp stands where there is no telling how far the model is: as good as the sun. */
const FAR_OFF = 1e5

/** The lights a model is drawn with, and what turns them with a camera. */
export type Lights = {
  lights: THREE.Light[]
  /**
   * Turn the lights to come from where they do for this camera: once a frame, before it
   * is drawn. `middle` is the middle of the model, in the world: how far off it is is
   * how far off the lamp stands. With none, the lamp is as far off as the sun.
   */
  follow: (camera: THREE.Camera, middle?: THREE.Vector3 | null) => void
}

const turn = new THREE.Quaternion()
const at = new THREE.Vector3()
const ahead = new THREE.Vector3()
const over = new THREE.Vector3()

/** The lights that go round with the camera, lit for whatever layer is drawn. */
export function lighting(): Lights {
  const { key, fill, room, sky } = LIGHTING
  // (with no fall-off: as bright near as far, only the angle it comes at changes)
  const lamp = new THREE.PointLight("#ffffff", key.strength, 0, 0)
  const fillLight = new THREE.DirectionalLight("#ffffff", fill.strength)
  const lights = [
    new THREE.AmbientLight("#ffffff", room),
    new THREE.HemisphereLight(sky.above, sky.below, sky.strength),
    lamp,
    fillLight,
  ]
  for (const light of lights) light.layers.enableAll()
  return {
    lights,
    follow(camera, middle) {
      camera.getWorldQuaternion(turn)
      camera.getWorldPosition(at)
      camera.getWorldDirection(ahead)
      over.copy(key.from).applyQuaternion(turn)
      // over the viewer's shoulder, as far from where the camera looks as the camera is:
      // that is taken to be as far ahead of it as the model's middle
      const far = middle ? at.distanceTo(middle) : FAR_OFF
      lamp.position
        .copy(at)
        .addScaledVector(ahead, far)
        .addScaledVector(over, far)
      // (a directional light shines from where it is toward its target: only which way
      // that is counts)
      fillLight.position.copy(fill.from).applyQuaternion(turn)
      // (a picture drawn off screen may be past the point where this is worked out)
      lamp.updateMatrixWorld()
      fillLight.updateMatrixWorld()
    },
  }
}

/**
 * How strong Render's light from under the model is at its most, and how far up the
 * camera has to be looking for that: as the height of where it looks, of a length of
 * one. It comes up evenly from level.
 */
const UNDER = { most: 1.8, by: 0.5 }

/** It shines straight up, so that it falls only on what faces down. */
export const UNDER_FROM: [number, number, number] = [0, -1, 0]

const looking = new THREE.Vector3()

/** How strong Render's light from under is for a camera, by how far it looks up from below. */
export function underlit(camera: THREE.Camera): number {
  const up = camera.getWorldDirection(looking).y
  return UNDER.most * THREE.MathUtils.smoothstep(up, 0, UNDER.by)
}
