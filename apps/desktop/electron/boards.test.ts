import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { boardsIn, findBoards, Following } from "./boards"
import { Projects } from "./projects"

let root: string
const write = (file: string, content: string) => {
  const full = path.join(root, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "enclose-test-"))
  )
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const BOARD = JSON.stringify([
  { type: "pcb_board", center: { x: 0, y: 0 }, width: 40, height: 25 },
])

describe("findBoards", () => {
  it("finds none in a folder that has no pcb/", () => {
    write("model.py", "")
    expect(findBoards(root)).toEqual([])
    expect(boardsIn(root)).toEqual([])
  })

  it("goes by the boards' own files, plainly named", () => {
    write("pcb/main.circuit.tsx", "")
    write("pcb/power-board.circuit.tsx", "")
    write("pcb/Main Board.circuit.tsx", "")
    write("pcb/notes.tsx", "")
    write("pcb/stray.board.json", "{}")
    expect(findBoards(root)).toEqual(["main", "power-board"])
  })
})

describe("boardsIn", () => {
  it("says what each is called, how far along it is, and what is built of it", () => {
    write("pcb/main.circuit.tsx", "")
    write("pcb/main.board.json", '{ "name": "Main board", "finished": false }')
    write("pcb/build/main.circuit.json", BOARD)
    write("pcb/build/main.glb", "")
    const [board] = boardsIn(root)
    expect(board).toMatchObject({
      id: "main",
      name: "Main board",
      finished: false,
      size: [40, 25],
      model: true,
      trouble: null,
    })
    expect(board.built).toBeGreaterThan(0)
  })

  it("has a board that is not built yet, or says nothing of itself, listed all the same", () => {
    write("pcb/power-board.circuit.tsx", "")
    expect(boardsIn(root)).toEqual([
      {
        id: "power-board",
        name: "Power board",
        finished: true,
        built: null,
        size: null,
        layers: 2,
        model: false,
        step: false,
        gerbers: false,
        outdated: false,
        unsourced: [],
        building: null,
        preview: null,
        trouble: null,
      },
    ])
  })

  it("says how far a build has got, while one is under way and saying so", () => {
    write("pcb/main.circuit.tsx", "")
    const now = Date.now()
    write(
      "pcb/build/main.building.json",
      JSON.stringify({ since: now, at: now, stage: "routing", progress: 0.4 })
    )
    expect(boardsIn(root)[0].building).toMatchObject({
      stage: "routing",
      progress: 0.4,
    })
    // one that has said nothing for a long while is over, whatever it left behind
    write(
      "pcb/build/main.building.json",
      JSON.stringify({ since: 0, at: 0, stage: "routing" })
    )
    expect(boardsIn(root)[0].building).toBeNull()
  })

  it("has a quick look at a board as it is written, where that is newer than its build", () => {
    write("pcb/main.circuit.tsx", "")
    write("pcb/build/main.circuit.json", BOARD)
    write("pcb/build/main.preview.json", BOARD)
    const later = new Date(Date.now() + 5000)
    fs.utimesSync(path.join(root, "pcb/build/main.preview.json"), later, later)
    expect(boardsIn(root)[0].preview).toBe(Math.round(later.getTime()))
    // built since, it is the build that is shown
    const latest = new Date(Date.now() + 10_000)
    fs.utimesSync(
      path.join(root, "pcb/build/main.circuit.json"),
      latest,
      latest
    )
    expect(boardsIn(root)[0].preview).toBeNull()
  })

  it("says how many layers of copper it has, as it is drawn: from a newer quick look", () => {
    const layered = (layers: number) =>
      JSON.stringify([
        {
          type: "pcb_board",
          center: { x: 0, y: 0 },
          width: 40,
          height: 25,
          num_layers: layers,
        },
      ])
    write("pcb/main.circuit.tsx", "")
    write("pcb/build/main.circuit.json", layered(4))
    expect(boardsIn(root)[0].layers).toBe(4)
    write("pcb/build/main.preview.json", layered(6))
    const later = new Date(Date.now() + 5000)
    fs.utimesSync(path.join(root, "pcb/build/main.preview.json"), later, later)
    expect(boardsIn(root)[0].layers).toBe(6)
  })

  it("says when the board was changed after it was last built", () => {
    write("pcb/main.circuit.tsx", "")
    write("pcb/build/main.circuit.json", BOARD)
    const earlier = new Date(Date.now() - 10_000)
    fs.utimesSync(path.join(root, "pcb/main.circuit.tsx"), earlier, earlier)
    expect(boardsIn(root)[0].outdated).toBe(false)
    const later = new Date(Date.now() + 5000)
    fs.utimesSync(path.join(root, "pcb/main.circuit.tsx"), later, later)
    expect(boardsIn(root)[0].outdated).toBe(true)
  })

  it("names the parts its BOM has no JLCPCB number for", () => {
    write("pcb/main.circuit.tsx", "")
    write(
      "pcb/build/main.circuit.json",
      JSON.stringify([
        ...JSON.parse(BOARD),
        { type: "source_component", source_component_id: "s1", name: "U1" },
        {
          type: "pcb_component",
          pcb_component_id: "p1",
          source_component_id: "s1",
        },
      ])
    )
    expect(boardsIn(root)[0].unsourced).toEqual(["U1"])
  })

  it("says why what says what a board is did not read", () => {
    write("pcb/main.circuit.tsx", "")
    write("pcb/main.board.json", "{ not json")
    const [board] = boardsIn(root)
    expect(board.name).toBe("Main")
    // in the words of what read it: that it is not JSON
    expect(board.trouble).toMatch(/JSON/)
  })
})

describe("a project's boards", () => {
  it("are known of from the first, and counted again when one is built", () => {
    write("model.py", "")
    const projects = new Projects(path.join(root, "projects.json"), () => {})
    const id = projects.add(root)
    const boards = () => projects.list(() => [])[0].boards
    expect(boards()).toBeNull()
    write("pcb/main.circuit.tsx", "")
    projects.refresh(id)
    const first = boards()
    expect(first).not.toBeNull()
    projects.refresh(id)
    expect(boards()).toBe(first)
    write("pcb/build/main.circuit.json", BOARD)
    projects.refresh(id)
    expect(boards()).toBe(first! + 1)
    projects.close()
  })
})

describe("Following", () => {
  /** the board built as it is at `at` (s), with these on it */
  const build = (at: number, ...types: string[]) => {
    const file = "pcb/build/main.circuit.json"
    write(file, JSON.stringify(types.map((type) => ({ type }))))
    fs.utimesSync(path.join(root, file), at, at)
  }
  const stepsOf = (following: Following) =>
    following.gone.map(({ step, at }) => `${step}@${at}`)

  it("goes a step on as each build gets further, and counts the builds", () => {
    write("pcb/main.circuit.tsx", "")
    const following = new Following(root, "main", 500_000)
    expect(following.rough).toBe(false)
    expect(following.made).toBeNull()
    expect(following.look()).toBe(false)
    expect(following.builds).toBe(0)

    build(1000, "source_component")
    expect(following.look()).toBe(true)
    expect(following.look()).toBe(false)
    build(2000, "source_component", "source_trace")
    expect(following.look()).toBe(true)
    build(3000, "source_component", "source_trace")
    expect(following.look()).toBe(false)
    build(4000, "source_component", "source_trace", "pcb_trace")
    expect(following.look()).toBe(true)
    expect(following.builds).toBe(4)
    expect(stepsOf(following)).toEqual([
      "placing@500000",
      "connecting@1000000",
      "routing@2000000",
      "checking@4000000",
    ])
    expect(following.made).toMatchObject({ step: "routed", parts: 1 })
  })

  it("has a board already built be a rough one, and a build that gets further skip ahead", () => {
    build(1000, "source_component")
    const following = new Following(root, "main", 1_500_000)
    expect(following.rough).toBe(true)
    expect(following.made).toMatchObject({ step: "placed" })
    expect(following.look()).toBe(false)
    build(2000, "source_component", "source_trace", "pcb_trace")
    expect(following.look()).toBe(true)
    expect(stepsOf(following)).toEqual(["placing@1500000", "checking@2000000"])
  })

  it("goes by what the agent says once it says anything, back as well as on", () => {
    write("pcb/main.circuit.tsx", "")
    const following = new Following(root, "main", 0)
    expect(following.say("connecting", 10)).toBe(true)
    expect(following.say("connecting", 20)).toBe(false)
    // its builds no longer move it
    build(1000, "source_component", "source_trace", "pcb_trace")
    expect(following.look()).toBe(false)
    expect(following.builds).toBe(1)
    expect(following.say("checking", 30)).toBe(true)
    expect(following.say("routing", 40)).toBe(true)
    expect(following.step).toBe("routing")
    expect(stepsOf(following)).toEqual([
      "placing@0",
      "connecting@10",
      "checking@30",
      "routing@40",
    ])
  })
})
