import { describe, expect, it } from "vitest"

import { Glide } from "./glide"

const DT = 1 / 60

/** Where it is at each frame of so many seconds, told to be at `to` all the while. */
function run(glide: Glide, to: number, seconds: number, how = 1) {
  const at: number[] = []
  for (let frame = 0; frame < Math.round(seconds / DT); frame++)
    at.push(glide.next(to, DT, how))
  return at
}

describe("a number on its way", () => {
  it("starts at rest where it is first told to be", () => {
    const glide = new Glide(30, 1)
    expect(glide.now()).toBe(30)
    expect(run(glide, 30, 0.5).every((at) => at === 30)).toBe(true)
  })

  it("takes the time it is given to get there, and is there to the last figure", () => {
    const glide = new Glide(0, 1)
    const at = run(glide, 110, 1.5)
    const frames = Math.round(1 / DT)
    expect(at[frames - 3]).toBeLessThan(110)
    expect(at[frames - 3]).toBeGreaterThan(109.9)
    expect(at[frames + 2]).toBe(110)
    expect(at.at(-1)).toBe(110)
  })

  it("sets off gently, goes fastest half way, and comes to rest gently", () => {
    const glide = new Glide(0, 1)
    const at = [0, ...run(glide, 100, 1.1)]
    const pace = at.slice(1).map((value, frame) => value - at[frame])
    const fastest = Math.max(...pace)
    // (at one pace it would go 100 / 60 a frame, the whole way)
    expect(fastest).toBeGreaterThan(1.5 * (100 / 60))
    expect(pace[0]).toBeLessThan(fastest / 100)
    expect(pace[58]).toBeLessThan(fastest / 100)
    expect(Math.abs(pace.indexOf(fastest) - 30)).toBeLessThanOrEqual(2)
    // half way in half the time: it is the same going as coming
    expect(at[30]).toBeLessThan(50)
    expect(at[31]).toBeGreaterThan(50)
    for (let frame = 1; frame < pace.length; frame++)
      expect(Math.abs(pace[frame] - pace[frame - 1])).toBeLessThan(fastest / 8)
  })

  it("never goes past where it is told to be, or back, on the way there", () => {
    const glide = new Glide(0, 0.8)
    const at = run(glide, 90, 1)
    for (let frame = 1; frame < at.length; frame++) {
      expect(at[frame]).toBeGreaterThanOrEqual(at[frame - 1])
      expect(at[frame]).toBeLessThanOrEqual(90)
    }
  })

  it("turns round smoothly when it is told to be somewhere else half way", () => {
    const glide = new Glide(0, 1)
    const out = run(glide, 100, 0.5)
    const back = run(glide, 0, 1.5)
    const at = [...out, ...back]
    const pace = at.slice(1).map((value, frame) => value - at[frame])
    const fastest = Math.max(...pace.map(Math.abs))
    for (let frame = 1; frame < pace.length; frame++)
      expect(Math.abs(pace[frame] - pace[frame - 1])).toBeLessThan(fastest / 6)
    expect(Math.max(...at)).toBeGreaterThan(out.at(-1)!)
    expect(Math.max(...at)).toBeLessThan(100)
    expect(at.at(-1)).toBe(0)
  })

  it("follows something that wanders half its time behind", () => {
    const glide = new Glide(0, 0.4)
    let at = 0
    // a slider drawn along at 50 a second, for two seconds
    for (let frame = 1; frame <= 120; frame++)
      at = glide.next(frame * DT * 50, DT, 0.4)
    expect(at).toBeCloseTo((2 - 0.2) * 50, 0)
  })

  it("gets several there together that are sent at once, however far each has to go", () => {
    const near = new Glide(0, 1)
    const far = new Glide(0, 1)
    for (let frame = 0; frame < 45; frame++) {
      const a = near.next(10, DT, 1)
      const b = far.next(150, DT, 1)
      expect(a / 10).toBeCloseTo(b / 150, 6)
    }
  })

  it("is the same whatever the frames it is drawn in", () => {
    const swung = (seconds: number) => 100 * Math.sin(seconds * 2)
    const followed = (rate: number) => {
      const glide = new Glide(0, 0.6)
      let at = 0
      for (let frame = 1; frame <= 1.5 * rate; frame++)
        at = glide.next(swung(frame / rate), 1 / rate, 0.6)
      return at
    }
    expect(followed(120)).toBeCloseTo(followed(30), 0)
    expect(followed(60)).toBeCloseTo(followed(24), 0)
  })

  it("comes round to another time for the move without a jump", () => {
    const glide = new Glide(0, 1.2)
    const slow = run(glide, 100, 0.4, 1.2)
    const quick = run(glide, 100, 1, 0.2)
    const at = [...slow, ...quick]
    const steps = at.slice(1).map((value, frame) => value - at[frame])
    expect(Math.max(...steps)).toBeLessThan(12)
    expect(at.at(-1)).toBe(100)
  })

  it("takes the time it is given for a move begun from rest, whatever the last took", () => {
    const glide = new Glide(0, 0.2)
    run(glide, 0, 0.5, 0.2)
    const at = run(glide, 100, 2.5, 2)
    // half way at half the time, as a move that was always to take two seconds
    expect(at[59]).toBeLessThan(50)
    expect(at[61]).toBeGreaterThan(50)
    expect(at[118]).toBeLessThan(100)
    expect(at[122]).toBe(100)
  })

  it("stays where it is while no time goes by", () => {
    const glide = new Glide(0, 1)
    run(glide, 100, 0.3)
    const at = glide.now()
    expect(glide.next(100, 0, 1)).toBe(at)
  })
})
