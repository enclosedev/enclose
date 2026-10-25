import { describe, expect, it } from "vitest"

import { pickedFrames, sheetOf } from "./animation"

describe("pickedFrames", () => {
  it("takes every frame where there are few", () => {
    expect(pickedFrames([1, 1, 1])).toEqual([0, 1, 2])
  })

  it("takes frames at even steps through the running time", () => {
    expect(pickedFrames(Array(20).fill(100), 4)).toEqual([0, 5, 10, 15])
    // a frame held long is where most of the time is, and is taken once
    expect(pickedFrames([10, 10, 380, 10, 10, 10, 10], 4)).toEqual([0, 2])
  })
})

describe("sheetOf", () => {
  it("lays frames out near square, at their own size where there is room", () => {
    expect(sheetOf(9, 200, 150)).toEqual({
      columns: 3,
      rows: 3,
      w: 200,
      h: 150,
      width: 664,
      height: 514,
    })
    expect(sheetOf(5, 200, 150)).toMatchObject({ columns: 3, rows: 2 })
  })

  it("makes big frames smaller, to keep the sheet no longer than it can be", () => {
    const sheet = sheetOf(9, 1920, 1080, 2000)
    expect(sheet.width).toBeLessThanOrEqual(2000)
    expect(sheet.w / sheet.h).toBeCloseTo(1920 / 1080, 1)
  })
})
