import { describe, expect, it } from "vitest"

import { cleanDrawing, scopedStyle, type Drawn } from "./clean-drawing"

/** An element, as much of one as a drawing is gone through with. */
type Made = Drawn & {
  children: Made[]
  attributes: { name: string; value: string }[]
  parent: Made | null
}

const SVG = "http://www.w3.org/2000/svg"

function element(
  localName: string,
  attributes: Record<string, string> = {},
  children: Made[] = [],
  text: string | null = null,
  namespaceURI: string | null = SVG
): Made {
  const made: Made = {
    localName,
    namespaceURI,
    children,
    parent: null,
    attributes: Object.entries(attributes).map(([name, value]) => ({
      name,
      value,
    })),
    textContent: text,
    removeAttribute(name) {
      made.attributes = made.attributes.filter((one) => one.name !== name)
    },
    remove() {
      const { parent } = made
      if (parent) parent.children.splice(parent.children.indexOf(made), 1)
    },
  }
  for (const child of children) child.parent = made
  return made
}

const names = (made: Made): string[] => [
  made.localName,
  ...made.children.flatMap(names),
]
const attributesOf = (made: Made) =>
  Object.fromEntries(Array.from(made.attributes).map((a) => [a.name, a.value]))

describe("cleanDrawing", () => {
  it("takes out what runs, what holds a page, and what moves of itself", () => {
    const svg = element("svg", {}, [
      element("rect", { fill: "#123" }, [
        element("set", { attributeName: "fill", to: "red" }),
        element("animate", { attributeName: "x" }),
      ]),
      element("script", {}, [], "alert(1)"),
      element("foreignObject", {}, [element("iframe")]),
      element("animateTransform"),
      element("animateMotion"),
      element("a", { href: "https://example.com" }, [element("text")]),
      element("g", {}, [element("path", { d: "M0 0" })]),
    ])
    cleanDrawing(svg, "svg")
    expect(names(svg)).toEqual(["svg", "rect", "g", "path"])
  })

  it("takes out what is not SVG's, whatever it is called", () => {
    const xhtml = "http://www.w3.org/1999/xhtml"
    // as a board's text can put one in, past the CDATA its drawing wraps text in
    const frame = element(
      "frame",
      { src: "javascript:parent.cad" },
      [],
      null,
      xhtml
    )
    const svg = element("svg", {}, [
      element("text", {}, [frame]),
      element("rect", {}, [], null, xhtml),
      element("g", {}, [], null, null),
      element("path", { d: "M0 0" }),
    ])
    cleanDrawing(svg, "svg")
    expect(names(svg)).toEqual(["svg", "text", "path"])
  })

  it("takes out what is done on an event, links that lead out, and the root's own style", () => {
    const use = element("use", { href: "#pad" })
    const image = element("image", { "xlink:href": "javascript:alert(1)" })
    const rect = element("rect", {
      onclick: "alert(1)",
      OnLoad: "alert(1)",
      fill: "url(#copper)",
      style: "opacity: 0.5",
    })
    const svg = element(
      "svg",
      { style: "position: fixed; inset: 0; z-index: 99", width: "10" },
      [use, image, rect]
    )
    cleanDrawing(svg, "svg")
    expect(attributesOf(svg)).toEqual({ width: "10" })
    expect(attributesOf(use)).toEqual({ href: "#pad" })
    expect(attributesOf(image)).toEqual({})
    expect(attributesOf(rect)).toEqual({
      fill: "url(#copper)",
      style: "opacity: 0.5",
    })
  })

  it("keeps a style element's rules to the drawing", () => {
    const style = element(
      "style",
      {},
      [],
      ".chip { fill: #222; } button { opacity: 0 }"
    )
    const svg = element("svg", {}, [style])
    cleanDrawing(svg, 'svg[data-drawing="1"]')
    expect(style.textContent).toBe(
      'svg[data-drawing="1"] :is(.chip) { fill: #222; }\nsvg[data-drawing="1"] :is(button) { opacity: 0 }'
    )
  })
})

describe("scopedStyle", () => {
  const scope = 'svg[data-drawing="1"]'

  it("puts each plain rule under the drawing", () => {
    expect(
      scopedStyle(
        "/* the schematic */ .boundary { fill: #000; }\n.text, .pin-number { fill: #fff; }",
        scope
      )
    ).toBe(
      `${scope} :is(.boundary) { fill: #000; }\n${scope} :is(.text, .pin-number) { fill: #fff; }`
    )
  })

  it("leaves out what fetches, what is no plain rule, and what would break out of the scope", () => {
    expect(
      scopedStyle(
        [
          "@import url(https://example.com/x.css);",
          "@font-face { font-family: Inter; src: url(data:font/ttf;base64,AAAA) }",
          ".a { background: url(https://example.com/?a) }",
          ".b { background: image-set('x.png' 1x) }",
          ".c\\,body { fill: red }",
          ".d), body, :is(.e { opacity: 0 }",
        ].join("\n"),
        scope
      )
    ).toBe("")
    // tscircuit's own font, which nothing else goes by, held in the drawing, is kept
    const alphabet =
      "@font-face { font-family: 'TscircuitAlphabet'; src: url('data:font/ttf;base64,AAEA') format('truetype'); font-weight: normal; font-style: normal; }"
    expect(scopedStyle(alphabet, scope)).toBe(alphabet)
    expect(
      scopedStyle(alphabet.replace("TscircuitAlphabet", "Inter"), scope)
    ).toBe("")
    // what is under an at-rule is the drawing's alone too, where it is kept at all
    expect(scopedStyle("@media screen { body { display: none } }", scope)).toBe(
      `${scope} :is(body) { display: none }`
    )
  })
})
