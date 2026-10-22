import { describe, expect, it } from "vitest"

import type { Circuit } from "./boards"
import {
  cornersOf,
  holeSaid,
  inspected,
  joinedSaid,
  mmSaid,
  underAt,
  type Pad,
} from "./inspect"

// a board 40 mm by 30 mm about its middle, with a chip on it placed by the board, a
// switch placed by a group of parts, and a trace from the chip to the switch
const circuit: Circuit = [
  {
    type: "pcb_board",
    pcb_board_id: "b",
    center: { x: 0, y: 0 },
    width: 40,
    height: 30,
  },
  {
    type: "pcb_group",
    pcb_group_id: "g",
    center: { x: 9, y: 9 },
    anchor_position: { x: 10, y: 10 },
  },
  { type: "source_component", source_component_id: "s1", name: "U1" },
  { type: "source_component", source_component_id: "s2", name: "SW1" },
  {
    type: "pcb_component",
    pcb_component_id: "c1",
    source_component_id: "s1",
    center: { x: -10, y: -5 },
    width: 6,
    height: 4,
    positioned_relative_to_pcb_board_id: "b",
    display_offset_x: "-10.000000000000002",
  },
  {
    type: "pcb_component",
    pcb_component_id: "c2",
    source_component_id: "s2",
    center: { x: 13, y: 12 },
    width: 3,
    height: 3,
    positioned_relative_to_pcb_group_id: "g",
  },
  {
    type: "source_port",
    source_port_id: "sp1",
    source_component_id: "s1",
    port_hints: ["VBAT", "pin28", "28"],
  },
  { type: "pcb_port", pcb_port_id: "pp1", source_port_id: "sp1" },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pad1",
    pcb_component_id: "c1",
    pcb_port_id: "pp1",
    shape: "rect",
    x: -12,
    y: -5,
    width: 1,
    height: 2,
    layer: "top",
    port_hints: ["unnamed_smtpad1"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pad2",
    pcb_component_id: "c1",
    shape: "rotated_rect",
    x: -8,
    y: -5,
    width: 2,
    height: 1,
    ccw_rotation: 90,
    layer: "top",
    port_hints: ["2"],
  },
  {
    type: "pcb_plated_hole",
    pcb_plated_hole_id: "hole1",
    pcb_component_id: "c2",
    shape: "pill",
    x: 13,
    y: 12,
    outer_width: 2,
    outer_height: 1,
    ccw_rotation: 0,
    layers: ["top", "bottom"],
    port_hints: ["A", "pin1", "pin1_internal_1"],
  },
  { type: "source_net", source_net_id: "n1", name: "VBAT_NET" },
  // a hole the board is fixed by, with a ring kept clear round it, and a peg's of the switch
  {
    type: "pcb_hole",
    pcb_hole_id: "h1",
    pcb_component_id: null,
    hole_shape: "circle",
    hole_diameter: 2.9,
    x: 15,
    y: -10,
  },
  {
    type: "pcb_keepout",
    pcb_keepout_id: "k1",
    shape: "circle",
    radius: 3,
    center: { x: 15, y: -10 },
    layers: ["top", "bottom"],
  },
  {
    type: "pcb_hole",
    pcb_hole_id: "h2",
    pcb_component_id: "c2",
    hole_shape: "pill",
    hole_width: 1,
    hole_height: 0.6,
    x: 14,
    y: 13,
  },
  {
    type: "source_trace",
    source_trace_id: "st1",
    connected_source_net_ids: ["n1"],
    display_name: ".U1 > .VBAT to .SW1 > .A",
  },
  {
    type: "pcb_trace",
    pcb_trace_id: "t1",
    source_trace_id: "st1",
    route: [
      { route_type: "wire", x: -12, y: -5, width: 0.4, layer: "top" },
      { route_type: "wire", x: -12, y: 0, width: 0.4, layer: "top" },
      { route_type: "wire", x: 13, y: 0, width: 0.4, layer: "top" },
    ],
  },
]

describe("inspected", () => {
  const board = inspected(circuit)

  it("calls a pin by its names with its part's, as tscircuit does, but not by its number alone", () => {
    const pad = board.pads.find((one) => one.id === "pad1")!
    expect(pad.names).toEqual(["U1.VBAT", "U1.pin28"])
    // a pin with nothing but a number is called by its part
    expect(board.pads.find((one) => one.id === "pad2")!.names).toEqual(["U1"])
    expect(board.pads.find((one) => one.id === "hole1")!.names).toEqual([
      "SW1.pin1",
      "SW1.A",
    ])
  })

  it("has a hole on both sides of the board, and a pad on its own", () => {
    expect(board.pads.find((one) => one.id === "hole1")!.sides).toEqual([
      "top",
      "bottom",
    ])
    expect(board.pads.find((one) => one.id === "pad1")!.sides).toEqual(["top"])
  })

  it("boxes a part by its pads, and measures it from what it is placed by", () => {
    const chip = board.parts.get("c1")!
    // the pads run from -12.5 to -7.5 across (the second turned upright), -6 to -4 up
    expect(chip.box.x).toBeCloseTo(-10)
    expect(chip.box.w).toBeCloseTo(5)
    expect(chip.box.h).toBeCloseTo(2)
    expect(chip.anchor).toEqual({ x: 0, y: 0 })
    // as far as it was said it is placed, where that was said, and as it lies otherwise
    expect(chip.offset![0]).toBeCloseTo(-10)
    expect(chip.offset![1]).toBeCloseTo(-5)
    // a group's anchor, where it has one
    const button = board.parts.get("c2")!
    expect(button.anchor).toEqual({ x: 10, y: 10 })
    expect(button.offset).toEqual([3, 2])
  })

  it("says how long a trace is, and calls it by its net", () => {
    const [trace] = board.traces
    expect(trace.length).toBeCloseTo(30)
    expect(trace.name).toBe("VBAT_NET")
  })
})

describe("holes", () => {
  const board = inspected(circuit)

  it("places a hole of the board's own from the board's middle, and boxes it with its ring", () => {
    const hole = board.holes.find((one) => one.id === "h1")!
    expect(hole.round).toBe(true)
    expect(hole.w).toBeCloseTo(6)
    expect(hole.placed.name).toBeNull()
    expect(hole.placed.anchor).toEqual({ x: 0, y: 0 })
    expect(hole.placed.offset).toEqual([15, -10])
    expect(holeSaid(hole)).toBe("Hole ⌀2.9 mm")
  })

  it("has a part's hole go with the part, and in its box", () => {
    const hole = board.holes.find((one) => one.id === "h2")!
    expect(hole.placed).toBe(board.parts.get("c2"))
    expect(holeSaid(hole)).toBe("SW1 · Hole 1 × 0.6 mm")
    const box = board.parts.get("c2")!.box
    expect(box.x + box.w / 2).toBeCloseTo(14.5)
  })

  it("finds a hole by its ring, from either side, and a pad before it", () => {
    const ring = underAt(board, { x: 17.8, y: -10 }, "bottom", 0)
    expect(ring?.kind).toBe("hole")
    if (ring?.kind === "hole") expect(ring.part.offset).toEqual([15, -10])
    expect(underAt(board, { x: 14, y: 13 }, "top", 0)?.kind).toBe("hole")
    expect(underAt(board, { x: 13, y: 12 }, "top", 0)?.kind).toBe("pad")
  })
})

describe("underAt", () => {
  const board = inspected(circuit)

  it("finds a pad before the trace that starts on it, and its part with it", () => {
    const under = underAt(board, { x: -12, y: -5.5 }, "top", 0.05)
    expect(under?.kind).toBe("pad")
    if (under?.kind !== "pad") return
    expect(under.pad.id).toBe("pad1")
    expect(under.part?.name).toBe("U1")
  })

  it("goes by how a pad is turned", () => {
    // turned upright, the second pad is 1 across and 2 up and down
    expect(underAt(board, { x: -8, y: -5.9 }, "top", 0)?.kind).toBe("pad")
    expect(underAt(board, { x: -8.9, y: -5 }, "top", 0)?.kind).not.toBe("pad")
  })

  it("finds a trace within its width, and a part's box where nothing else is", () => {
    const trace = underAt(board, { x: 0, y: 0.15 }, "top", 0.05)
    expect(trace?.kind).toBe("trace")
    expect(underAt(board, { x: 0, y: 1 }, "top", 0.05)).toBeNull()
    const part = underAt(board, { x: -10, y: -5.8 }, "top", 0.05)
    expect(part?.kind).toBe("part")
  })

  it("finds a hole from either side, and a pad on one side only from that side", () => {
    expect(underAt(board, { x: 13.9, y: 12 }, "bottom", 0)?.kind).toBe("pad")
    const fromUnder = underAt(board, { x: -12, y: -5.5 }, "bottom", 0)
    // what is on the other side is still found, where nothing on this one is
    expect(fromUnder?.kind).toBe("pad")
  })
})

describe("cornersOf", () => {
  it("turns a pad's box about its middle, and stands out from it", () => {
    const pad: Pad = {
      id: "p",
      x: 1,
      y: 1,
      w: 2,
      h: 1,
      turn: 90,
      round: false,
      sides: ["top"],
      part: null,
      names: [],
    }
    const corners = cornersOf(pad, 0.5)
    const xs = corners.map((one) => one.x)
    const ys = corners.map((one) => one.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3)
  })
})

describe("what is said", () => {
  it("says millimetres to a hundredth, with a true minus", () => {
    expect(mmSaid(-29.729999999999997)).toBe("−29.73 mm")
    expect(mmSaid(32.10000000000001)).toBe("32.1 mm")
    expect(mmSaid(-0.001)).toBe("0 mm")
  })

  it("says what a trace joins plainly", () => {
    expect(joinedSaid(".J1 > .VBUS1 to net.V5")).toBe("J1.VBUS1 to net.V5")
  })
})
