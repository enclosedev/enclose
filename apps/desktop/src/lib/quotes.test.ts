import { describe, expect, it } from "vitest"

import { beside, inLine, QUOTE_LENGTH, quoteOf } from "./quotes"

describe("quoteOf", () => {
  it("keeps the lines of what was picked out, without the room round them", () => {
    expect(
      quoteOf("\n  Which screws hold the lid?  \r\n\n\n\nAnd how many? \n")
    ).toBe("Which screws hold the lid?\n\nAnd how many?")
    expect(quoteOf("   \n ")).toBe("")
  })

  it("is no longer than a quote is, and says so where it was", () => {
    const long = quoteOf("a".repeat(QUOTE_LENGTH + 50))
    expect(long).toHaveLength(QUOTE_LENGTH + 1)
    expect(long.endsWith("…")).toBe(true)
    expect(quoteOf("a".repeat(QUOTE_LENGTH))).toHaveLength(QUOTE_LENGTH)
  })
})

describe("inLine", () => {
  it("is the words in one line", () => {
    expect(inLine(" Which screws\n\nhold\tthe lid? ")).toBe(
      "Which screws hold the lid?"
    )
  })
})

describe("beside", () => {
  const within = { left: 100, top: 0, right: 500, bottom: 600 }
  const size = { width: 200, height: 100 }
  const words = { left: 250, top: 300, right: 350, bottom: 320 }

  it("goes over the words or under them, as it would sooner, about their middle", () => {
    expect(beside(words, size, within, "over")).toEqual({ left: 200, top: 192 })
    expect(beside(words, size, within, "under")).toEqual({
      left: 200,
      top: 328,
    })
  })

  it("goes the other way where there is no room the way it would sooner", () => {
    const high = { ...words, top: 40, bottom: 60 }
    expect(beside(high, size, within, "over").top).toBe(68)
    const low = { ...words, top: 540, bottom: 560 }
    expect(beside(low, size, within, "under").top).toBe(432)
  })

  it("keeps all of it inside, whichever way it goes and wherever the words are", () => {
    const atEdge = { left: 480, top: 300, right: 500, bottom: 320 }
    expect(beside(atEdge, size, within, "under").left).toBe(300)
    expect(
      beside({ ...atEdge, left: 100, right: 110 }, size, within, "under").left
    ).toBe(100)
    const gone = { ...words, top: -80, bottom: -60 }
    expect(beside(gone, size, within, "under").top).toBe(0)
    const tall = { ...words, top: 50, bottom: 560 }
    expect(beside(tall, size, within, "under").top).toBe(500)
    expect(beside(tall, size, within, "over").top).toBe(0)
  })
})
