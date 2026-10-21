import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"

import { PCB_SLOTS, type PcbColours } from "@shared/theme-format"
import { inBoardColours } from "./pictures"

// What draws the pictures, which needs a window: inBoardColours needs none of it.
vi.mock("@/components/viewport/thumbnails", () => ({
  frame: () => {},
  stage: () => ({}),
}))
vi.mock("@/lib/css-color", () => ({ useThemeColors: () => ({}) }))
vi.mock("./boards", () => ({ boardUrl: () => "" }))

/** A theme with a colour of its own for each of a board's, and shades of grey said. */
const THEME = {
  ...(Object.fromEntries(
    PCB_SLOTS.map(({ id }) => [id, "#203040"])
  ) as PcbColours),
  "board-traces": "#445566",
  "components-light": "#e7e7e7",
  "components-mid": "#606060",
  "components-dark": "#202020",
}

const hex = (colour: THREE.Color) => `#${colour.getHexString()}`

/** A board as tscircuit builds it: its top, a picture, and its edge, of one colour. */
function board() {
  const top = new THREE.MeshStandardMaterial({
    name: "TopMaterial",
    map: new THREE.Texture(),
  })
  const edge = new THREE.MeshStandardMaterial({
    name: "GreenSideMaterial",
    color: "#0f4f30",
  })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), top))
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), edge))
  return { group, top, edge }
}

describe("inBoardColours", () => {
  it("gives the board's edge the theme's colour for its traces", () => {
    const { group, edge } = board()
    inBoardColours(group, THEME)
    expect(hex(edge.color)).toBe("#445566")
  })

  it("does a material that parts share the once", () => {
    const { group, top } = board()
    const chip = new THREE.MeshStandardMaterial({ color: "#9c9c9c" })
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), chip))
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), chip))
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), top))
    inBoardColours(group, THEME)
    // shaded twice, the grey would be taken for a darker one, and shaded again
    expect(hex(chip.color)).toBe("#606060")
    expect(
      top.customProgramCacheKey().split("board in our colours")
    ).toHaveLength(2)
  })

  it("draws what is on the board in the theme's greys, and leaves what is no grey as it was", () => {
    const { group } = board()
    const pins = new THREE.MeshStandardMaterial({ color: "#fcfdfe" })
    const led = new THREE.MeshStandardMaterial({ color: "#00bc00" })
    const plain = new THREE.MeshBasicMaterial({ color: "#9c9c9c" })
    const resistor = new THREE.MeshStandardMaterial({ color: "#737373" })
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), [led, resistor]))
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), pins))
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), plain))
    inBoardColours(group, THEME)
    expect(hex(led.color)).toBe("#00bc00")
    expect(hex(resistor.color)).toBe("#202020")
    // the lightest grey is its shade's own, so stays as it was
    expect(hex(pins.color)).toBe("#fcfdfe")
    // (what is not drawn as the board is drawn is left alone)
    expect(hex(plain.color)).toBe("#9c9c9c")
  })
})
