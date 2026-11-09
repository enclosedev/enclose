import * as THREE from "three"
import { describe, expect, it } from "vitest"

import { LIGHTING, lighting, UNDER_FROM, underlit } from "./light"

/** A camera at a place, looking at the middle of the model. */
function cameraAt(x: number, y: number, z: number) {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(x, y, z)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

describe("underlit", () => {
  it("is out while the model is looked down on, or along", () => {
    expect(underlit(cameraAt(100, 80, 100))).toBe(0)
    expect(underlit(cameraAt(100, 0, 0))).toBe(0)
  })

  it("comes up as the camera goes under the model", () => {
    const little = underlit(cameraAt(100, -10, 0))
    const more = underlit(cameraAt(100, -30, 0))
    expect(little).toBeGreaterThan(0)
    expect(more).toBeGreaterThan(little)
  })

  it("is at its most well before the camera is straight below, and no more from there", () => {
    const steep = underlit(cameraAt(60, -100, 0))
    expect(steep).toBeGreaterThan(1)
    expect(underlit(cameraAt(0.001, -100, 0))).toBe(steep)
  })

  it("shines straight up, so that it falls only on what faces down", () => {
    expect(UNDER_FROM).toEqual([0, -1, 0])
  })
})

describe("lighting", () => {
  /** Which way a light comes from at the middle, as the camera has it. */
  function seenFrom(
    camera: THREE.Camera,
    light: THREE.Light,
    middle = new THREE.Vector3()
  ) {
    return light
      .getWorldPosition(new THREE.Vector3())
      .sub(middle)
      .normalize()
      .transformDirection(camera.matrixWorldInverse)
  }

  it("has the lamp over the viewer's left shoulder, whichever way the model is looked at", () => {
    const { lights, follow } = lighting()
    const lamp = lights.find((light) => light instanceof THREE.PointLight)!
    for (const camera of [
      cameraAt(100, 80, 100),
      cameraAt(-60, -120, 40),
      cameraAt(0, 0, -150),
    ]) {
      follow(camera, new THREE.Vector3())
      const from = seenFrom(camera, lamp)
      expect(from.x).toBeLessThan(0)
      expect(from.y).toBeGreaterThan(0)
      expect(from.z).toBeGreaterThan(0)
      expect(from.angleTo(LIGHTING.key.from)).toBeLessThan(0.01)
    }
  })

  it("stands the lamp as far from the middle as the camera, so it falls a little differently across a face", () => {
    const { lights, follow } = lighting()
    const lamp = lights.find((light) => light instanceof THREE.PointLight)!
    const camera = cameraAt(0, 0, 200)
    follow(camera, new THREE.Vector3())
    const at = lamp.getWorldPosition(new THREE.Vector3())
    expect(at.length()).toBeCloseTo(200)
    // across a face as wide as the model is far, it comes at angles some way apart
    const left = at
      .clone()
      .sub(new THREE.Vector3(-50, 0, 0))
      .normalize()
    const right = at
      .clone()
      .sub(new THREE.Vector3(50, 0, 0))
      .normalize()
    expect(left.angleTo(right)).toBeGreaterThan(0.2)
  })

  it("is as far off as the sun where the model's middle is not given", () => {
    const { lights, follow } = lighting()
    const lamp = lights.find((light) => light instanceof THREE.PointLight)!
    const camera = cameraAt(0, 0, 200)
    follow(camera)
    expect(lamp.getWorldPosition(new THREE.Vector3()).length()).toBeGreaterThan(
      1e4
    )
  })

  it("keeps the fill on the other side, low", () => {
    const { lights, follow } = lighting()
    const fill = lights.find(
      (light) => light instanceof THREE.DirectionalLight
    )!
    const camera = cameraAt(-60, -120, 40)
    follow(camera, new THREE.Vector3())
    const from = seenFrom(camera, fill)
    expect(from.x).toBeGreaterThan(0)
    expect(from.y).toBeLessThan(0)
  })

  it("lights every layer, so whatever is drawn is lit", () => {
    const camera = new THREE.PerspectiveCamera()
    camera.layers.set(6)
    for (const light of lighting().lights)
      expect(light.layers.test(camera.layers)).toBe(true)
  })
})
