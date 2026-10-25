import { describe, expect, it, vi } from "vitest"

import { fromCopy, fromJlcpcb, isJlcpcbNumber, jlcpcbParts } from "./jlcpcb"

/** JLCPCB's parts search's answer, with these parts in it. */
const searched = (...list: Record<string, unknown>[]) => ({
  code: 200,
  data: { componentPageInfo: { list } },
})

const ch224k = {
  componentCode: "C970725",
  componentModelEn: "CH224K",
  componentSpecificationEn: "ESSOP-10",
  describe: "PD 3.0 Power Receiver Controller",
  stockCount: 135,
  componentLibraryType: "expand",
  componentPrices: [
    { startNumber: 10, endNumber: 29, productPrice: 0.4124 },
    { startNumber: 1, endNumber: 9, productPrice: 0.5139 },
  ],
}

const answer = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

describe("isJlcpcbNumber", () => {
  it("takes a C and its figures, and nothing else", () => {
    expect(isJlcpcbNumber("C25804")).toBe(true)
    expect(isJlcpcbNumber("25804")).toBe(false)
    expect(isJlcpcbNumber("C25804&x=1")).toBe(false)
  })
})

describe("fromJlcpcb", () => {
  it("has the part of that very number, at the price of one bought singly", () => {
    const loose = { ...ch224k, componentCode: "C970726" }
    expect(fromJlcpcb("C970725", searched(loose, ch224k))).toEqual({
      number: "C970725",
      maker: "CH224K",
      package: "ESSOP-10",
      description: "PD 3.0 Power Receiver Controller",
      stock: 135,
      price: 0.5139,
      basic: false,
    })
  })

  it("has none where JLCPCB lists only parts like it, and throws where it gives no answer", () => {
    expect(fromJlcpcb("C1", searched(ch224k))).toBeNull()
    expect(() => fromJlcpcb("C1", { code: 500 })).toThrow()
  })
})

describe("fromCopy", () => {
  it("has the part tscircuit's copy lists by that number", () => {
    const found = {
      components: [
        {
          lcsc: 25804,
          mfr: "0603WAF1002T5E",
          package: "0603",
          stock: 9,
          price: 0.0005,
          is_basic: true,
        },
      ],
    }
    expect(fromCopy("C25804", found)).toMatchObject({
      maker: "0603WAF1002T5E",
      stock: 9,
      basic: true,
    })
    expect(fromCopy("C1", found)).toBeNull()
  })
})

describe("jlcpcbParts", () => {
  it("asks JLCPCB, and keeps what it said for a while", async () => {
    const fetching = vi.fn(() => answer(searched(ch224k)))
    let now = 0
    const part = jlcpcbParts(fetching as unknown as typeof fetch, () => now)
    expect((await part("c970725"))?.stock).toBe(135)
    await part("C970725")
    expect(fetching).toHaveBeenCalledTimes(1)
    now = 11 * 60_000
    await part("C970725")
    expect(fetching).toHaveBeenCalledTimes(2)
  })

  it("asks tscircuit's copy where JLCPCB cannot be asked", async () => {
    const fetching = vi.fn((url: string) =>
      url.includes("jlcpcb.com")
        ? answer({}, 403)
        : answer({
            components: [
              { lcsc: 970725, mfr: "CH224K", stock: 150, price: 0.6166 },
            ],
          })
    )
    const part = jlcpcbParts(fetching as unknown as typeof fetch)
    expect(await part("C970725")).toMatchObject({ stock: 150, price: 0.6166 })
  })

  it("rejects where neither can say, and asks again the next time", async () => {
    const fetching = vi.fn(() => answer({}, 503))
    const part = jlcpcbParts(fetching as unknown as typeof fetch)
    await expect(part("C970725")).rejects.toThrow()
    await expect(part("C970725")).rejects.toThrow()
    expect(fetching).toHaveBeenCalledTimes(4)
  })

  it("asks nothing for what is no JLCPCB number", async () => {
    const fetching = vi.fn()
    await expect(jlcpcbParts(fetching)("C1/../x")).rejects.toThrow()
    expect(fetching).not.toHaveBeenCalled()
  })
})
