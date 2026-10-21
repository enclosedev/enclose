import { describe, expect, it } from "vitest"

import type { Question } from "@shared/api"
import { answerOf, NOTHING, pick, write } from "./questions"

const options = ["Can", "Mug", "Tumbler"].map((label) => ({
  label,
  detail: "",
}))
const one: Question = {
  question: "What does it hold?",
  options,
  several: false,
}
const several: Question = { ...one, several: true }

describe("pick", () => {
  it("takes one answer in place of another, where one is all it takes", () => {
    const mug = pick(one, pick(one, NOTHING, "Can"), "Mug")
    expect(mug.picked).toEqual(["Mug"])
    expect(pick(one, mug, "Mug").picked).toEqual(["Mug"])
  })

  it("puts aside what was written, where one answer is all it takes", () => {
    const written = write(one, NOTHING, "82 mm across")
    expect(pick(one, written, "Can")).toEqual({ picked: ["Can"], written: "" })
  })

  it("takes several in the order they were offered, and puts one down again", () => {
    const both = pick(several, pick(several, NOTHING, "Tumbler"), "Can")
    expect(both.picked).toEqual(["Can", "Tumbler"])
    expect(pick(several, both, "Can").picked).toEqual(["Tumbler"])
  })
})

describe("write", () => {
  it("is the answer in place of one picked, where one is all it takes", () => {
    const said = write(one, pick(one, NOTHING, "Can"), "82 mm across")
    expect(answerOf(said)).toBe("82 mm across")
  })

  it("leaves what was picked alone until something is written", () => {
    expect(write(one, pick(one, NOTHING, "Can"), "  ").picked).toEqual(["Can"])
  })

  it("is one more answer, where several can be given", () => {
    const said = write(several, pick(several, NOTHING, "Mug"), " a flask ")
    expect(answerOf(said)).toBe("Mug, a flask")
  })
})

describe("answerOf", () => {
  it("is nothing where nothing was said", () => {
    expect(answerOf(NOTHING)).toBe("")
    expect(answerOf({ picked: [], written: "  " })).toBe("")
  })
})
