// A picture had from a link pasted on the inspiration board. A link to a picture gives
// that picture; a link to a page gives the picture the page puts forward for itself when
// it is shared (its og:image, or twitter:image), named by the page's title. It is fetched
// here, by the app's own process, as a page the window loads could not fetch it.
//
// What comes back is as it was fetched: the window makes it fit to be kept, and of a
// kind the board keeps, as it does a picture dropped on it (see `fitted`).

/** A picture fetched from a link: what to call it, its kind, and what is in its file. */
export type Linked = { name: string; mimeType: string; data: ArrayBuffer }

/** The most a fetched picture can be, in bytes, before the window makes it smaller. */
const MOST_PICTURE = 40_000_000
/** The most of a page that is read for its picture, in bytes. */
const MOST_PAGE = 3_000_000
/** How long a link is given to answer, and to finish, in ms. */
const WAITING_MS = 20_000

/** The kinds of picture a link's file ending says, where its server says nothing of use. */
const BY_ENDING: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
}

/** What a file of a kind of picture ends in: nothing for a kind not known here. */
const endingOf = (kind: string) =>
  Object.keys(BY_ENDING).find((ending) => BY_ENDING[ending] === kind) ?? ""

/** Where a page says its picture is, the likeliest first. */
const PAGE_PICTURES = [
  "og:image:secure_url",
  "og:image:url",
  "og:image",
  "twitter:image",
  "twitter:image:src",
]

/** A tag's attributes, by their names in small letters: `<meta property="og:image" …>`. */
function attributesOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of tag.matchAll(
    /([a-zA-Z_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  ))
    out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ""
  return out
}

/** Text as it stands in a page with its &-escapes undone. */
function unescaped(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number(decimal))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/** A link as it stands in a page, made whole against the page's own: null if no web link. */
function linkFrom(value: string, page: string): string | null {
  try {
    const url = new URL(unescaped(value.trim()), page)
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null
  } catch {
    return null
  }
}

/**
 * The picture a page puts forward for itself, and its title, from the page's HTML at
 * `page`: the picture null where it names none.
 */
export function pageOf(
  html: string,
  page: string
): { picture: string | null; title: string | null } {
  const said = new Map<string, string>()
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const { property, name, content } = attributesOf(tag)
    const key = (property ?? name)?.toLowerCase()
    if (key && content && !said.has(key)) said.set(key, content)
  }
  let picture: string | null = null
  for (const key of PAGE_PICTURES) {
    const value = said.get(key)
    picture = value ? linkFrom(value, page) : null
    if (picture) break
  }
  if (!picture)
    for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
      const { rel, href } = attributesOf(tag)
      if (rel?.toLowerCase() === "image_src" && href) {
        picture = linkFrom(href, page)
        if (picture) break
      }
    }
  const titled =
    said.get("og:title") ??
    said.get("twitter:title") ??
    /<title\b[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]
  const title = titled ? unescaped(titled).replace(/\s+/g, " ").trim() : ""
  return { picture, title: title || null }
}

/** What a link's file is called, from the last of its path: the site's name where none. */
export function nameOfLink(link: string): string {
  const url = new URL(link)
  const last = url.pathname.split("/").filter(Boolean).at(-1)
  if (last)
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  return url.hostname.replace(/^www\./, "")
}

/** The kind of what came back, by what its server says, or else by its file ending. */
function kindOf(response: Response, link: string): string | null {
  const said = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()
  if (said.startsWith("image/") || said === "text/html") return said
  if (said === "application/xhtml+xml") return "text/html"
  const path = new URL(link).pathname.toLowerCase()
  const ending = path.slice(path.lastIndexOf("."))
  return BY_ENDING[ending] ?? null
}

/** What came back, if it comes to no more than `most` bytes: null if it does. */
async function bodyOf(
  response: Response,
  most: number,
  whole: boolean
): Promise<Buffer | null> {
  if (!response.body) return null
  const chunks: Uint8Array[] = []
  let received = 0
  for await (const chunk of response.body) {
    received += chunk.length
    chunks.push(chunk)
    if (received > most) {
      // (a page's picture is named near its top: what there is of it will do)
      if (whole) return null
      break
    }
  }
  return Buffer.concat(chunks)
}

/** A Buffer's bytes, as an ArrayBuffer of their own. */
const ownBytes = (bytes: Buffer): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer

/**
 * The picture at a link, or the one the page at it puts forward: null where there is
 * none, or it cannot be had.
 */
export async function linkedPicture(
  link: string,
  get: typeof fetch = fetch,
  waiting = WAITING_MS
): Promise<Linked | null> {
  const signal = AbortSignal.timeout(waiting)
  const fetching = (url: string) =>
    get(url, {
      signal,
      headers: { accept: "image/*,text/html;q=0.9,*/*;q=0.5" },
    })
  try {
    const first = await fetching(link)
    if (!first.ok) return null
    const kind = kindOf(first, first.url || link)
    if (!kind) return null
    if (kind.startsWith("image/")) {
      const data = await bodyOf(first, MOST_PICTURE, true)
      return data && data.length > 0
        ? { name: nameOfLink(link), mimeType: kind, data: ownBytes(data) }
        : null
    }
    const html = await bodyOf(first, MOST_PAGE, false)
    if (!html) return null
    const page = pageOf(html.toString("utf8"), first.url || link)
    if (!page.picture) return null
    const second = await fetching(page.picture)
    if (!second.ok) return null
    const pictureKind = kindOf(second, second.url || page.picture)
    if (!pictureKind?.startsWith("image/")) return null
    const data = await bodyOf(second, MOST_PICTURE, true)
    return data && data.length > 0
      ? {
          // (with an ending, for what is kept to be named by all of the title)
          name: page.title
            ? page.title + endingOf(pictureKind)
            : nameOfLink(page.picture),
          mimeType: pictureKind,
          data: ownBytes(data),
        }
      : null
  } catch {
    return null
  }
}
