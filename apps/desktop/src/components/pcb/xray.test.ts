import { describe, expect, it } from "vitest"

import type { Hole, Inspected, Pad, Part, Trace, Via } from "./inspect"
import { connectionOf, connectionSaid, partNameOf, xRayOf } from "./xray"

const part: Part = {
  id: "pcb_component_0",
  name: "U1",
  box: { x: 0, y: 0, w: 4, h: 4 },
  anchor: null,
  offset: null,
}
const pad = (id: string, joined: string | null, names: string[] = []) =>
  ({ id, joined, names, part: "pcb_component_0" }) as unknown as Pad
const trace = (id: string, joined: string | null, name: string | null = null) =>
  ({ id, joined, name, points: [], length: 1 }) as Trace
const via = (id: string, joined: string | null) =>
  ({ id, joined, x: 0, y: 0, w: 0.6 }) as Via

const board: Inspected = {
  pads: [
    pad("a", "gnd", ["U1.GND"]),
    pad("b", "vcc", ["U1.VCC"]),
    pad("c", null),
  ],
  holes: [],
  traces: [trace("t1", "gnd"), trace("t2", "vcc", "U1.VCC to C1.pin1")],
  vias: [via("v1", "gnd"), via("v2", "vcc")],
  parts: new Map([["pcb_component_0", part]]),
  nets: [{ name: "GND", joined: "gnd" }],
}

describe("connectionOf", () => {
  it("has the connection of a pad or a trace, and none of a part", () => {
    expect(connectionOf({ kind: "pad", pad: board.pads[0], part })).toBe("gnd")
    expect(connectionOf({ kind: "trace", trace: board.traces[1] })).toBe("vcc")
    expect(connectionOf({ kind: "part", part })).toBeNull()
  })
})

describe("connectionSaid", () => {
  it("says a connection by its net's name, or by what the pointer is over", () => {
    expect(connectionSaid(board, "gnd", null)).toBe("GND")
    expect(
      connectionSaid(board, "vcc", { kind: "trace", trace: board.traces[1] })
    ).toBe("U1.VCC to C1.pin1")
    expect(
      connectionSaid(board, "vcc", { kind: "pad", pad: board.pads[1], part })
    ).toBe("U1.VCC")
    expect(connectionSaid(board, "vcc", null)).toBe("this connection")
  })
})

describe("partNameOf", () => {
  it("has the part of a pad, of a part's hole, or of the part itself, and none of the board's own hole", () => {
    expect(partNameOf(board, { kind: "pad", pad: board.pads[0], part })).toBe(
      "U1"
    )
    expect(partNameOf(board, { kind: "part", part })).toBe("U1")
    const own = {
      part: null,
      placed: { ...part, name: null },
    } as unknown as Hole
    expect(partNameOf(board, { kind: "hole", hole: own, part })).toBeNull()
    expect(
      partNameOf(board, { kind: "trace", trace: board.traces[0] })
    ).toBeNull()
  })
})

describe("xRayOf", () => {
  it("has the traces, pads and vias of the connection, and nothing else", () => {
    const rayed = xRayOf(board, "gnd")
    expect(rayed.traces.map((one) => one.id)).toEqual(["t1"])
    expect(rayed.pads.map((one) => one.id)).toEqual(["a"])
    expect(rayed.vias.map((one) => one.id)).toEqual(["v1"])
  })
})
