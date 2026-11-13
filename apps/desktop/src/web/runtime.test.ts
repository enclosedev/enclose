import * as THREE from "three"
import { describe, expect, it } from "vitest"

import { PALETTE } from "@shared/palette"
import { enclose, type WebData } from "./runtime"

/** A scene as the app's GLB has it: a group, and in it the part, 10 along, 20 back and 30 up. */
function scene() {
  const root = new THREE.Group()
  const group = new THREE.Group()
  group.name = "body"
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.04, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x808080 })
  )
  lid.name = "lid"
  lid.position.set(0.01, 0.03, -0.02)
  group.add(lid)
  root.add(group)
  return { root, lid }
}

const DATA: WebData = {
  parts: [
    {
      id: "lid",
      label: "Lid",
      group: "body",
      min: [-10, 0, 10],
      max: [30, 40, 50],
    },
  ],
  palette: PALETTE,
}

const tool = (made: unknown) => ({ id: "lid", load: () => made })

describe("enclose", () => {
  it("turns a part about a line in the model's own millimetres, Z up, as the app does", () => {
    const { root, lid } = scene()
    enclose(root, DATA, [
      tool({
        frame(t: { part(id: string): { turn(how: unknown): unknown } }) {
          t.part("lid").turn({ by: 90, axis: "z", about: [0, 0, 0] })
        },
      }),
    ])
    // the model's (10, 20, 30) goes to (-20, 10, 30): in glTF's metres, Y up
    expect(lid.position.x).toBeCloseTo(-0.02)
    expect(lid.position.y).toBeCloseTo(0.03)
    expect(lid.position.z).toBeCloseTo(-0.01)
  })

  it("follows its controls as they are set, and says when they change", () => {
    const { root, lid } = scene()
    const model = enclose(root, DATA, [
      tool({
        controls: {
          up: { kind: "slider", title: "Up", min: 0, max: 100, value: 0 },
        },
        frame(t: {
          values: { up: number }
          part(id: string): { move(by: unknown): unknown }
        }) {
          t.part("lid").move([0, 0, t.values.up])
        },
      }),
    ])
    expect(model.tools.map((one) => one.name)).toEqual(["Lid"])
    const heard: string[] = []
    model.onChange((id) => heard.push(id))
    model.set("lid", "up", 50)
    model.update(1000)
    expect(lid.position.y).toBeCloseTo(0.08)
    expect(heard).toEqual(["lid"])
    expect(model.tools[0].controls[0]).toMatchObject({ value: 50 })
  })

  it("hides a part and colours it as a tool says, and gives it back its own colour after", () => {
    const { root, lid } = scene()
    let on = true
    const model = enclose(root, DATA, [
      tool({
        frame(t: {
          part(id: string): { hide(): unknown; color(name: string): unknown }
        }) {
          if (on) t.part("lid").color("red")
          else t.part("lid").hide()
        },
      }),
    ])
    const material = lid.material
    expect(`#${material.color.getHexString()}`).toBe(PALETTE.red)
    on = false
    model.update()
    expect(lid.visible).toBe(false)
    expect(material.color.getHex()).toBe(0x808080)
  })

  it("lets go of a tool that goes wrong, and puts back what it did", () => {
    const { root, lid } = scene()
    let broken = false
    const model = enclose(root, DATA, [
      tool({
        frame(t: { part(id: string): { move(by: unknown): unknown } }) {
          if (broken) throw new Error("no")
          t.part("lid").move([0, 0, 10])
        },
      }),
    ])
    expect(lid.position.y).toBeCloseTo(0.04)
    broken = true
    const error = console.error
    console.error = () => {}
    try {
      model.update()
    } finally {
      console.error = error
    }
    expect(model.tools).toEqual([])
    expect(lid.position.y).toBeCloseTo(0.03)
  })
})
