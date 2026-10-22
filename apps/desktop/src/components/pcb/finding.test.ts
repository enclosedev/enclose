import { describe, expect, it } from "vitest"

import type { Circuit } from "./boards"
import {
  findablesOf,
  foundBox,
  foundSaid,
  lookFor,
  ofNet,
  partsIn,
} from "./finding"
import { inspected } from "./inspect"

// two capacitors, a connector with a ground pin and one for power, and a chip's ground
// pin joined to the connector's by the ground net: by a trace that goes through a via
const part = (id: string, name: string, ftype: string, x: number) => [
  {
    type: "source_component",
    source_component_id: `s${id}`,
    name,
    ftype,
    ...(ftype === "simple_capacitor" && { display_capacitance: "100nF" }),
  },
  {
    type: "pcb_component",
    pcb_component_id: `c${id}`,
    source_component_id: `s${id}`,
    center: { x, y: 0 },
    width: 2,
    height: 1,
  },
]
const pin = (
  id: string,
  owner: string,
  hints: string[],
  x: number,
  key?: string
) => [
  {
    type: "source_port",
    source_port_id: `sp${id}`,
    source_component_id: `s${owner}`,
    port_hints: hints,
    ...(key && { subcircuit_connectivity_map_key: key }),
  },
  { type: "pcb_port", pcb_port_id: `pp${id}`, source_port_id: `sp${id}` },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: `pad${id}`,
    pcb_component_id: `c${owner}`,
    pcb_port_id: `pp${id}`,
    shape: "rect",
    x,
    y: 0,
    width: 0.5,
    height: 0.5,
    layer: "top",
  },
]
const circuit = [
  {
    type: "pcb_board",
    pcb_board_id: "b",
    center: { x: 0, y: 0 },
    width: 40,
    height: 30,
  },
  ...part("1", "C1", "simple_capacitor", -10),
  ...part("2", "C10", "simple_capacitor", -5),
  ...part("3", "J1", "simple_chip", 5),
  ...part("4", "U1", "simple_chip", 12),
  ...pin("1", "1", ["1"], -10.5),
  ...pin("2", "3", ["GND1", "pin8"], 4.5, "net1"),
  ...pin("3", "3", ["VBUS1", "pin2"], 5.5),
  // (the chip's pin is joined to the net by its trace alone)
  ...pin("4", "4", ["GND"], 12),
  {
    type: "source_net",
    source_net_id: "n1",
    name: "GND",
    subcircuit_connectivity_map_key: "net1",
  },
  { type: "source_net", source_net_id: "n2", name: "V5" },
  {
    type: "source_trace",
    source_trace_id: "st1",
    connected_source_port_ids: ["sp4"],
    connected_source_net_ids: ["n1"],
  },
  {
    type: "pcb_trace",
    pcb_trace_id: "t1",
    source_trace_id: "st1",
    route: [
      { route_type: "wire", x: 4.5, y: 0, width: 0.3, layer: "top" },
      { route_type: "via", x: 8, y: 4, from_layer: "top", to_layer: "bottom" },
      { route_type: "wire", x: 12, y: 0, width: 0.3, layer: "bottom" },
    ],
  },
  // a via that says its connection, and one that does not, on the trace
  {
    type: "pcb_via",
    pcb_via_id: "v1",
    x: 0,
    y: 9,
    outer_diameter: 0.6,
    subcircuit_connectivity_map_key: "net1",
  },
  { type: "pcb_via", pcb_via_id: "v2", x: 8, y: 4, outer_diameter: 0.6 },
] as Circuit

const board = inspected(circuit)
const things = findablesOf(board, circuit)
const said = (name: string) => lookFor(things, name).map((one) => one.said)

describe("lookFor", () => {
  it("finds a part by its name, and only it where one is called that", () => {
    expect(said("C1")).toEqual(["C1"])
    expect(said("c1")).toEqual(["C1"])
    // and those it begins otherwise, in the order they are counted: and not the pins
    // it begins, while there are parts it does
    expect(said("C")).toEqual(["C1", "C10"])
    expect(said("vb")).toEqual(["J1.VBUS1"])
  })

  it("finds parts by what they are, where nothing is called so", () => {
    expect(said("capacitor")).toEqual(["C1", "C10"])
    expect(said("chip")).toEqual(["J1", "U1"])
    expect(said("cap")).toEqual(["C1", "C10"])
    expect(said("100nF cap")).toEqual(["C1", "C10"])
  })

  it("finds a pin by its own name, said with its part's", () => {
    expect(said("GND1")).toEqual(["J1.GND1"])
    expect(said("vbus")).toEqual(["J1.VBUS1"])
    // a part's name alone is the part, and not its pins
    expect(said("J1")).toEqual(["J1"])
    // until its pins are what is typed
    // (each by the name that says most)
    expect(said("J1.")).toEqual(["J1.GND1", "J1.VBUS1"])
    expect(said("pin8")).toEqual(["J1.pin8"])
    // a pin called by nothing but a number is not one to find
    expect(
      things.some((one) => one.kind === "pin" && one.pad.id === "pad1")
    ).toBe(false)
  })

  it("finds a net by its name, with the pins called the same", () => {
    const found = lookFor(things, "gnd")
    expect(found.map(({ thing }) => thing.kind)).toEqual(["pin", "net"])
    expect(found.map((one) => one.said)).toEqual(["U1.GND", "GND"])
    expect(foundSaid(found)).toBe("1 pin, 1 net")
  })

  it("finds nothing for nothing", () => {
    expect(lookFor(things, "  ")).toEqual([])
    expect(lookFor(things, "zz")).toEqual([])
  })
})

describe("a net", () => {
  it("is the pads, traces and vias joined to it, however that is said", () => {
    const gnd = board.nets.find((net) => net.name === "GND")!
    const { pads, traces, vias } = ofNet(board, gnd.joined)
    expect(pads.map((pad) => pad.id).sort()).toEqual(["pad2", "pad4"])
    expect(traces.map((trace) => trace.id)).toEqual(["t1"])
    expect(vias.map((via) => via.id).sort()).toEqual(["v1", "v2"])
  })

  it("lights the parts it is on, and a pin its part", () => {
    expect(partsIn(lookFor(things, "GND"), board).sort()).toEqual(["J1", "U1"])
    expect(partsIn(lookFor(things, "VBUS1"), board)).toEqual(["J1"])
  })

  it("goes to a pin's part, to be seen among it", () => {
    const box = foundBox(lookFor(things, "GND1"), board)!
    expect(box.x).toBeCloseTo(board.parts.get("c3")!.box.x)
    expect(box.w).toBeCloseTo(board.parts.get("c3")!.box.w)
  })

  it("is gone to as all of it", () => {
    const box = foundBox(
      lookFor(things, "GND").filter(({ thing }) => thing.kind === "net"),
      board
    )!
    // from the via at 0, 9 to the chip's pad
    expect(box.x - box.w / 2).toBeCloseTo(-0.3)
    expect(box.x + box.w / 2).toBeCloseTo(12.25)
    expect(box.y + box.h / 2).toBeCloseTo(9.3)
  })
})
