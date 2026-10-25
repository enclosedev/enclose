import { describe, expect, it } from "vitest"

import { schematicPartOf } from "./schematic-part"

/** A part as tscircuit has it on a board: its source, its schematic and its place. */
const part = (n: number, source: Record<string, unknown>) => [
  {
    type: "source_component",
    source_component_id: `source_component_${n}`,
    ...source,
  },
  {
    type: "schematic_component",
    schematic_component_id: `schematic_component_${n}`,
    source_component_id: `source_component_${n}`,
  },
  {
    type: "pcb_component",
    pcb_component_id: `pcb_component_${n}`,
    source_component_id: `source_component_${n}`,
    center: { x: 4, y: -2 },
    width: 3,
    height: 1.5,
    layer: "top",
  },
]

describe("schematicPartOf", () => {
  it("says what a part is, its numbers, and where it is on the board", () => {
    const circuit = [
      ...part(0, {
        name: "U1",
        ftype: "simple_chip",
        manufacturer_part_number: "CH224K",
        supplier_part_numbers: { jlcpcb: ["C970725"] },
      }),
    ]
    expect(schematicPartOf(circuit, "schematic_component_0")).toEqual({
      name: "U1",
      title: "CH224K",
      maker: "CH224K",
      jlcpcb: "C970725",
      warnings: [],
      placed: { x: 4, y: -2, w: 3, h: 1.5 },
      side: "top",
    })
  })

  it("says a resistor by its value, and takes LCSC's number where JLCPCB's is not given", () => {
    const circuit = part(0, {
      name: "R1",
      ftype: "simple_resistor",
      display_resistance: "10kΩ",
      supplier_part_numbers: { lcsc: ["C25804"] },
    })
    const said = schematicPartOf(circuit, "schematic_component_0")
    expect(said?.title).toBe("10kΩ resistor")
    expect(said?.maker).toBeNull()
    expect(said?.jlcpcb).toBe("C25804")
  })

  it("has the warnings of the part, of its place, and of the traces to it, each once", () => {
    const circuit = [
      ...part(0, { name: "U1", ftype: "simple_chip" }),
      ...part(1, { name: "U2", ftype: "simple_chip" }),
      {
        type: "source_component_pins_underspecified_warning",
        source_component_id: "source_component_0",
        message: "All pins on U1 are underspecified",
      },
      {
        type: "pcb_trace_warning",
        pcb_component_ids: ["pcb_component_0", "pcb_component_1"],
        message: "Trace is routed thinner than requested",
      },
      {
        type: "pcb_trace_warning",
        pcb_component_ids: ["pcb_component_0"],
        message: "Trace is routed thinner than requested",
      },
      {
        type: "pcb_placement_error",
        pcb_component_id: "pcb_component_0",
        message: "U1 is off the board",
      },
      {
        type: "source_component_pins_underspecified_warning",
        source_component_id: "source_component_1",
        message: "All pins on U2 are underspecified",
      },
    ]
    expect(schematicPartOf(circuit, "schematic_component_0")?.warnings).toEqual(
      [
        "All pins on U1 are underspecified",
        "Trace is routed thinner than requested",
        "U1 is off the board",
      ]
    )
  })

  it("has nothing for a drawing of no part", () => {
    expect(schematicPartOf([], "schematic_component_0")).toBeNull()
  })
})
