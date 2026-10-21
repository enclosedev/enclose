import { describe, expect, it } from "vitest"

import {
  cornerOf,
  fileNameOf,
  leftOut,
  mixed,
  partsIn,
  readGuide,
  scenesOf,
  troubleWith,
  writtenAs,
} from "./assembly-format"

const lamp = {
  title: "  Desk lamp ",
  summary: "A lamp with a weighted base.",
  needs: [
    "2.5 mm hex key",
    "",
    3,
    { name: " Wood glue ", icon: "glue" },
    { name: "A second person", icon: "nobody" },
    { icon: "clamp" },
  ],
  steps: [
    { title: "Start with the base", text: "Lay it down.", parts: ["base"] },
    {
      title: "Fix the cover",
      text: "Set it over the weight.",
      parts: ["cover", "screws", "cover"],
      from: [0, 0, 70],
      view: [1, -1, 0.8],
      tip: "Not too tight.",
    },
  ],
}

// A carrier; a ring laid down apart, and a dot put into it; and the ring put on.
const made = (title: string, parts: string[], more = {}) => ({
  title,
  text: "So.",
  parts,
  ...more,
})
const clock = {
  title: "Clock",
  steps: [
    made("Start with the carrier", ["carrier"]),
    made("Lay the ring face down", ["ring"], { sub: "Outer ring" }),
    made("Twist in the dot", ["dot"], { sub: " outer-ring " }),
    made("Press the ring on", [], { fits: ["OUTER RING", "outer ring"] }),
  ],
}

describe("readGuide", () => {
  it("reads a guide as it is given, tidied", () => {
    expect(readGuide(lamp)).toEqual({
      title: "Desk lamp",
      version: 1,
      made: null,
      summary: "A lamp with a weighted base.",
      // each by its name, with the picture it was given where the page has that one
      needs: [
        { name: "2.5 mm hex key", icon: null },
        { name: "Wood glue", icon: "glue" },
        { name: "A second person", icon: null },
      ],
      already: [],
      cover: { view: null, parts: [] },
      steps: [
        {
          title: "Start with the base",
          text: "Lay it down.",
          parts: ["base"],
          sub: null,
          fits: [],
          from: null,
          view: null,
          tip: null,
        },
        {
          title: "Fix the cover",
          text: "Set it over the weight.",
          // (a part named twice in a step is in it once)
          parts: ["cover", "screws"],
          sub: null,
          fits: [],
          from: [0, 0, 70],
          view: [1, -1, 0.8],
          tip: "Not too tight.",
        },
      ],
    })
  })

  it("reads what is made up apart as one thing, however it is written", () => {
    const { steps } = readGuide(clock)
    expect(steps.map((step) => step.sub)).toEqual([
      null,
      "Outer ring",
      "Outer ring",
      null,
    ])
    expect(steps.map((step) => step.fits)).toEqual([[], [], [], ["Outer ring"]])
    const written = JSON.parse(writtenAs(readGuide(clock)))
    expect(written.steps[1]).toMatchObject({ sub: "Outer ring" })
    expect(written.steps[3]).toMatchObject({ fits: ["Outer ring"] })
    expect(written.steps[0]).not.toHaveProperty("sub")
    expect(written.steps[0]).not.toHaveProperty("fits")
    expect(readGuide(written)).toEqual(readGuide(clock))
  })

  it("reads back what it wrote, with which writing it is and when", () => {
    const guide = {
      ...readGuide({
        ...lamp,
        already: ["post"],
        cover: { view: [-1, -1, 1], parts: ["cover", "cover", "base"] },
      }),
      version: 3,
      made: Date.UTC(2026, 9, 12, 15, 30),
    }
    expect(readGuide(JSON.parse(writtenAs(guide)))).toEqual(guide)
    expect(writtenAs(guide)).toContain('"made": "2026-10-12T15:30:00.000Z"')
    // a thing with no picture is written as its name, as a guide always wrote one
    expect(JSON.parse(writtenAs(guide)).needs).toEqual([
      "2.5 mm hex key",
      { name: "Wood glue", icon: "glue" },
      "A second person",
    ])
  })

  it("says what is wrong with what is no guide", () => {
    expect(() => readGuide(null)).toThrow("A guide is an object.")
    expect(() => readGuide({ steps: [] })).toThrow('needs a "title"')
    expect(() => readGuide({ title: "Lamp", steps: [] })).toThrow(
      "at least one"
    )
    expect(() =>
      readGuide({ title: "Lamp", steps: [{ title: "Fit it" }] })
    ).toThrow('Step 1 needs a "title" and a "text".')
    const step = { title: "Fit it", text: "Push it on.", parts: ["a"] }
    expect(() =>
      readGuide({ title: "Lamp", steps: [step, { ...step, from: [0, 60] }] })
    ).toThrow('Step 2: "from" is three numbers')
    expect(() =>
      readGuide({ title: "Lamp", steps: [{ ...step, view: [0, 0, 0] }] })
    ).toThrow('"view" has to point somewhere')
    expect(() =>
      readGuide({ title: "Lamp", cover: { view: "front" }, steps: [step] })
    ).toThrow('The cover\'s "view" is three numbers')
  })
})

describe("troubleWith", () => {
  const model = ["base", "weight", "cover", "screws"]
  const guide = (steps: string[][], already: string[] = []) =>
    readGuide({
      title: "Lamp",
      already,
      steps: steps.map((parts) => ({ title: "Do", text: "It.", parts })),
    })

  it("finds nothing wrong with a guide to parts the model has, each put on once", () => {
    expect(
      troubleWith(guide([["base"], [], ["cover", "screws"]]), model)
    ).toEqual([])
  })

  it("names the parts the model has not, and says which it has", () => {
    const [trouble] = troubleWith(guide([["base", "lid"]]), model)
    expect(trouble).toContain("no part with the id lid")
    expect(trouble).toContain("base, weight, cover, screws")
  })

  it("has a part go on once, and not be there already as well", () => {
    expect(troubleWith(guide([["base"], ["base"]]), model)).toEqual([
      "base goes on in step 1 and again in step 2: a part goes on once.",
    ])
    expect(troubleWith(guide([["base"]], ["base"]), model)[0]).toContain(
      "it is one or the other"
    )
  })

  it("has a cover filled with parts the guide shows, and no others", () => {
    const covered = (parts: string[]) =>
      readGuide({
        title: "Lamp",
        already: ["base"],
        cover: { parts },
        steps: [{ title: "Do", text: "It.", parts: ["cover"] }],
      })
    expect(troubleWith(covered(["base", "cover"]), model)).toEqual([])
    expect(troubleWith(covered(["weight"]), model)[0]).toContain(
      "filled with weight, which the guide does not show"
    )
    // (a part the model has not is said of once, with the rest of what it has not)
    expect(troubleWith(covered(["shade"]), model)).toEqual([])
  })

  it("wants some step to put a part on", () => {
    expect(troubleWith(guide([[]], ["base"]), model)).toEqual([
      "No step puts a part on: each names the parts it adds.",
    ])
  })

  describe("of what is made up apart", () => {
    const parts = ["carrier", "ring", "dot", "gear"]
    const trouble = (steps: unknown[]) =>
      troubleWith(readGuide({ title: "Clock", steps }), parts)

    it("finds nothing wrong where it is made up and then fitted", () => {
      expect(trouble(clock.steps)).toEqual([])
    })

    it("has it go on", () => {
      expect(trouble(clock.steps.slice(0, 3))).toEqual([
        '"Outer ring" is made up in steps 2 and 3 and never goes on: a later step fits it, by naming it in "fits".',
      ])
    })

    it("has it go on once, and not on to itself", () => {
      expect(
        trouble([...clock.steps, made("Again", [], { fits: ["Outer ring"] })])
      ).toEqual([
        '"Outer ring" is fitted in step 4 and again in step 5: it goes on once.',
      ])
      const [itself] = trouble([
        ...clock.steps.slice(0, 2),
        made("Twist in the dot", ["dot"], {
          sub: "Outer ring",
          fits: ["Outer ring"],
        }),
      ])
      expect(itself).toContain(
        'Step 3 is done to "Outer ring" and fits it as well'
      )
    })

    it("has every one of its steps come before the one that fits it", () => {
      const [late] = trouble([
        ...clock.steps,
        made("Add a gear", ["gear"], { sub: "Outer ring" }),
      ])
      expect(late).toContain(
        '"Outer ring" goes on in step 4, and step 5 is still done to it'
      )
    })

    it("has a step fit only what was made up, and says what was", () => {
      const [unknown] = trouble([
        ...clock.steps,
        made("Fit the gears", [], { fits: ["Gear train"] }),
      ])
      expect(unknown).toContain('Step 5 fits "Gear train", which no step makes')
      expect(unknown).toContain('("Outer ring")')
    })
  })
})

describe("scenesOf", () => {
  it("has a step done to the thing itself seen with what is on it so far", () => {
    const scenes = scenesOf(
      readGuide({
        title: "Lamp",
        already: ["post"],
        steps: [made("One", ["base"]), made("Two", ["cover", "screws"])],
      })
    )
    expect(scenes).toEqual([
      { there: ["post"], coming: ["base"] },
      { there: ["post", "base"], coming: ["cover", "screws"] },
    ])
  })

  it("has what is made up apart seen alone, and then come on whole", () => {
    expect(scenesOf({ ...readGuide(clock), already: ["wall"] })).toEqual([
      { there: ["wall"], coming: ["carrier"] },
      { there: [], coming: ["ring"] },
      { there: ["ring"], coming: ["dot"] },
      { there: ["wall", "carrier"], coming: ["ring", "dot"] },
    ])
  })

  it("has one such thing go into another, and both go on together", () => {
    const scenes = scenesOf(
      readGuide({
        title: "Clock",
        steps: [
          made("Lay the shaft down", ["shaft"], { sub: "Planet" }),
          made("Press on the gear", ["gear"], { sub: "Planet" }),
          made("Lay the carrier down", ["carrier"], { sub: "Carrier" }),
          made("Push the planet in", ["clip"], {
            sub: "Carrier",
            fits: ["Planet"],
          }),
          made("Start with the base", ["base"]),
          made("Press the carrier on", [], { fits: ["Carrier"] }),
        ],
      })
    )
    expect(scenes[3]).toEqual({
      there: ["carrier"],
      coming: ["shaft", "gear", "clip"],
    })
    expect(scenes[5]).toEqual({
      there: ["base"],
      coming: ["carrier", "shaft", "gear", "clip"],
    })
  })

  it("is not caught out by things that are fitted to each other", () => {
    const scenes = scenesOf(
      readGuide({
        title: "Knot",
        steps: [
          made("One", ["a"], { sub: "A", fits: ["B"] }),
          made("Other", ["b"], { sub: "B", fits: ["A"] }),
        ],
      })
    )
    expect(scenes.flatMap((scene) => scene.coming).sort()).toEqual([
      "a",
      "a",
      "b",
      "b",
    ])
  })
})

describe("mixed", () => {
  const called = new Map([
    ["leg-fl", "Leg, front left"],
    ["leg-fr", "Leg, front right"],
    ["plate-fl", "Leg plate, front left"],
    ["shaft-1", "Planet shaft 1"],
    ["shaft-2", "Planet shaft 2"],
  ])
  const steps = (...parts: string[][]) =>
    readGuide({ title: "Stool", steps: parts.map((ids) => made("Do", ids)) })

  it("finds the steps that put on parts of more than one kind", () => {
    expect(
      mixed(
        steps(["leg-fl", "leg-fr"], ["leg-fl", "plate-fl"], [], ["shaft-1"]),
        called
      )
    ).toEqual([
      { step: 1, parts: ["Leg, front left", "Leg plate, front left"] },
    ])
  })

  it("takes parts that differ in which they are, and where, to be alike", () => {
    expect(mixed(steps(["shaft-1", "shaft-2"]), called)).toEqual([])
    // going by their ids, where it is not told what they are called
    expect(mixed(steps(["bolt_front_left", "bolt_back_right"]))).toEqual([])
    expect(mixed(steps(["outer_ring", "minute_dot"]))).toHaveLength(1)
  })
})

describe("the parts of a guide", () => {
  const guide = readGuide({
    title: "Cover",
    already: ["base"],
    steps: [{ title: "Fix it", text: "With the screws.", parts: ["cover"] }],
  })

  it("are those there to begin with, and then those its steps put on", () => {
    expect(partsIn(guide)).toEqual(["base", "cover"])
  })

  it("leave out the rest of the model", () => {
    expect(leftOut(guide, ["base", "weight", "cover"])).toEqual(["weight"])
  })
})

describe("cornerOf", () => {
  it("is the corner of the model a way of looking at it is nearest", () => {
    expect(cornerOf([1, -1, 0.8])).toEqual([1, -1, 1])
    expect(cornerOf([-0.2, 3, -0.7])).toEqual([-1, 1, -1])
  })

  it("is from the right, the front and above, where the way leans to neither side", () => {
    expect(cornerOf([0, 0, 1])).toEqual([1, -1, 1])
    expect(cornerOf([0, 0, -1])).toEqual([1, -1, -1])
  })
})

describe("fileNameOf", () => {
  it("makes a name a file can have of whatever a guide is to", () => {
    expect(fileNameOf("Counter stool")).toBe("counter-stool")
    expect(fileNameOf("  Café table, 2nd ")).toBe("cafe-table-2nd")
    expect(fileNameOf("***")).toBe("guide")
    expect(fileNameOf("a".repeat(90))).toHaveLength(60)
  })
})
