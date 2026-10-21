import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  arrange,
  bringIn,
  cadFilesIn,
  modelScript,
  runBuild,
  sortOpened,
} from "./imports"

let root: string
const write = (file: string, content: unknown = "") => {
  const full = path.join(root, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(
    full,
    typeof content === "string" ? content : JSON.stringify(content)
  )
  return full
}
const MANIFEST = { parts: [{ id: "a", file: "a.glb" }] }

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "enclose-test-"))
  )
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe("cadFilesIn", () => {
  it("finds the CAD files however deep, in the order a person would list them", () => {
    write("tray/Leg 10.step")
    write("tray/Leg 2.STEP")
    write("tray/sub/Top.stp")
    write("tray/notes.txt")
    expect(cadFilesIn(path.join(root, "tray"))).toEqual([
      "Leg 2.STEP",
      "Leg 10.step",
      path.join("sub", "Top.stp"),
    ])
  })

  it("does not look in what is hidden, installed or built", () => {
    write("p/.git/a.step")
    write("p/node_modules/b.step")
    write("p/c.step")
    expect(cadFilesIn(path.join(root, "p"))).toEqual(["c.step"])
  })
})

describe("sortOpened", () => {
  it("brings in a folder's CAD files as one project named for the folder", () => {
    write("Tray/Leg L.step")
    write("Tray/Top.step")
    const dir = path.join(root, "Tray")
    expect(sortOpened([dir])).toEqual({
      folders: [],
      bundles: [
        {
          name: "Tray",
          files: [
            { from: path.join(dir, "Leg L.step"), as: "Leg L.step" },
            { from: path.join(dir, "Top.step"), as: "Top.step" },
          ],
        },
      ],
      refused: [],
    })
  })

  it("opens a folder where it is when it is a project already", () => {
    write("built/build/enclose.model.json", MANIFEST)
    write("built/build/step/a.step")
    write("set-up/enclose.json", { build: "python3 model.py" })
    write("set-up/source/a.step")
    write("known/a.step")
    const [built, setUp, known] = ["built", "set-up", "known"].map((name) =>
      path.join(root, name)
    )
    expect(sortOpened([built, setUp, known], (dir) => dir === known)).toEqual({
      folders: [built, setUp, known],
      bundles: [],
      refused: [],
    })
  })

  it("opens a folder with no CAD file in it where it is: somewhere to start", () => {
    write("empty/README.md")
    const dir = path.join(root, "empty")
    expect(sortOpened([dir]).folders).toEqual([dir])
  })

  it("names a project of one file for the file", () => {
    const file = write("exports/Mechanism.step")
    expect(sortOpened([file]).bundles).toEqual([
      { name: "Mechanism", files: [{ from: file, as: "Mechanism.step" }] },
    ])
  })

  it("brings files given together in as one project, named for their folder", () => {
    const a = write("exports/b.step")
    const b = write("exports/a.stp")
    const c = write("elsewhere/a.stp")
    expect(sortOpened([a, b, c]).bundles).toEqual([
      {
        name: "exports",
        files: [
          { from: b, as: "a.stp" },
          { from: c, as: "a-2.stp" },
          { from: a, as: "b.step" },
        ],
      },
    ])
  })

  it("brings meshes in as CAD files", () => {
    const stl = write("prints/Bracket.STL")
    const obj = write("prints/knob.obj")
    expect(sortOpened([stl, obj]).bundles).toEqual([
      {
        name: "prints",
        files: [
          { from: stl, as: "Bracket.STL" },
          { from: obj, as: "knob.obj" },
        ],
      },
    ])
    expect(cadFilesIn(path.join(root, "prints"))).toEqual([
      "Bracket.STL",
      "knob.obj",
    ])
  })

  it("refuses what is neither a folder nor a CAD file", () => {
    const dwg = write("thing.dwg")
    const gone = path.join(root, "gone.step")
    expect(sortOpened([dwg, gone])).toEqual({
      folders: [],
      bundles: [],
      refused: [dwg, gone],
    })
  })
})

describe("bringIn", () => {
  const kit = () => write("kit/enclose.py", "# the exporter")

  it("makes a project laid out as the app's own are, of copies", () => {
    const from = write("theirs/deep/Top.step", "STEP")
    const { dir, written } = bringIn(
      { name: "Tray Metalic", files: [{ from, as: "deep/Top.step" }] },
      path.join(root, "Projects"),
      kit(),
      new Date(2026, 9, 7, 0, 30)
    )
    expect(dir).toBe(path.join(root, "Projects/2026-10-07-0030-tray-metalic"))
    expect(
      fs.readFileSync(path.join(dir, "source/deep/Top.step"), "utf8")
    ).toBe("STEP")
    expect(fs.existsSync(from)).toBe(true)
    expect(fs.readFileSync(path.join(dir, "enclose.py"), "utf8")).toBe(
      "# the exporter"
    )
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, "enclose.json"), "utf8"))
    ).toEqual({ model: "build/enclose.model.json", build: "python3 model.py" })
    const script = fs.readFileSync(path.join(dir, "model.py"), "utf8")
    expect(script).toContain('model = Model("Tray Metalic")')
    expect(script).toContain('    "source/deep/Top.step",')
    expect(written).toEqual({
      title: "Tray Metalic",
      files: ["source/deep/Top.step"],
    })
    expect(modelScript(written.title, written.files)).toBe(script)
  })

  it("numbers the folder when the name is taken", () => {
    const from = write("a.step")
    const bundle = { name: "a", files: [{ from, as: "a.step" }] }
    const when = new Date(2026, 9, 7, 0, 30)
    const first = bringIn(bundle, root, kit(), when).dir
    expect(bringIn(bundle, root, kit(), when).dir).toBe(`${first}-2`)
  })

  it("leaves no half-made project behind when a file cannot be copied", () => {
    const bundle = {
      name: "a",
      files: [{ from: path.join(root, "gone.step"), as: "gone.step" }],
    }
    const into = path.join(root, "Projects")
    expect(() => bringIn(bundle, into, kit())).toThrow()
    expect(fs.readdirSync(into)).toEqual([])
  })
})

describe("modelScript", () => {
  it("reads STEP files alone as it always has", () => {
    const script = modelScript("Clock", ["source/clock.step"])
    expect(script).toContain("from enclose import Model, read_step\n")
    expect(script).toContain("for found in read_step(\n")
    expect(script).not.toContain("mesh=")
  })

  it("reads meshes, with STEP files or without, and says which parts are made of one", () => {
    for (const files of [
      ["source/bracket.stl"],
      ["source/clock.step", "source/knob.OBJ"],
    ]) {
      const script = modelScript("Clock", files)
      expect(script).toContain("from enclose import Model, read_files\n")
      expect(script).toContain("for found in read_files(\n")
      expect(script).toContain("        mesh=found.mesh,\n")
    }
    const arranged = modelScript("Bracket", ["source/bracket.stl"], {
      what: "a shelf bracket",
      name: null,
      reference: null,
      groups: [{ label: "Bracket", shell: false }],
      parts: [
        { from: "bracket", id: "bracket", label: "Bracket", group: "Bracket" },
      ],
    })
    expect(arranged).toContain("for found in read_files(\n")
    expect(arranged).toContain("        mesh=found.mesh,\n")
  })

  it("writes names that Python reads as they are", () => {
    const script = modelScript('6" rack "A"\\b', ["source/it's.step"])
    expect(script).toContain('model = Model("6\\" rack \\"A\\"\\\\b")')
    expect(script).toContain('    "source/it\'s.step",')
  })

  it("writes the names and groups the agent gave, each body by the id it is read under", () => {
    const script = modelScript("Clock", ["source/clock.step"], {
      what: 'a "wall" clock\\',
      name: null,
      reference: null,
      groups: [
        { label: "Case", shell: true },
        { label: "Gear train", shell: false },
      ],
      parts: [
        { from: "solid_1", id: "body", label: "Body", group: "Case" },
        {
          from: "gear",
          id: "sun_gear",
          label: 'Sun "gear"',
          group: "Gear train",
        },
      ],
    })
    expect(script).toContain('    "Case": model.group("Case", shell=True),')
    expect(script).toContain('    "Gear train": model.group("Gear train"),')
    expect(script).toContain('    "solid_1": ("body", "Body", "Case"),')
    expect(script).toContain(
      '    "gear": ("sun_gear", "Sun \\"gear\\"", "Gear train"),'
    )
    // what it was taken to be is said where nothing in it can end the saying
    expect(script).toContain("It took the thing to be: a 'wall' clock'")
    expect(script.split('"""')).toHaveLength(3)
    expect(script).toContain('model = Model("Clock")\n')
  })

  it("has the model name the reference scene the agent said suits it", () => {
    const script = modelScript("Stool", ["source/stool.step"], {
      what: "a stool",
      name: null,
      reference: "room",
      groups: [{ label: "Stool", shell: false }],
      parts: [{ from: "solid_1", id: "seat", label: "Seat", group: "Stool" }],
    })
    expect(script).toContain('model = Model("Stool", reference="room")\n')
  })
})

describe("arrange", () => {
  const read = [
    { id: "solid_1", label: "Solid 1", group: "Parts" },
    { id: "solid_2", label: "Solid 2", group: "Parts" },
    { id: "back_cover", label: "back cover", group: "Parts" },
  ]

  it("keeps the reference scene named, where it is one the app has", () => {
    const given = {
      what: "a stool",
      groups: [{ name: "Stool" }],
      parts: [{ id: "solid_1", name: "Seat", group: "Stool" }],
    }
    const scenes = ["table", "room"]
    expect(
      arrange(read, { ...given, reference: "room" }, scenes).reference
    ).toBe("room")
    expect(
      arrange(read, { ...given, reference: "garage" }, scenes).reference
    ).toBeNull()
    expect(arrange(read, given, scenes).reference).toBeNull()
  })

  it("keeps what the project is to be called, on one line, where it was said", () => {
    const given = {
      what: "a clock",
      groups: [{ name: "Clock" }],
      parts: [{ id: "solid_1", name: "Dial", group: "Clock" }],
    }
    expect(arrange(read, { ...given, name: "  Cloque\n " }).name).toBe("Cloque")
    expect(arrange(read, { ...given, name: "   " }).name).toBeNull()
    expect(arrange(read, given).name).toBeNull()
  })

  it("names and groups the parts as given, in the order the files have them", () => {
    expect(
      arrange(read, {
        what: "  a pill\n box ",
        groups: [{ name: "Case", outside: true }, { name: "Fixings" }],
        parts: [
          { id: "back_cover", name: "Back cover", group: "Case" },
          { id: "solid_1", name: "Body", group: "Case" },
          { id: "solid_2", name: "M3 screw", group: "Fixings" },
        ],
      })
    ).toEqual({
      what: "a pill box",
      name: null,
      reference: null,
      groups: [
        { label: "Case", shell: true },
        { label: "Fixings", shell: false },
      ],
      parts: [
        { from: "solid_1", id: "body", label: "Body", group: "Case" },
        {
          from: "solid_2",
          id: "m3_screw",
          label: "M3 screw",
          group: "Fixings",
        },
        {
          from: "back_cover",
          id: "back_cover",
          label: "Back cover",
          group: "Case",
        },
      ],
    })
  })

  it("leaves a part that was not named as the files had it", () => {
    const { groups, parts } = arrange(read, {
      what: "",
      groups: [{ name: "Case" }],
      parts: [{ id: "solid_1", name: "Body", group: "Case" }],
    })
    expect(parts[1]).toEqual({
      from: "solid_2",
      id: "solid_2",
      label: "Solid 2",
      group: "Parts",
    })
    expect(groups.map((group) => group.label)).toEqual(["Case", "Parts"])
  })

  it("numbers the later of two parts given one name", () => {
    const { parts } = arrange(read, {
      what: "",
      groups: [],
      parts: [
        { id: "solid_1", name: "Screw", group: "Fixings" },
        { id: "solid_2", name: "screw", group: "Fixings" },
        { id: "back_cover", name: "Screw 2", group: "Fixings" },
      ],
    })
    expect(parts.map((part) => part.label)).toEqual([
      "Screw",
      "screw 2",
      "Screw 2 2",
    ])
    expect(new Set(parts.map((part) => part.id)).size).toBe(3)
  })

  it("takes two spellings of a group for one, and lists none that is empty", () => {
    const { groups, parts } = arrange(read, {
      what: "",
      groups: [{ name: "Gear train" }, { name: "Spare" }],
      parts: [
        { id: "solid_1", name: "Sun", group: "Gear train" },
        { id: "solid_2", name: "Planet", group: "gear-train" },
        { id: "back_cover", name: "Cover", group: "Gear  train" },
      ],
    })
    expect(groups).toEqual([{ label: "Gear train", shell: false }])
    expect(parts.every((part) => part.group === "Gear train")).toBe(true)
  })

  it("says what is wrong with what it was given, for it to be mended by", () => {
    const one = (part: { id: string; name: string; group: string }) => () =>
      arrange(read, { what: "", groups: [], parts: [part] })
    expect(one({ id: "lid", name: "Lid", group: "Case" })).toThrow(
      'No part has the id "lid". The parts are: solid_1, solid_2, back_cover.'
    )
    expect(one({ id: "solid_1", name: " ", group: "Case" })).toThrow(
      'The part "solid_1" was given no name.'
    )
    expect(one({ id: "solid_1", name: "Lid", group: "" })).toThrow(
      'The part "solid_1" was given no group.'
    )
    expect(() => arrange(read, { what: "", groups: [], parts: [] })).toThrow(
      "No parts were listed."
    )
    expect(() =>
      arrange(read, {
        what: "",
        groups: [],
        parts: [
          { id: "solid_1", name: "A", group: "G" },
          { id: "solid_1", name: "B", group: "G" },
        ],
      })
    ).toThrow('The part "solid_1" is listed twice.')
  })
})

describe("runBuild", () => {
  const progress = () => {
    const seen: [number, number | null][] = []
    return {
      seen,
      note: (done: number, total: number | null) =>
        void seen.push([done, total]),
    }
  }

  it("resolves to nothing once the build gets through", async () => {
    const { seen, note } = progress()
    const lines = ["2 parts", "  Lid: 0.1s", "  Base: 0.2s", "wrote 2 parts"]
    const build = runBuild(
      root,
      `printf '%s\\n' ${lines.map((line) => `'${line}'`).join(" ")}`,
      process.env,
      note
    )
    expect(await build.finished).toBeNull()
    expect(seen[0]).toEqual([0, 2])
  })

  it("says so when there is no Python to build with", async () => {
    const build = runBuild(
      root,
      "no-such-python-here model.py",
      process.env,
      () => {}
    )
    expect(await build.finished).toMatchObject({
      state: "failed",
      why: "python",
    })
  })

  it("says so when Python has no build123d", async () => {
    const build = runBuild(
      root,
      `echo "ModuleNotFoundError: No module named 'build123d'" >&2; exit 1`,
      process.env,
      () => {}
    )
    expect(await build.finished).toEqual({
      state: "failed",
      why: "python",
      detail: "ModuleNotFoundError: No module named 'build123d'",
    })
  })

  it("stops all of a build, and not just the shell it runs in", async () => {
    // No shell hands itself over to a list of two commands, so it stays between the app
    // and what it started, as dash (Debian's and Ubuntu's /bin/sh) does even with one.
    let started: () => void = () => {}
    const running = new Promise<void>((resolve) => (started = resolve))
    const build = runBuild(
      root,
      "echo '1 part'; sleep 20; echo done",
      process.env,
      () => started()
    )
    await running
    // (the shell goes on to start sleep the moment it has printed)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const asked = Date.now()
    build.stop()
    // A build is over once nothing holds what it prints to: sleep included.
    expect(await build.finished).toMatchObject({
      state: "failed",
      why: "build",
    })
    expect(Date.now() - asked).toBeLessThan(2000)
  })

  it("sends nothing once a build is over", async () => {
    // its group's number may be another's by then
    const build = runBuild(root, "true", process.env, () => {})
    expect(await build.finished).toBeNull()
    const kill = vi.spyOn(process, "kill")
    build.stop()
    expect(kill).not.toHaveBeenCalled()
    kill.mockRestore()
  })

  it("gives the last thing a failed build said", async () => {
    const build = runBuild(
      root,
      `echo "Traceback" >&2; echo "ValueError: a.step has nothing in it." >&2; exit 1`,
      process.env,
      () => {}
    )
    expect(await build.finished).toEqual({
      state: "failed",
      why: "build",
      detail: "a.step has nothing in it.",
    })
  })
})
