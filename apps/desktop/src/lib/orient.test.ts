import * as THREE from "three"
import { describe, expect, it } from "vitest"

import {
  carriedRound,
  facingFrom,
  lowestPolar,
  nearestAxis,
  nearestTurn,
  normalOf,
  turnedWithin,
  turnTo,
  viewFrom,
  VIEWS,
} from "./orient"

const close = (a: number[], b: number[]) =>
  a.forEach((n, i) => expect(n).toBeCloseTo(b[i], 6))

describe("nearestAxis", () => {
  it("picks the axis a direction leans on, and which way", () => {
    expect(nearestAxis([0.5, -0.62, 0.6])).toEqual({
      axis: "y",
      sign: -1,
      exact: false,
    })
    expect(nearestAxis([0, 0, 12])).toEqual({ axis: "z", sign: 1, exact: true })
    expect(nearestAxis([-3, 0.01, 0])).toEqual({
      axis: "x",
      sign: -1,
      exact: true,
    })
  })

  it("does not call a tilted direction square", () => {
    // five degrees off X
    expect(nearestAxis([Math.cos(0.087), Math.sin(0.087), 0]).exact).toBe(false)
  })
})

describe("turnTo and normalOf", () => {
  it("round-trip every axis, both ways", () => {
    close(normalOf(turnTo("x", 1)), [1, 0, 0])
    close(normalOf(turnTo("x", -1)), [-1, 0, 0])
    close(normalOf(turnTo("y", 1)), [0, 1, 0])
    close(normalOf(turnTo("y", -1)), [0, -1, 0])
    close(normalOf(turnTo("z", 1)), [0, 0, 1])
    close(normalOf(turnTo("z", -1)), [0, 0, -1])
  })
})

describe("viewFrom", () => {
  // where three.js puts a camera at these angles, turned back into the model's frame
  const eye = (azimuth: number, polar: number) => {
    const [x, y, z] = [
      Math.sin(polar) * Math.sin(azimuth),
      Math.cos(polar),
      Math.sin(polar) * Math.cos(azimuth),
    ]
    return [x, -z, y]
  }

  it("puts the camera at the end of the axis asked for", () => {
    for (const [axis, sign, at] of [
      ["x", 1, [1, 0, 0]],
      ["x", -1, [-1, 0, 0]],
      ["y", 1, [0, 1, 0]],
      ["y", -1, [0, -1, 0]],
      ["z", 1, [0, 0, 1]],
      ["z", -1, [0, 0, -1]],
    ] as const) {
      const { azimuth, polar } = viewFrom(axis, sign)
      close(eye(azimuth, polar), [...at])
    }
  })
})

describe("viewFrom, looking straight down or up", () => {
  // What is at the top of the view and what is on its right, in the model's frame. At
  // these two angles the camera's own turn is all there is to tell them apart.
  const frame = (azimuth: number, polar: number) => {
    const towards = polar === 0 ? -1 : 1
    const up = [towards * Math.sin(azimuth), 0, towards * Math.cos(azimuth)]
    // the camera looks down three.js's Y from above, and up it from below
    const right = [towards * up[2], 0, -towards * up[0]]
    const model = ([x, y, z]: number[]) => [x, -z, y]
    return { up: model(up), right: model(right) }
  }

  it("has the model's back at the top of the view from above, +X on the right", () => {
    const { azimuth, polar } = viewFrom("z", 1)
    close(frame(azimuth, polar).up, [0, 1, 0])
    close(frame(azimuth, polar).right, [1, 0, 0])
  })

  it("keeps the back at the top from below, turning the model over sideways", () => {
    const { azimuth, polar } = viewFrom("z", -1)
    close(frame(azimuth, polar).up, [0, 1, 0])
    close(frame(azimuth, polar).right, [-1, 0, 0])
  })
})

describe("lowestPolar", () => {
  it("stops a camera level with what it looks at, when that is on the ground", () => {
    expect(lowestPolar(0, 500)).toBeCloseTo(Math.PI / 2, 6)
  })

  it("lets it under what it looks at, by as much as that is above the ground", () => {
    // half as high as it is far: a third of the way on from level to straight below
    expect(lowestPolar(250, 500)).toBeCloseTo((Math.PI * 2) / 3, 6)
    expect(250 + 500 * Math.cos(lowestPolar(250, 500))).toBeCloseTo(0, 6)
  })

  it("lets it all the way under something higher than it is far from", () => {
    expect(lowestPolar(500, 500)).toBeCloseTo(Math.PI, 6)
    expect(lowestPolar(900, 500)).toBeCloseTo(Math.PI, 6)
  })

  it("keeps it above something under the ground, by as much as that is under", () => {
    expect(lowestPolar(-250, 500)).toBeCloseTo(Math.PI / 3, 6)
    expect(lowestPolar(-900, 500)).toBeCloseTo(0, 6)
  })
})

describe("nearestTurn", () => {
  it("goes the short way round", () => {
    expect(nearestTurn(0.1, Math.PI * 2)).toBeCloseTo(0)
    expect(nearestTurn(Math.PI * 4 + 0.2, -Math.PI / 2)).toBeCloseTo(
      Math.PI * 4 - Math.PI / 2
    )
    expect(nearestTurn(-3, 3)).toBeCloseTo(3 - Math.PI * 2)
  })
})

describe("VIEWS", () => {
  it("lists the six flat views in the order of their shortcuts, Cmd+2 first", () => {
    expect(
      VIEWS.map((v) => `${v.name} ${v.sign > 0 ? "+" : "-"}${v.axis}`)
    ).toEqual([
      "Front -y",
      "Back +y",
      "Top +z",
      "Bottom -z",
      "Right +x",
      "Left -x",
    ])
  })
})

describe("facingFrom", () => {
  it("faces the way a camera does that is made to look at the middle", () => {
    const [azimuth, polar] = [0.7, 1.1]
    const camera = new THREE.PerspectiveCamera()
    camera.position.setFromSphericalCoords(5, polar, azimuth)
    camera.lookAt(0, 0, 0)
    close(facingFrom(azimuth, polar).toArray(), camera.quaternion.toArray())
  })

  it("is still a way of facing from straight above, by the angle round", () => {
    const right = (azimuth: number) =>
      new THREE.Vector3(1, 0, 0).applyQuaternion(facingFrom(azimuth, 0))
    close(right(0).toArray(), [1, 0, 0])
    close(right(Math.PI / 2).toArray(), [0, 0, -1])
  })

  it("carries on unbroken over the top, the picture turned half round", () => {
    // just short of straight above, and just past it down the far side
    const before = facingFrom(0.4, 0.001)
    const after = facingFrom(0.4 + Math.PI, 0.001, Math.PI)
    expect(before.angleTo(after)).toBeLessThan(0.01)
  })
})

describe("carriedRound", () => {
  /** Where a point is in the picture of a camera that looks at `target` from `far` away. */
  const seen = (
    point: THREE.Vector3,
    target: THREE.Vector3,
    facing: THREE.Quaternion,
    far: number
  ) => {
    const from = new THREE.Vector3(0, 0, far)
      .applyQuaternion(facing)
      .add(target)
    return point.clone().sub(from).applyQuaternion(facing.clone().invert())
  }

  it("keeps the point turned about where it is in the picture", () => {
    const target = new THREE.Vector3(1, 2, 3)
    const about = new THREE.Vector3(-4, 0.5, 6)
    const was = facingFrom(0.3, 1.2)
    const is = facingFrom(1.4, 0.6)
    const moved = carriedRound(target, about, was, is)
    close(
      seen(about, moved, is, 20).toArray(),
      seen(about, target, was, 20).toArray()
    )
  })

  it("leaves what the camera looks at alone when that is what it turns about", () => {
    const target = new THREE.Vector3(1, 2, 3)
    const moved = carriedRound(
      target,
      target,
      facingFrom(0, 1),
      facingFrom(2, 0.3)
    )
    close(moved.toArray(), target.toArray())
  })
})

describe("turnedWithin", () => {
  // what is on show: a box above where the whole model was looked at
  const shown = new THREE.Box3(
    new THREE.Vector3(-10, -10, 40),
    new THREE.Vector3(10, 10, 60)
  )

  it("leaves a turn about what the camera looks at where that is on show", () => {
    expect(
      turnedWithin(
        new THREE.Vector3(5, 0, 50),
        new THREE.Vector3(1, 0, 0),
        shown
      )
    ).toBeNull()
  })

  it("turns about the middle of what is on show, where the camera looks past it", () => {
    const about = turnedWithin(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      shown
    )
    close(about!.toArray(), [0, 0, 50])
  })

  it("turns about the place half way through it, where the camera looks through it", () => {
    // looking down on it from straight above, at a point well under it, to one side
    const about = turnedWithin(
      new THREE.Vector3(4, -3, 0),
      new THREE.Vector3(0, 0, 1),
      shown
    )
    close(about!.toArray(), [4, -3, 50])
  })

  it("goes by the line, whichever way along it the camera is", () => {
    const looked = new THREE.Vector3(4, -3, 0)
    const up = turnedWithin(looked, new THREE.Vector3(0, 0, 1), shown)
    const down = turnedWithin(looked, new THREE.Vector3(0, 0, -5), shown)
    close(down!.toArray(), up!.toArray())
  })
})
