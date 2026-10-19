/** What a page on the site can be had as. HTML first: it is what is sent when either will do. */
export const OFFERED = ['text/html', 'text/markdown'] as const

export type Offered = (typeof OFFERED)[number]

type Entry = { type: string; subtype: string; q: number; at: number }

/** An Accept header read into its entries, each with its quality (1 where none is said). */
function entries(accept: string): Entry[] {
  const read: Entry[] = []
  accept.split(',').forEach((part, at) => {
    const [range, ...parameters] = part.split(';').map((piece) => piece.trim())
    const [type, subtype] = range.toLowerCase().split('/')
    if (!type || !subtype) return
    let q = 1
    for (const parameter of parameters) {
      const [name, value] = parameter.split('=').map((piece) => piece.trim())
      if (name.toLowerCase() !== 'q') continue
      q = Number(value)
    }
    // a quality that is not one is not an entry to go by
    if (!Number.isFinite(q) || q < 0 || q > 1) return
    read.push({ type, subtype, q, at })
  })
  return read
}

/** How closely an entry names a type: by name, by its kind (text/*), or as anything. */
function closeness(entry: Entry, type: string, subtype: string): number {
  if (entry.type === type && entry.subtype === subtype) return 3
  if (entry.type === type && entry.subtype === '*') return 2
  if (entry.type === '*' && entry.subtype === '*') return 1
  return 0
}

/**
 * Which of what the site offers to send for an Accept header, as RFC 9110 §12.5.1 has it:
 * each type is given the quality of the entry that names it most closely, the highest
 * quality wins, then the type named by name over one matched by a wildcard, then the one
 * the header lists first, and then HTML. No header, or an empty one, is no constraint at
 * all. Nothing (a 406) where every type offered is unmatched or refused with q=0.
 *
 * https://acceptmarkdown.com/guides/accept-parsing
 */
export function negotiate(accept: string | null | undefined): Offered | null {
  if (!accept?.trim()) return OFFERED[0]
  const read = entries(accept)
  let best: { type: Offered; q: number; closeness: number; at: number } | null = null
  for (const offered of OFFERED) {
    const [type, subtype] = offered.split('/')
    let match: Entry | null = null
    let closest = 0
    for (const entry of read) {
      const near = closeness(entry, type, subtype)
      if (near > closest) [match, closest] = [entry, near]
    }
    if (!match || match.q === 0) continue
    const candidate = { type: offered, q: match.q, closeness: closest, at: match.at }
    const better =
      !best ||
      candidate.q > best.q ||
      (candidate.q === best.q && candidate.closeness > best.closeness) ||
      // both by name, and as wanted: the one the header puts first
      (candidate.q === best.q && candidate.closeness === best.closeness && closest === 3 && candidate.at < best.at)
    if (better) best = candidate
  }
  return best?.type ?? null
}
