// Main plate board: the controller behind a wall plate that holds two split-flap
// display cubes, each cube turning two 28BYJ-48 steppers (four modules in all).
//
// The idea follows Scott Bezek's open-source splitflap project
// (github.com/scottbez1/splitflap, Apache 2.0) and its Chainlink Driver: power shift
// registers sinking the stepper coils, a hall-effect home sensor per module read back
// through a parallel-in shift register, and an ESP32 in charge. The circuit, parts and
// layout here are this board's own.
import { ESP32_C3_WROOM_02_N4 } from "./lib/esp32-c3-wroom-02"
import { TYPE_C_6P } from "./lib/usb-c-6p"
import { DC_005_2_0 } from "./lib/dc-jack"
import { B5B_XH_A_LF__SN_ } from "./lib/xh5"
import { B3B_XH_A_LF__SN_ } from "./lib/xh3"
import { TS_1187A_B_A_B } from "./lib/tact"

// ---------------------------------------------------------------------------------
// The board: 100 x 64 mm, corners rounded 3 mm
const W = 100
const H = 64
const CORNER = 3
const outline = (() => {
  const points: { x: number; y: number }[] = []
  const corners = [
    { cx: W / 2 - CORNER, cy: H / 2 - CORNER, from: 0 },
    { cx: -W / 2 + CORNER, cy: H / 2 - CORNER, from: 90 },
    { cx: -W / 2 + CORNER, cy: -H / 2 + CORNER, from: 180 },
    { cx: W / 2 - CORNER, cy: -H / 2 + CORNER, from: 270 },
  ]
  for (const { cx, cy, from } of corners)
    for (let step = 0; step <= 12; step++) {
      const a = ((from + (step * 90) / 12) * Math.PI) / 180
      points.push({
        x: cx + CORNER * Math.cos(a),
        y: cy + CORNER * Math.sin(a),
      })
    }
  return points
})()

// M3 mounting holes: a pan head is 5.6 mm across, so a keep-out of 2.8 + 0.5 mm
const HOLES = [
  { x: -46, y: 28 },
  { x: 46, y: 28 },
  { x: -46, y: -28 },
  { x: 46, y: -28 },
]

// ---------------------------------------------------------------------------------
// Parts written here
const TPIC6B595 = (props: any) => (
  <chip
    manufacturerPartNumber="TPIC6B595DWR"
    footprint="soic20_w11.3mm_pl2mm_pw0.6mm"
    pinLabels={{
      pin1: "NC1",
      pin2: "VCC",
      pin3: "SER_IN",
      pin4: "DRAIN0",
      pin5: "DRAIN1",
      pin6: "DRAIN2",
      pin7: "DRAIN3",
      pin8: "SRCLR",
      pin9: "G",
      pin10: "GND1",
      pin11: "GND2",
      pin12: "RCK",
      pin13: "SRCK",
      pin14: "DRAIN4",
      pin15: "DRAIN5",
      pin16: "DRAIN6",
      pin17: "DRAIN7",
      pin18: "SER_OUT",
      pin19: "GND3",
      pin20: "NC2",
    }}
    noConnect={["NC1", "NC2"]}
    schPinArrangement={{
      leftSide: {
        pins: [
          "VCC",
          "SER_IN",
          "SRCK",
          "RCK",
          "SRCLR",
          "G",
          "GND1",
          "GND2",
          "GND3",
        ],
        direction: "top-to-bottom",
      },
      rightSide: {
        pins: [
          "DRAIN0",
          "DRAIN1",
          "DRAIN2",
          "DRAIN3",
          "DRAIN4",
          "DRAIN5",
          "DRAIN6",
          "DRAIN7",
          "SER_OUT",
        ],
        direction: "top-to-bottom",
      },
    }}
    {...props}
  />
)

const AMS1117_3_3 = (props: any) => (
  <chip
    manufacturerPartNumber="AMS1117-3.3"
    supplierPartNumbers={{ jlcpcb: ["C6186"] }}
    footprint="sot223"
    pinLabels={{ pin1: "GND", pin2: "VOUT", pin3: "VIN", pin4: "TAB" }}
    schPinArrangement={{
      leftSide: { pins: ["VIN"], direction: "top-to-bottom" },
      rightSide: { pins: ["VOUT", "TAB"], direction: "top-to-bottom" },
      bottomSide: { pins: ["GND"], direction: "left-to-right" },
    }}
    {...props}
  />
)

// a single-supply translating buffer: 3.3 V in, 5 V out, for the drivers' inputs
const SN74LV1T34 = (props: any) => (
  <chip
    manufacturerPartNumber="SN74LV1T34DBVR"
    footprint="sot23_5"
    pinLabels={{ pin1: "NC", pin2: "A", pin3: "GND", pin4: "Y", pin5: "VCC" }}
    noConnect={["NC"]}
    schPinArrangement={{
      leftSide: { pins: ["A"], direction: "top-to-bottom" },
      rightSide: { pins: ["Y"], direction: "top-to-bottom" },
      topSide: { pins: ["VCC"], direction: "left-to-right" },
      bottomSide: { pins: ["GND"], direction: "left-to-right" },
    }}
    {...props}
  />
)

const HC165 = (props: any) => (
  <chip
    manufacturerPartNumber="74HC165D,653"
    supplierPartNumbers={{ jlcpcb: ["C5613"] }}
    footprint="soic16_w6.9mm_pl1.95mm_pw0.6mm"
    pinLabels={{
      pin1: "PL_N",
      pin2: "CP",
      pin3: "D4",
      pin4: "D5",
      pin5: "D6",
      pin6: "D7",
      pin7: "Q7_N",
      pin8: "GND",
      pin9: "Q7",
      pin10: "DS",
      pin11: "D0",
      pin12: "D1",
      pin13: "D2",
      pin14: "D3",
      pin15: "CE_N",
      pin16: "VCC",
    }}
    noConnect={["Q7_N"]}
    schPinArrangement={{
      rightSide: {
        pins: ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "DS"],
        direction: "top-to-bottom",
      },
      leftSide: {
        pins: ["VCC", "PL_N", "CP", "CE_N", "Q7", "Q7_N", "GND"],
        direction: "top-to-bottom",
      },
    }}
    {...props}
  />
)

const MOTOR_PINS = {
  pin1: "BLU",
  pin2: "PNK",
  pin3: "YEL",
  pin4: "ORG",
  pin5: "VM",
}
const HALL_PINS = { pin1: "VCC", pin2: "OUT", pin3: "GND" }

// The four modules: two per cube, and where each one's connectors and parts go
const MODULES = [
  { id: "A1", x: -34.6, driver: "U3", drains: [0, 1, 2, 3], sense: "D0" },
  { id: "A2", x: -18.05, driver: "U3", drains: [4, 5, 6, 7], sense: "D1" },
  { id: "B1", x: 18.05, driver: "U4", drains: [0, 1, 2, 3], sense: "D2" },
  { id: "B2", x: 34.6, driver: "U4", drains: [4, 5, 6, 7], sense: "D3" },
]

const POWER = "0.3mm"
const MOTOR = "0.25mm"

const label = (text: string, x: number, y: number, size = 0.8, rot = 0) => (
  <silkscreentext
    text={text}
    pcbX={x}
    pcbY={y}
    fontSize={`${size}mm`}
    pcbRotation={rot}
  />
)

export default () => (
  <board
    outline={outline}
    thickness="1.6mm"
    title="SPLIT-FLAP MAIN v1.0"
    routeRemaining
  >
    <schematicsection name="power" displayName="Power in, 5 V and 3.3 V" />
    <schematicsection name="mcu" displayName="ESP32-C3 controller" />
    <schematicsection name="drive" displayName="Stepper drive" />
    <schematicsection name="sense" displayName="Home sensors" />

    {/* ------------------------------------------------------------ power */}
    <TYPE_C_6P
      name="J1"
      pcbX={-44.9}
      pcbY={14}
      pcbRotation={270}
      schX={-16}
      schY={8}
      schSectionName="power"
    />
    <fuse
      name="F1"
      currentRating="500mA"
      voltageRating="24V"
      footprint="1206"
      manufacturerPartNumber="nSMD025-24V"
      supplierPartNumbers={{ jlcpcb: ["C70069"] }}
      pcbX={-37.5}
      pcbY={19}
      schX={-12.5}
      schY={9}
      schSectionName="power"
    />
    <resistor
      name="R1"
      resistance="5.1k"
      footprint="0603"
      pcbX={-39.4}
      pcbY={15.2}
      schX={-13}
      schY={6.6}
      schRotation={90}
      schSectionName="power"
    />
    <resistor
      name="R2"
      resistance="5.1k"
      footprint="0603"
      pcbX={-39.4}
      pcbY={12.4}
      schX={-11.6}
      schY={6.6}
      schRotation={90}
      schSectionName="power"
    />

    <AMS1117_3_3
      name="U2"
      pcbX={-38}
      pcbY={3}
      schX={-8}
      schY={9}
      schSectionName="power"
    />
    <capacitor
      name="C1"
      capacitance="10uF"
      footprint="0805"
      pcbX={-44.5}
      pcbY={3}
      pcbRotation={90}
      schX={-10}
      schY={7.6}
      schRotation={90}
      schSectionName="power"
    />
    <capacitor
      name="C2"
      capacitance="22uF"
      footprint="0805"
      pcbX={-31}
      pcbY={3.4}
      pcbRotation={90}
      schX={-6}
      schY={7.6}
      schRotation={90}
      schSectionName="power"
    />

    <DC_005_2_0
      name="J2"
      pcbX={-39.4}
      pcbY={-10}
      schX={-16}
      schY={4}
      schSectionName="power"
    />
    <diode
      name="D1"
      footprint="sma"
      manufacturerPartNumber="SS34"
      supplierPartNumbers={{ jlcpcb: ["C8678"] }}
      pinLabels={{ pin1: ["cathode"], pin2: ["anode"] }}
      pcbX={-31.4}
      pcbY={-8}
      pcbRotation={180}
      schX={-12.5}
      schY={4.2}
      schSectionName="power"
    />
    <capacitor
      name="C3"
      capacitance="22uF"
      maxVoltageRating="25V"
      footprint="1206"
      pcbX={-31}
      pcbY={-11.6}
      schX={-10}
      schY={3}
      schRotation={90}
      schSectionName="power"
    />
    <capacitor
      name="C4"
      capacitance="22uF"
      maxVoltageRating="25V"
      footprint="1206"
      pcbX={-31}
      pcbY={-15.4}
      schX={-8.6}
      schY={3}
      schRotation={90}
      schSectionName="power"
    />

    <led
      name="D6"
      color="green"
      footprint="0603"
      pcbX={-38.6}
      pcbY={-1.8}
      schX={-4.5}
      schY={7.2}
      schRotation={270}
      schSectionName="power"
    />
    <resistor
      name="R13"
      resistance="1k"
      footprint="0603"
      pcbX={-35.4}
      pcbY={-1.8}
      pcbRotation={180}
      schX={-4.5}
      schY={8.6}
      schRotation={90}
      schSectionName="power"
    />
    <led
      name="D7"
      color="orange"
      footprint="0603"
      pcbX={-36.5}
      pcbY={-18.5}
      schX={-6.8}
      schY={2.6}
      schRotation={270}
      schSectionName="power"
    />
    <resistor
      name="R14"
      resistance="4.7k"
      footprint="0603"
      pcbX={-33.5}
      pcbY={-18.5}
      pcbRotation={180}
      schX={-6.8}
      schY={4}
      schRotation={90}
      schSectionName="power"
    />

    <testpoint
      name="TP1"
      footprintVariant="pad"
      padDiameter="1.5mm"
      pcbX={-27}
      pcbY={-17}
      schX={-5.5}
      schY={4.6}
      schSectionName="power"
    />
    <testpoint
      name="TP2"
      footprintVariant="pad"
      padDiameter="1.5mm"
      pcbX={-27}
      pcbY={-20}
      schX={-5.5}
      schY={3.8}
      schSectionName="power"
    />
    <testpoint
      name="TP3"
      footprintVariant="pad"
      padDiameter="1.5mm"
      pcbX={-24}
      pcbY={-17}
      schX={-5.5}
      schY={3}
      schSectionName="power"
    />
    <testpoint
      name="TP4"
      footprintVariant="pad"
      padDiameter="1.5mm"
      pcbX={-24}
      pcbY={-20}
      schX={-5.5}
      schY={2.2}
      schSectionName="power"
    />

    <trace from=".J1 > .VBUS1" to="net.VBUS" thickness={POWER} />
    <trace from=".J1 > .VBUS2" to="net.VBUS" thickness={POWER} />
    <trace from=".J1 > .GND1" to="net.GND" thickness={POWER} />
    <trace from=".J1 > .GND2" to="net.GND" thickness={POWER} />
    <trace from=".J1 > .EH" to="net.GND" />
    <trace from=".J1 > .CC1" to=".R1 > .pin1" />
    <trace from=".J1 > .CC2" to=".R2 > .pin1" />
    <trace from=".R1 > .pin2" to="net.GND" />
    <trace from=".R2 > .pin2" to="net.GND" />
    <trace from=".F1 > .pin1" to="net.VBUS" thickness={POWER} />
    <trace from=".F1 > .pin2" to="net.V5" thickness={POWER} />
    <trace from=".U2 > .VIN" to="net.V5" thickness={POWER} />
    <trace from=".U2 > .GND" to="net.GND" thickness={POWER} />
    <trace from=".U2 > .VOUT" to="net.V3V3" thickness={POWER} />
    <trace from=".U2 > .TAB" to="net.V3V3" thickness={POWER} />
    <trace from=".C1 > .pin1" to="net.V5" thickness={POWER} />
    <trace from=".C1 > .pin2" to="net.GND" thickness={POWER} />
    <trace from=".C2 > .pin1" to="net.V3V3" thickness={POWER} />
    <trace from=".C2 > .pin2" to="net.GND" thickness={POWER} />

    <trace from=".J2 > .pin4" to=".D1 > .anode" thickness={POWER} />
    <trace from=".J2 > .pin3" to="net.GND" thickness={POWER} />
    <trace from=".J2 > .pin2" to="net.GND" thickness={POWER} />
    <trace from=".D1 > .cathode" to="net.VMOT" thickness={POWER} />
    <trace from=".C3 > .pin1" to="net.VMOT" thickness={POWER} />
    <trace from=".C3 > .pin2" to="net.GND" thickness={POWER} />
    <trace from=".C4 > .pin1" to="net.VMOT" thickness={POWER} />
    <trace from=".C4 > .pin2" to="net.GND" thickness={POWER} />

    <trace from=".R13 > .pin1" to="net.V3V3" />
    <trace from=".R13 > .pin2" to=".D6 > .anode" />
    <trace from=".D6 > .cathode" to="net.GND" />
    <trace from=".R14 > .pin1" to="net.VMOT" />
    <trace from=".R14 > .pin2" to=".D7 > .anode" />
    <trace from=".D7 > .cathode" to="net.GND" />

    <trace from=".TP1 > .pin1" to="net.VMOT" />
    <trace from=".TP2 > .pin1" to="net.V5" />
    <trace from=".TP3 > .pin1" to="net.V3V3" />
    <trace from=".TP4 > .pin1" to="net.GND" />

    {/* ------------------------------------------------------------ controller */}
    <ESP32_C3_WROOM_02_N4
      name="U1"
      pcbX={0}
      pcbY={18.4}
      schX={4}
      schY={7}
      schSectionName="mcu"
      schPinArrangement={{
        leftSide: {
          pins: ["3V3", "EN", "IO9", "IO8", "GND", "EP", "RXD", "TXD"],
          direction: "top-to-bottom",
        },
        rightSide: {
          pins: [
            "IO4",
            "IO5",
            "IO6",
            "IO7",
            "IO10",
            "IO2",
            "IO3",
            "IO18",
            "IO19",
            "IO0",
            "IO1",
          ],
          direction: "top-to-bottom",
        },
      }}
    />
    {/* nothing under the antenna, on either side */}
    <keepout
      shape="rect"
      width="18.4mm"
      height="6.6mm"
      pcbX={0}
      pcbY={28.7}
      layers={["top", "bottom"]}
      allowPlacements
    />

    <capacitor
      name="C5"
      capacitance="100nF"
      footprint="0603"
      pcbX={-12.4}
      pcbY={20.4}
      pcbRotation={90}
      schX={0.6}
      schY={9.4}
      schRotation={90}
      schSectionName="mcu"
    />
    <capacitor
      name="C6"
      capacitance="10uF"
      footprint="0805"
      pcbX={-15.2}
      pcbY={20.4}
      pcbRotation={90}
      schX={-0.8}
      schY={9.4}
      schRotation={90}
      schSectionName="mcu"
    />
    <resistor
      name="R3"
      resistance="10k"
      footprint="0603"
      pcbX={-12.4}
      pcbY={16.6}
      pcbRotation={270}
      schX={1.2}
      schY={4.6}
      schRotation={90}
      schSectionName="mcu"
    />
    <capacitor
      name="C10"
      capacitance="1uF"
      footprint="0603"
      pcbX={-15.2}
      pcbY={16.6}
      pcbRotation={90}
      schX={0.2}
      schY={4.6}
      schRotation={90}
      schSectionName="mcu"
    />
    <resistor
      name="R4"
      resistance="10k"
      footprint="0603"
      pcbX={-12.4}
      pcbY={12.8}
      pcbRotation={90}
      schX={2.6}
      schY={4.6}
      schRotation={90}
      schSectionName="mcu"
    />
    <TS_1187A_B_A_B
      name="SW1"
      pcbX={-4.5}
      pcbY={6.5}
      schX={0.2}
      schY={3}
      schSectionName="mcu"
    />
    <TS_1187A_B_A_B
      name="SW2"
      pcbX={4.5}
      pcbY={6.5}
      schX={2.2}
      schY={3}
      schSectionName="mcu"
    />
    <led
      name="D8"
      color="blue"
      footprint="0603"
      pinLabels={{ pin1: ["cathode"], pin2: ["anode"] }}
      pcbX={12.6}
      pcbY={6}
      pcbRotation={90}
      schX={-0.6}
      schY={6.4}
      schRotation={90}
      schSectionName="mcu"
    />
    <resistor
      name="R15"
      resistance="1k"
      footprint="0603"
      pcbX={12.6}
      pcbY={9.4}
      pcbRotation={270}
      schX={-0.6}
      schY={7.8}
      schRotation={90}
      schSectionName="mcu"
    />

    <pinheader
      name="J11"
      pinCount={6}
      pitch="2.54mm"
      gender="male"
      showSilkscreenPinLabels
      pinLabels={["GND", "3V3", "TXD", "RXD", "EN", "IO9"]}
      pcbX={0}
      pcbY={-28}
      schX={8.6}
      schY={9}
      schSectionName="mcu"
    />
    <pinheader
      name="J12"
      pinCount={6}
      pitch="2.54mm"
      gender="male"
      showSilkscreenPinLabels
      pinLabels={["3V3", "GND", "SDA", "SCL", "IO0", "IO1"]}
      pcbX={46.5}
      pcbY={2}
      pcbRotation={90}
      schX={8.6}
      schY={5}
      schSectionName="mcu"
    />

    <trace from=".U1 > .3V3" to="net.V3V3" thickness={POWER} />
    <trace from=".U1 > .GND" to="net.GND" thickness={POWER} />
    <trace from=".U1 > .EP" to="net.GND" thickness={POWER} />
    <trace from=".C5 > .pin1" to="net.V3V3" />
    <trace from=".C5 > .pin2" to="net.GND" />
    <trace from=".C6 > .pin1" to="net.V3V3" />
    <trace from=".C6 > .pin2" to="net.GND" />
    <trace from=".U1 > .EN" to="net.EN" />
    <trace from=".R3 > .pin1" to="net.V3V3" />
    <trace from=".R3 > .pin2" to="net.EN" />
    <trace from=".C10 > .pin1" to="net.EN" />
    <trace from=".C10 > .pin2" to="net.GND" />
    <trace from=".SW1 > .pin1" to="net.EN" />
    <trace from=".SW1 > .pin4" to="net.GND" />
    <trace from=".U1 > .IO9" to="net.BOOT" />
    <trace from=".R4 > .pin1" to="net.V3V3" />
    <trace from=".R4 > .pin2" to="net.BOOT" />
    <trace from=".SW2 > .pin1" to="net.BOOT" />
    <trace from=".SW2 > .pin4" to="net.GND" />
    <trace from=".R15 > .pin1" to="net.V3V3" />
    <trace from=".R15 > .pin2" to=".D8 > .anode" />
    <trace from=".D8 > .cathode" to=".U1 > .IO8" />

    <trace from=".J11 > .GND" to="net.GND" />
    <trace from=".J11 > .3V3" to="net.V3V3" />
    <trace from=".J11 > .TXD" to=".U1 > .TXD" />
    <trace from=".J11 > .RXD" to=".U1 > .RXD" />
    <trace from=".J11 > .EN" to="net.EN" />
    <trace from=".J11 > .IO9" to="net.BOOT" />
    <trace from=".J12 > .3V3" to="net.V3V3" />
    <trace from=".J12 > .GND" to="net.GND" />
    <trace from=".J12 > .SDA" to=".U1 > .IO18" />
    <trace from=".J12 > .SCL" to=".U1 > .IO19" />
    <trace from=".J12 > .IO0" to=".U1 > .IO0" />
    <trace from=".J12 > .IO1" to=".U1 > .IO1" />

    {/* ------------------------------------------------------------ stepper drive */}
    <SN74LV1T34
      name="U6"
      pcbX={-12.6}
      pcbY={8.2}
      schX={-12}
      schY={-1.5}
      schSectionName="drive"
    />
    <SN74LV1T34
      name="U7"
      pcbX={-12.6}
      pcbY={3.4}
      schX={-12}
      schY={-3.5}
      schSectionName="drive"
    />
    <SN74LV1T34
      name="U8"
      pcbX={-12.6}
      pcbY={-1.4}
      schX={-12}
      schY={-5.5}
      schSectionName="drive"
    />
    <capacitor
      name="C11"
      capacitance="100nF"
      footprint="0603"
      pcbX={-15.6}
      pcbY={-4.6}
      pcbRotation={90}
      schX={-14}
      schY={-3.5}
      schRotation={90}
      schSectionName="drive"
    />
    {/* motors off until the controller says otherwise */}
    <mosfet
      name="Q1"
      channelType="n"
      mosfetMode="enhancement"
      footprint="sot23"
      manufacturerPartNumber="2N7002"
      supplierPartNumbers={{ jlcpcb: ["C8545"] }}
      pcbX={-4}
      pcbY={-1}
      schX={-12}
      schY={-8}
      schSectionName="drive"
    />
    <resistor
      name="R16"
      resistance="10k"
      footprint="0603"
      pcbX={-0.4}
      pcbY={-0.8}
      pcbRotation={90}
      schX={-10.2}
      schY={-7.2}
      schRotation={90}
      schSectionName="drive"
    />
    <resistor
      name="R17"
      resistance="100k"
      footprint="0603"
      pcbX={-7.4}
      pcbY={-3.5}
      pcbRotation={90}
      schX={-13.6}
      schY={-8.8}
      schRotation={90}
      schSectionName="drive"
    />

    <TPIC6B595
      name="U3"
      pcbX={-23}
      pcbY={4}
      schX={-6}
      schY={-3}
      schSectionName="drive"
    />
    <TPIC6B595
      name="U4"
      pcbX={23}
      pcbY={4}
      schX={-6}
      schY={-8.5}
      schSectionName="drive"
    />
    <capacitor
      name="C7"
      capacitance="100nF"
      footprint="0603"
      pcbX={-23}
      pcbY={12.3}
      schX={-8.6}
      schY={-1}
      schRotation={90}
      schSectionName="drive"
    />
    <capacitor
      name="C8"
      capacitance="100nF"
      footprint="0603"
      pcbX={23}
      pcbY={12.3}
      schX={-8.6}
      schY={-6.5}
      schRotation={90}
      schSectionName="drive"
    />

    <trace from=".U6 > .A" to=".U1 > .IO4" />
    <trace from=".U7 > .A" to=".U1 > .IO5" />
    <trace from=".U8 > .A" to=".U1 > .IO6" />
    {[".U6", ".U7", ".U8"].map((u) => (
      <>
        <trace from={`${u} > .VCC`} to="net.V5" />
        <trace from={`${u} > .GND`} to="net.GND" />
      </>
    ))}
    <trace from=".C11 > .pin1" to="net.V5" />
    <trace from=".C11 > .pin2" to="net.GND" />
    <trace from=".U6 > .Y" to=".U3 > .SER_IN" />
    <trace from=".U3 > .SER_OUT" to=".U4 > .SER_IN" />
    <trace from=".U7 > .Y" to="net.SRCK" />
    <trace from=".U8 > .Y" to="net.RCK" />
    <trace from=".U1 > .IO7" to=".Q1 > .gate" />
    <trace from=".R17 > .pin1" to=".Q1 > .gate" />
    <trace from=".R17 > .pin2" to="net.GND" />
    <trace from=".Q1 > .source" to="net.GND" />
    <trace from=".Q1 > .drain" to="net.MOT_EN_N" />
    <trace from=".R16 > .pin1" to="net.V5" />
    <trace from=".R16 > .pin2" to="net.MOT_EN_N" />
    {[".U3", ".U4"].map((u) => (
      <>
        <trace from={`${u} > .VCC`} to="net.V5" />
        <trace from={`${u} > .SRCLR`} to="net.V5" />
        <trace from={`${u} > .SRCK`} to="net.SRCK" />
        <trace from={`${u} > .RCK`} to="net.RCK" />
        <trace from={`${u} > .G`} to="net.MOT_EN_N" />
        <trace from={`${u} > .GND1`} to="net.GND" thickness={POWER} />
        <trace from={`${u} > .GND2`} to="net.GND" thickness={POWER} />
        <trace from={`${u} > .GND3`} to="net.GND" thickness={POWER} />
      </>
    ))}
    <trace from=".C7 > .pin1" to="net.V5" />
    <trace from=".C7 > .pin2" to="net.GND" />
    <trace from=".C8 > .pin1" to="net.V5" />
    <trace from=".C8 > .pin2" to="net.GND" />

    {/* ------------------------------------------------------------ the four modules */}
    <HC165
      name="U5"
      pcbX={33}
      pcbY={-8}
      pcbRotation={270}
      schX={7}
      schY={-5.4}
      schSectionName="sense"
    />
    <capacitor
      name="C9"
      capacitance="100nF"
      footprint="0603"
      pcbX={41.6}
      pcbY={-8}
      pcbRotation={90}
      schX={4.4}
      schY={-2.4}
      schRotation={90}
      schSectionName="sense"
    />
    <trace from=".U5 > .VCC" to="net.V3V3" />
    <trace from=".U5 > .GND" to="net.GND" />
    <trace from=".C9 > .pin1" to="net.V3V3" />
    <trace from=".C9 > .pin2" to="net.GND" />
    <trace from=".U5 > .PL_N" to=".U1 > .IO10" />
    <trace from=".U5 > .CP" to=".U1 > .IO2" />
    <trace from=".U5 > .Q7" to=".U1 > .IO3" />
    <trace from=".U5 > .CE_N" to="net.GND" />
    <trace from=".U5 > .DS" to="net.GND" />
    {["D4", "D5", "D6", "D7"].map((d) => (
      <trace from={`.U5 > .${d}`} to="net.GND" />
    ))}

    {MODULES.map((m, i) => {
      const motor = `J${3 + i}`
      const hall = `J${7 + i}`
      const pullUp = `R${5 + i}`
      const ledR = `R${9 + i}`
      const led = `D${2 + i}`
      const home = `HOME_${m.id}`
      return (
        <>
          <B5B_XH_A_LF__SN_
            name={motor}
            pinLabels={MOTOR_PINS}
            pcbX={m.x}
            pcbY={27}
            schX={-1}
            schY={-1.5 - i * 2.4}
            schPinArrangement={{
              leftSide: {
                pins: ["BLU", "PNK", "YEL", "ORG", "VM"],
                direction: "top-to-bottom",
              },
            }}
            schSectionName="drive"
          />
          {m.drains.map((d, k) => (
            <trace
              from={`.${m.driver} > .DRAIN${d}`}
              to={`.${motor} > .${["BLU", "PNK", "YEL", "ORG"][k]}`}
              thickness={MOTOR}
            />
          ))}
          <trace from={`.${motor} > .VM`} to="net.VMOT" thickness={POWER} />

          <B3B_XH_A_LF__SN_
            name={hall}
            pinLabels={HALL_PINS}
            pcbX={m.x}
            pcbY={-27.5}
            schX={16}
            schY={-1.2 - i * 2.8}
            schPinArrangement={{
              leftSide: {
                pins: ["VCC", "OUT", "GND"],
                direction: "top-to-bottom",
              },
            }}
            schSectionName="sense"
          />
          <resistor
            name={pullUp}
            resistance="10k"
            footprint="0603"
            pcbX={m.x - 3}
            pcbY={-21}
            pcbRotation={90}
            schX={13.6}
            schY={-0.65 - i * 2.8}
            schRotation={90}
            schSectionName="sense"
          />
          <resistor
            name={ledR}
            resistance="1k"
            footprint="0603"
            pcbX={m.x}
            pcbY={-21}
            pcbRotation={90}
            schX={11.8}
            schY={-0.45 - i * 2.8}
            schRotation={90}
            schSectionName="sense"
          />
          <led
            name={led}
            color="green"
            footprint="0603"
            pcbX={m.x + 3}
            pcbY={-21}
            pcbRotation={90}
            schX={11.8}
            schY={-1.75 - i * 2.8}
            schRotation={270}
            schSectionName="sense"
          />
          <trace from={`.${hall} > .VCC`} to="net.V3V3" />
          <trace from={`.${hall} > .GND`} to="net.GND" />
          <trace from={`.${hall} > .OUT`} to={`net.${home}`} />
          <trace from={`.${pullUp} > .pin1`} to="net.V3V3" />
          <trace from={`.${pullUp} > .pin2`} to={`net.${home}`} />
          <trace from={`.${ledR} > .pin1`} to="net.V3V3" />
          <trace from={`.${ledR} > .pin2`} to={`.${led} > .anode`} />
          <trace from={`.${led} > .cathode`} to={`net.${home}`} />
          <trace from={`.U5 > .${m.sense}`} to={`net.${home}`} />
        </>
      )
    })}

    {/* ------------------------------------------------------------ mounting */}
    {HOLES.map((h) => (
      <>
        <hole diameter="3.2mm" pcbX={h.x} pcbY={h.y} />
        <keepout
          shape="circle"
          radius="3.3mm"
          pcbX={h.x}
          pcbY={h.y}
          layers={["top", "bottom"]}
        />
        <silkscreencircle radius="3.3mm" pcbX={h.x} pcbY={h.y} />
      </>
    ))}

    {/* ------------------------------------------------------------ print */}
    {label("SPLIT-FLAP MAIN v1.0", 0, -21.6, 1.5)}
    {label("WALL PLATE CONTROLLER / 2 CUBES / 4 MODULES", 0, -23.5, 0.7)}
    {label("enclose", 0, -30.9, 0.9)}
    {MODULES.map((m) => label(`MOTOR ${m.id}`, m.x, 22.5))}
    {MODULES.map((m) => label(`HALL ${m.id}`, m.x - 6.8, -27.8, 0.8, 90))}
    {label("USB 5V", -41, 20.6, 0.8)}
    {label("12V IN", -42, -15, 0.8)}
    {label("RESET", -4.5, 3.4, 0.7)}
    {label("BOOT", 4.5, 3.4, 0.7)}
    {label("STAT", 14.4, 6, 0.6, 90)}
    {label("PWR", -38.6, -3.3, 0.6)}
    {label("12V", -39.4, -18.5, 0.6)}
    {label("UART", -9.6, -28, 0.8)}
    {label("EXP", 46.5, 10.4, 0.8)}
    <copperpour connectsTo="net.GND" layer="top" clearance="0.3mm" />
  </board>
)
