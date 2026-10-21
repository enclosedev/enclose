import { describe, expect, it } from "vitest"

import { declared } from "./declare"
import { placed } from "./pose"
import { Running, type Handed } from "./running"
import type { PartFact } from "./types"

const PARTS: PartFact[] = [
  {
    id: "base",
    label: "Base",
    group: "body",
    min: [-10, -10, 0],
    max: [10, 10, 2],
  },
  {
    id: "arm",
    label: "Arm",
    group: "moving",
    min: [0, -1, 2],
    max: [20, 1, 4],
  },
  {
    id: "hand",
    label: "Hand",
    group: "moving",
    min: [20, -1, 2],
    max: [30, 1, 4],
  },
]

/** What a tool is handed, with its controls taken to be set to numbers. */
type Tool = Omit<Handed, "values"> & { values: Record<string, number> }

const run = (tool: unknown, kept = {}) =>
  new Running(declared(tool, "tool", kept), PARTS)

/** Where a point of a part is after a frame, by what the frame said of the part. */
function where(
  frame: ReturnType<Running["tick"]>,
  id: string,
  point: [number, number, number]
) {
  const index = frame.poses!.ids.indexOf(id)
  return placed(
    [...frame.poses!.matrices.slice(index * 16, index * 16 + 16)],
    point
  ).map((n) => Math.round(n * 1000) / 1000)
}

describe("a tool at work", () => {
  it("moves the parts as its controls stand, and says so once", () => {
    const tool = run({
      controls: { angle: { kind: "slider", max: 180, value: 90 } },
      frame(tool: Tool) {
        tool.part("arm").turn({ by: tool.values.angle, about: [0, 0, 3] })
      },
    })
    const first = tool.tick(0, 0)
    expect(first.poses!.ids).toEqual(["arm"])
    expect(where(first, "arm", [20, 0, 3])).toEqual([0, 20, 3])
    expect(tool.tick(16, 0)).toMatchObject({
      poses: null,
      looks: null,
      controls: null,
    })
    tool.set("angle", 180, true)
    expect(where(tool.tick(32, 1), "arm", [20, 0, 3])).toEqual([-20, 0, 3])
  })

  it("turns a part about its own middle, along Z, unless told", () => {
    const tool = run({
      frame(tool: Tool) {
        tool.part("base").turn(90)
      },
    })
    expect(where(tool.tick(0, 0), "base", [10, 0, 0])).toEqual([0, 10, 0])
  })

  it("leaves out a part that was moved and moved back", () => {
    const tool = run({
      frame(tool: Tool) {
        tool.part("arm").move([5, 0, 0]).move([-5, 0, 0])
        tool.part("hand").move([0, 0, 1])
      },
    })
    expect(tool.tick(0, 0).poses!.ids).toEqual(["hand"])
  })

  it("carries what is further along an arm with what it is on", () => {
    const tool = run({
      frame(tool: Tool) {
        // the wrist first, and then all that the elbow carries
        tool.part("hand").turn({ by: 90, about: [20, 0, 3] })
        tool.group("moving").turn({ by: 90, about: [0, 0, 3] })
      },
    })
    const frame = tool.tick(0, 0)
    expect(where(frame, "arm", [20, 0, 3])).toEqual([0, 20, 3])
    expect(where(frame, "hand", [30, 0, 3])).toEqual([-10, 20, 3])
  })

  it("keeps time by the window's clock, and never leaps", () => {
    const seen: number[] = []
    const tool = run({
      frame(tool: Tool) {
        seen.push(tool.dt)
      },
    })
    tool.tick(1000, 0)
    tool.tick(1016, 0)
    tool.tick(9000, 0)
    expect(seen).toEqual([0, 0.016, 0.1])
  })

  it("lets a tool set its own controls, and words what they say", () => {
    let listed: string[] = []
    const tool = run({
      controls: {
        time: {
          kind: "slider",
          max: 60,
          format: (n: number) => `${Math.round(n)} s`,
        },
        running: { kind: "toggle", value: true },
        shown: { kind: "readout" },
      },
      frame(tool: Tool) {
        if (tool.values.running) tool.values.time += tool.dt * 10
        tool.set("shown", `t=${tool.values.time}`)
        listed = Object.keys(tool.values)
      },
    })
    expect(tool.standing()[0]).toMatchObject({ says: "0 s" })
    tool.tick(0, 0)
    const frame = tool.tick(100, 0)
    expect(frame.controls).toMatchObject([
      { id: "time", value: 1, says: "1 s" },
      { id: "running", value: true },
      { id: "shown", value: "t=1" },
    ])
    expect(listed).toEqual(["time", "running", "shown"])
  })

  it("tells the tool of a button pressed and a control changed by hand", () => {
    const heard: unknown[] = []
    const tool = run({
      controls: {
        go: {
          kind: "buttons",
          options: ["start", "stop"],
          press: (option: string) => heard.push(option),
        },
        speed: {
          kind: "slider",
          change: (value: number, tool: Tool) => {
            heard.push(value)
            tool.values.speed = 0.5
          },
        },
      },
    })
    tool.press("go", "stop")
    tool.press("go", "no such button")
    tool.set("speed", 1, true)
    tool.set("speed", "fast", true)
    expect(heard).toEqual(["stop", 1])
    expect(tool.standing()[1]).toMatchObject({ value: 0.5 })
  })

  it("hides parts and colours them, for as long as its frame says so", () => {
    let on = true
    const tool = run({
      frame(tool: Tool) {
        if (!on) return
        tool.part("hand").hide()
        tool.group("moving").color("pink")
      },
    })
    expect(tool.tick(0, 0).looks).toEqual({
      hidden: ["hand"],
      colours: { arm: "pink", hand: "pink" },
    })
    on = false
    expect(tool.tick(16, 0).looks).toEqual({ hidden: [], colours: {} })
  })

  it("says what is wrong with what a tool does", () => {
    expect(() =>
      run({ frame: (tool: Tool) => tool.part("lid") }).tick(0, 0)
    ).toThrow(/no part "lid"\. Its parts are base, arm, hand/)
    expect(() =>
      run({ frame: (tool: Tool) => tool.part("arm").turn({ axis: "z" }) }).tick(
        0,
        0
      )
    ).toThrow(/by is how many degrees/)
    expect(() =>
      run({ frame: (tool: Tool) => tool.part("arm").color("#ff0000") }).tick(
        0,
        0
      )
    ).toThrow(/the colours are red, orange/)
    expect(() =>
      run({ frame: (tool: Tool) => tool.set("speed", 1) }).tick(0, 0)
    ).toThrow(/no control "speed"/)
    // a button is no place to move parts from: it happens once, and a frame is drawn afresh
    const tool = run({
      controls: {
        go: {
          kind: "buttons",
          options: ["go"],
          press: (_: string, tool: Tool) => tool.part("arm").move([1, 0, 0]),
        },
      },
    })
    expect(() => tool.press("go", "go")).toThrow(/moved in frame\(\) only/)
  })

  it("takes a number where it is to be as a machine would, from rest to rest", () => {
    const angles: number[] = []
    const tool = run({
      controls: {
        open: { kind: "toggle", value: false },
      },
      frame(tool: Tool & { values: Record<string, unknown> }) {
        const angle = tool.glide("lid", tool.values.open ? 110 : 0, 1)
        expect(tool.glide("lid", 55, 1)).toBe(angle)
        angles.push(angle)
        tool.part("arm").turn({ by: angle, about: [0, 0, 3] })
      },
    })
    let now = 0
    const frame = () => tool.tick((now += 1000 / 60), 0)
    for (let n = 0; n < 5; n++) expect(frame().poses?.ids ?? []).toEqual([])
    tool.set("open", true, true)
    for (let n = 0; n < 31; n++) frame()
    // half way, half the time on, and nowhere near it at one pace from the start
    expect(angles.at(-1)!).toBeGreaterThan(50)
    expect(angles.at(-1)!).toBeLessThan(60)
    expect(angles.at(-26)!).toBeLessThan(110 / 60)
    expect(frame().settling).toBe(true)
    for (let n = 0; n < 35; n++) frame()
    expect(angles.at(-1)).toBe(110)
    const rested = frame()
    expect(rested.poses).toBeNull()
    expect(rested.settling).toBe(false)
  })

  it("says what a number on its way has to be given", () => {
    const failing = (frame: (tool: Tool) => void) => () =>
      run({ frame }).tick(0, 0)
    expect(failing((tool) => tool.glide(undefined, 1))).toThrow(
      /name is what you call this number/
    )
    expect(failing((tool) => tool.glide("lid", "open"))).toThrow(
      /to is where it is to be/
    )
    expect(failing((tool) => tool.glide("lid", 1, -1))).toThrow(
      /seconds is how long/
    )
  })
})
