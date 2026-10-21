import { describe, expect, it } from "vitest"

import { declared, fitted, snapped } from "./declare"
import type { Control } from "./types"

const one = (control: unknown, kept = {}) =>
  declared({ controls: { it: control } }, "tool", kept).controls[0]

describe("declared", () => {
  it("goes by its file's name where it gives none", () => {
    expect(declared({}, "robot-arm").name).toBe("Robot arm")
    expect(declared({ name: " Clock " }, "x").name).toBe("Clock")
  })

  it("keeps the controls in the order they are written", () => {
    const tool = declared(
      {
        controls: {
          speed: { kind: "slider" },
          lidAngle: { kind: "slider", title: "Lid" },
        },
      },
      "x"
    )
    expect(tool.controls.map((c) => [c.id, c.title])).toEqual([
      ["speed", "Speed"],
      ["lidAngle", "Lid"],
    ])
  })

  it("gives a slider what it left out, and keeps its value to its steps", () => {
    expect(one({ kind: "slider" })).toMatchObject({
      min: 0,
      max: 1,
      step: 0,
      value: 0,
    })
    expect(
      one({ kind: "slider", min: 0, max: 90, step: 5, value: 47 })
    ).toMatchObject({ value: 45 })
    expect(one({ kind: "slider", min: 10, max: 20, value: 99 })).toMatchObject({
      value: 20,
    })
  })

  it("takes options as words or in full", () => {
    expect(
      one({
        kind: "buttons",
        options: ["Open", { id: "go", label: "Start", icon: "play" }],
      })
    ).toMatchObject({
      options: [
        { id: "Open", label: "Open", icon: null },
        { id: "go", label: "Start", icon: "play" },
      ],
    })
    expect(
      one({ kind: "buttons", options: [{ icon: "pause" }] })
    ).toMatchObject({ options: [{ id: "pause", label: "", icon: "pause" }] })
  })

  it("starts a choice on its first option unless told", () => {
    expect(one({ kind: "choice", options: ["a", "b"] })).toMatchObject({
      value: "a",
    })
    expect(
      one({ kind: "list", options: ["a", "b"], value: "b" })
    ).toMatchObject({ value: "b" })
  })

  it("offers the app's colours, or those of them that are named", () => {
    expect(one({ kind: "palette" })).toMatchObject({ value: "red" })
    expect(
      one({ kind: "palette", options: ["blue", "#123456", "pink"] })
    ).toMatchObject({ options: ["blue", "pink"], value: "blue" })
  })

  it("sets a control as it was last left, where it still can be", () => {
    expect(one({ kind: "slider", max: 10, value: 2 }, { it: 7 })).toMatchObject(
      { value: 7 }
    )
    expect(
      one({ kind: "choice", options: ["a", "b"] }, { it: "gone" })
    ).toMatchObject({ value: "a" })
    expect(one({ kind: "toggle" }, { it: "yes" })).toMatchObject({
      value: false,
    })
  })

  it("keeps what a control does apart from what it is", () => {
    const press = () => {}
    const format = (n: number) => `${n}°`
    const tool = declared(
      {
        controls: {
          go: { kind: "buttons", options: ["Go"], press },
          angle: { kind: "slider", format },
        },
        frame() {},
      },
      "x"
    )
    expect(tool.doing.press.get("go")).toBe(press)
    expect(tool.doing.format.get("angle")).toBe(format)
    expect(tool.frame).toBeTypeOf("function")
    expect(JSON.stringify(tool.controls)).not.toContain("press")
  })

  it("says what is wrong in words that can be acted on", () => {
    expect(() => declared("nothing", "x")).toThrow(/export default/)
    expect(() => one({ kind: "dial" })).toThrow(
      /controls\.it: kind is "dial"\. It can be slider, pad/
    )
    expect(() => one({ kind: "slider", min: 5, max: 5 })).toThrow(/max/)
    expect(() => one({ kind: "buttons" })).toThrow(/needs options/)
    expect(() =>
      one({ kind: "buttons", options: [{ label: "Go", icon: "rocket" }] })
    ).toThrow(/no icon "rocket"/)
    expect(() => one({ kind: "choice", options: ["a", "a"] })).toThrow(
      /two options called "a"/
    )
    expect(() => one({ kind: "slider", format: "°" })).toThrow(
      /controls\.it\.format is a function/
    )
  })
})

describe("snapped", () => {
  it("leaves no crumbs of arithmetic", () => {
    expect(snapped(0.3, { min: 0, max: 1, step: 0.1 })).toBe(0.3)
    expect(snapped(0.29, { min: 0, max: 1, step: 0.1 })).toBe(0.3)
  })
})

describe("fitted", () => {
  const pad = one({
    kind: "pad",
    x: { min: -10, max: 10 },
    y: { min: 0, max: 5 },
  }) as Control

  it("keeps a pad inside its square", () => {
    expect(pad).toMatchObject({ value: [0, 0] })
    expect(fitted(pad, [99, -3])).toEqual([10, 0])
    expect(fitted(pad, 4)).toBeUndefined()
  })

  it("has nothing to set a row of buttons to", () => {
    expect(
      fitted(one({ kind: "buttons", options: ["Go"] }) as Control, "Go")
    ).toBeUndefined()
  })
})
