// A part as JLCPCB lists it now, by its number, for what is said of a part picked out
// on a board's schematic: what it is, how many JLCPCB has, and what one costs. Asked of
// JLCPCB's own parts search, the one its site's parts library is searched with; where
// that gives no answer, of tscircuit's copy of its catalogue, which is missing many parts
// (kit/board-check.mjs asks the two the other way round, and why). Each part is looked
// up once in a while, and not each time it is picked out.
import type { JlcpcbPart } from "../shared/api"

/** How long what was looked up is kept, ms, before it is looked up again. */
const KEPT_MS = 10 * 60_000
/** How long a lookup is waited for, ms. */
const LOOKUP_MS = 15_000
/** What JLCPCB is asked with: it turns away a request that is not a browser's. */
const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

/** A JLCPCB part number: C, and its figures. */
export const isJlcpcbNumber = (number: string) => /^C\d{1,12}$/.test(number)

type Fetch = typeof fetch

/** JLCPCB's own answer, as a part: null where it lists none of that very number. */
export function fromJlcpcb(number: string, found: unknown): JlcpcbPart | null {
  const answer = found as {
    code?: unknown
    data?: { componentPageInfo?: { list?: unknown } }
  } | null
  const listed = answer?.data?.componentPageInfo?.list
  if (answer?.code !== 200 || !Array.isArray(listed))
    throw new Error("JLCPCB's parts search gave no answer")
  // (it matches loosely: only a part of that very number is it)
  const part = (listed as Record<string, unknown>[]).find(
    (one) => String(one.componentCode).toUpperCase() === number
  )
  if (!part) return null
  const prices = Array.isArray(part.componentPrices)
    ? (part.componentPrices as {
        startNumber?: unknown
        productPrice?: unknown
      }[])
    : []
  const single = prices
    .filter((one) => typeof one.productPrice === "number")
    .sort((a, b) => Number(a.startNumber) - Number(b.startNumber))[0]
  return {
    number,
    maker:
      typeof part.componentModelEn === "string" ? part.componentModelEn : null,
    package:
      typeof part.componentSpecificationEn === "string"
        ? part.componentSpecificationEn
        : null,
    description: typeof part.describe === "string" ? part.describe : null,
    stock: typeof part.stockCount === "number" ? part.stockCount : null,
    price: single ? Number(single.productPrice) : null,
    basic: part.componentLibraryType === "base",
  }
}

/** tscircuit's copy's answer, as a part: null where it has none of that number. */
export function fromCopy(number: string, found: unknown): JlcpcbPart | null {
  const id = Number(number.slice(1))
  const listed = (found as { components?: unknown } | null)?.components
  const part = Array.isArray(listed)
    ? (listed as Record<string, unknown>[]).find((one) => one.lcsc === id)
    : undefined
  if (!part) return null
  return {
    number,
    maker: typeof part.mfr === "string" ? part.mfr : null,
    package: typeof part.package === "string" ? part.package : null,
    description: typeof part.description === "string" ? part.description : null,
    stock: typeof part.stock === "number" ? part.stock : null,
    price: typeof part.price === "number" ? part.price : null,
    basic: part.is_basic === true,
  }
}

/**
 * Looks parts up, each kept a while: JLCPCB first, and tscircuit's copy where JLCPCB
 * cannot be asked. Null where JLCPCB lists no such part; rejects where neither answers.
 */
export function jlcpcbParts(fetching: Fetch = fetch, now = () => Date.now()) {
  const kept = new Map<
    string,
    { at: number; part: Promise<JlcpcbPart | null> }
  >()
  const asked = async (url: string, init: RequestInit = {}) => {
    const response = await fetching(url, {
      ...init,
      signal: AbortSignal.timeout(LOOKUP_MS),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as unknown
  }
  const look = async (number: string) => {
    try {
      return fromJlcpcb(
        number,
        await asked(
          "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": BROWSER,
            },
            body: JSON.stringify({
              keyword: number,
              currentPage: 1,
              pageSize: 10,
            }),
          }
        )
      )
    } catch {
      // (the copy is missing many parts: not finding one there says nothing)
      const copied = fromCopy(
        number,
        await asked(
          `https://jlcsearch.tscircuit.com/api/search?q=${encodeURIComponent(number)}&limit=10`
        )
      )
      if (!copied) throw new Error(`${number} could not be looked up`)
      return copied
    }
  }
  return (given: string): Promise<JlcpcbPart | null> => {
    const number = String(given).trim().toUpperCase()
    if (!isJlcpcbNumber(number))
      return Promise.reject(new Error(`${given} is not a JLCPCB part number`))
    const had = kept.get(number)
    if (had && now() - had.at < KEPT_MS) return had.part
    const part = look(number)
    kept.set(number, { at: now(), part })
    // (a lookup that failed is tried again the next time)
    part.catch(() => kept.delete(number))
    return part
  }
}
