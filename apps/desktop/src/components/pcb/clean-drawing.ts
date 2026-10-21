// A drawing of a board, made fit for the page: read as SVG, it is put into the window
// itself, and so is anything in it. The board's files are the project's, and anything
// could have been written into them; so nothing that runs stays, nothing that goes
// somewhere else, nothing that moves of itself, and no style that reaches past the
// drawing to the rest of the window (to dress a button up as another, say).

/** What is taken out of a drawing, whole: what runs, holds a page, or moves of itself. */
const TAKEN = new Set(
  [
    "script",
    "foreignObject",
    "iframe",
    "object",
    "embed",
    "a",
    "set",
    "animate",
    "animateTransform",
    "animateMotion",
    "animateColor",
    "discard",
  ].map((name) => name.toLowerCase())
)

/** What of a drawing is gone through: as much of an element as is needed of one. */
export type Drawn = {
  readonly localName: string
  readonly children: ArrayLike<Drawn>
  readonly attributes: ArrayLike<{ name: string; value: string }>
  textContent: string | null
  removeAttribute(name: string): void
  remove(): void
}

/**
 * The font tscircuit draws a board's lettering in, as it puts it into every drawing: by
 * a name of its own, which nothing else in the window goes by, and held in the drawing
 * itself. That one font is kept as it is.
 */
const ALPHABET =
  /^\s*font-family:\s*'TscircuitAlphabet';\s*src:\s*url\('data:font\/ttf;base64,[A-Za-z0-9+/=]+'\)\s*format\('truetype'\);[\w\s:;-]*$/

/**
 * The rules of a drawing's style, kept to the drawing (`scope`, a selector for it): only
 * plain rules, each put under the scope, with what they set as it was where it neither
 * fetches anything nor breaks out of the rule; and tscircuit's own font (ALPHABET).
 * Anything else (an @import, another font, a rule it cannot read) is left out.
 */
export function scopedStyle(css: string, scope: string): string {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const rules: string[] = []
  for (const [, selectors, declarations] of plain.matchAll(
    /([^{}]*)\{([^{}]*)\}/g
  )) {
    const chosen = selectors.trim()
    if (chosen === "@font-face" && ALPHABET.test(declarations)) {
      rules.push(`@font-face {${declarations}}`)
      continue
    }
    // (no brackets of its own, which could close the scope it is put under)
    if (!/^[\w\s.#,:>+~*[\]="'-]+$/.test(chosen)) continue
    if (/[\\<>@]|url\s*\(|image-set\s*\(|expression\s*\(/i.test(declarations))
      continue
    rules.push(`${scope} :is(${chosen}) {${declarations}}`)
  }
  return rules.join("\n")
}

/**
 * Take out of a drawing everything that does more than draw: elements that run or move
 * (TAKEN), what is done on an event, links that lead out of it, the style its own root
 * has (which could lay it over the window), and of its style elements whatever reaches
 * past it (see `scopedStyle`).
 */
export function cleanDrawing(svg: Drawn, scope: string): void {
  const each = (thing: Drawn, root: boolean) => {
    if (TAKEN.has(thing.localName.toLowerCase())) return thing.remove()
    for (const { name, value } of [...Array.from(thing.attributes)])
      if (
        name.toLowerCase().startsWith("on") ||
        (/href$/i.test(name) && !value.trim().startsWith("#")) ||
        (root && name.toLowerCase() === "style")
      )
        thing.removeAttribute(name)
    if (thing.localName.toLowerCase() === "style") {
      thing.textContent = scopedStyle(thing.textContent ?? "", scope)
      return
    }
    for (const child of [...Array.from(thing.children)]) each(child, false)
  }
  each(svg, true)
}
