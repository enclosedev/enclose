// The lettering on a circuit board, checked, for Enclose (https://enclose.dev): what is
// printed on it (each part's name, and the board's own <silkscreentext>) as it will be
// read once the board is made. The build says what it finds (kit/board.mjs), and so do
// the checks a board is ordered by (kit/board-check.mjs).
//
// A word is measured as tscircuit prints it, in its own font, whose letters are all as
// wide (@tscircuit/alphabet): 0.692 of the size each, the capitals 0.73 of it tall. It is
// found wrong where it
//
//   - is in lower case, which that font prints poorly at the size boards are lettered at,
//     or is smaller than prints legibly;
//   - runs into another word, or a pad or a hole, where it is cut away when the board is
//     made, or a part's outline or a dot printed beside a pin;
//   - goes over the board's edge, or comes too close to it;
//   - or reads upside down, or from top to bottom: a word reads from the bottom of the
//     board, or turned a quarter to read from its right, as on any board.
//
// And the artwork printed on it (<silkscreengraphic>, from board-art.mjs), where it runs
// into a word, a pad or a hole, or goes over the edge.

/** Each letter's width, and the height of a line of capitals, as shares of the size. */
const LETTER = 0.692
const CAPITALS = 0.78
/** The room kept round a word, mm: from another word or a line, a pad or a hole, and the edge. */
const FROM_PRINT = 0.1
const FROM_COPPER = 0.2
const FROM_EDGE = 0.5
/** The smallest lettering that prints legibly, mm. */
const SMALLEST = 0.8

// ---------------------------------------------------------------------------------------
// Shapes: a convex outline, as its corners, or a ring (a dot is a ring with no hole).

const turned = ({ x, y }, degrees) => {
  const a = (degrees * Math.PI) / 180
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) }
}

/** A rectangle's corners, about its middle, turned anticlockwise. */
function rectangle(x, y, width, height, degrees = 0) {
  return [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ].map((corner) => {
    const at = turned(corner, degrees)
    return { x: x + at.x, y: y + at.y }
  })
}

/** A line drawn with a pen of a width, as the outline it covers. */
function stroke(a, b, width) {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const degrees = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  return rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, length + width, Math.max(width, 0.01), degrees)
}

/** Whether two convex outlines meet: by their separating axes. */
function meet(one, other) {
  for (const corners of [one, other])
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % corners.length]
      const axis = { x: a.y - b.y, y: b.x - a.x }
      const span = (points) => {
        const along = points.map((p) => p.x * axis.x + p.y * axis.y)
        return [Math.min(...along), Math.max(...along)]
      }
      const [oneMin, oneMax] = span(one)
      const [otherMin, otherMax] = span(other)
      if (oneMax < otherMin || otherMax < oneMin) return false
    }
  return true
}

const near = (p, a, b) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

function inside(p, corners) {
  let within = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i]
    const b = corners[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) within = !within
  }
  return within
}

/** Whether a convex outline meets a ring, from `inner` to `outer` about `centre`. */
function meetsRing(corners, centre, inner, outer) {
  const edges = corners.map((a, i) => [a, corners[(i + 1) % corners.length]])
  const closest = inside(centre, corners) ? 0 : Math.min(...edges.map(([a, b]) => near(centre, a, b)))
  const farthest = Math.max(...corners.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)))
  return closest <= outer && farthest >= inner
}

/** Whether a convex outline meets a shape: an outline, or a ring. */
const meets = (corners, shape) =>
  shape.ring ? meetsRing(corners, shape.ring.centre, shape.ring.inner, shape.ring.outer) : meet(corners, shape.corners)

/** An outline grown by `by` all round, as near as a box needs: its corners pushed out from its middle along its sides. */
function grown(corners, by) {
  const [a, b, , d] = corners
  const along = { x: b.x - a.x, y: b.y - a.y }
  const across = { x: d.x - a.x, y: d.y - a.y }
  const unit = (v) => {
    const length = Math.hypot(v.x, v.y) || 1
    return { x: v.x / length, y: v.y / length }
  }
  const u = unit(along)
  const v = unit(across)
  const signs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  return corners.map((p, i) => ({
    x: p.x + by * (signs[i][0] * u.x + signs[i][1] * v.x),
    y: p.y + by * (signs[i][0] * u.y + signs[i][1] * v.y),
  }))
}

// ---------------------------------------------------------------------------------------
// What is on the board.

/** A word's box, as printed: its four corners, from its lower left as it reads. */
export function boxOf(text) {
  const size = Number(text.font_size) || 1
  const lines = String(text.text ?? "").split("\n")
  const width = Math.max(...lines.map((line) => line.length)) * LETTER * size
  const height = size * (lines.length - 1 + CAPITALS)
  const anchor = text.anchor_alignment ?? "center"
  const left = anchor.endsWith("left") ? 0 : anchor.endsWith("right") ? -width : -width / 2
  const bottom = anchor.startsWith("top") ? -height : anchor.startsWith("bottom") ? 0 : -height / 2
  // printed on the underside, a word is mirrored, as it is read from there
  const mirror = text.layer === "bottom" ? -1 : 1
  const degrees = Number(text.ccw_rotation) || 0
  const { x, y } = text.anchor_position
  return [
    { x: left, y: bottom },
    { x: left + width, y: bottom },
    { x: left + width, y: bottom + height },
    { x: left, y: bottom + height },
  ].map((corner) => {
    const at = turned({ x: corner.x * mirror, y: corner.y }, degrees)
    return { x: x + at.x, y: y + at.y }
  })
}

/** A pad's or a hole's shape on the board, grown by `by`: an outline, or a ring. */
function copperOf(one, by) {
  const round = (diameter) => ({ ring: { centre: { x: one.x, y: one.y }, inner: 0, outer: diameter / 2 + by } })
  const rect = (width, height, degrees = 0) => ({
    corners: rectangle(one.x, one.y, width + 2 * by, height + 2 * by, degrees),
  })
  if (one.type === "pcb_smtpad") {
    if (one.shape === "circle") return round(one.radius * 2)
    if (one.shape === "polygon" && one.points?.length) {
      const xs = one.points.map((p) => p.x)
      const ys = one.points.map((p) => p.y)
      return {
        corners: [
          { x: Math.min(...xs) - by, y: Math.min(...ys) - by },
          { x: Math.max(...xs) + by, y: Math.min(...ys) - by },
          { x: Math.max(...xs) + by, y: Math.max(...ys) + by },
          { x: Math.min(...xs) - by, y: Math.max(...ys) + by },
        ],
      }
    }
    if (one.width && one.height) return rect(one.width, one.height, one.ccw_rotation ?? 0)
    return null
  }
  if (one.type === "pcb_plated_hole") {
    if (one.shape === "circle") return round(one.outer_diameter ?? one.hole_diameter)
    if (one.rect_pad_width && one.rect_pad_height)
      return rect(one.rect_pad_width, one.rect_pad_height, one.rect_ccw_rotation ?? one.ccw_rotation ?? 0)
    if (one.outer_width && one.outer_height) return rect(one.outer_width, one.outer_height, one.ccw_rotation ?? 0)
    const diameter = one.outer_diameter ?? one.hole_diameter
    return diameter ? round(diameter) : null
  }
  if (one.type === "pcb_hole") {
    if (one.hole_diameter) return round(one.hole_diameter)
    if (one.hole_width && one.hole_height) return rect(one.hole_width, one.hole_height, one.ccw_rotation ?? 0)
  }
  return null
}

/** What is printed on the board but words, as the shapes it covers: outlines and dots. */
function printOf(one) {
  const pen = Number(one.stroke_width) || 0.1
  if (one.type === "pcb_silkscreen_path") {
    const route = one.route ?? []
    return route.slice(1).map((b, i) => ({ corners: stroke(route[i], b, pen) }))
  }
  if (one.type === "pcb_silkscreen_line")
    return [{ corners: stroke({ x: one.x1, y: one.y1 }, { x: one.x2, y: one.y2 }, pen) }]
  if (one.type === "pcb_silkscreen_rect") {
    const { x, y } = one.center
    if (one.is_filled) return [{ corners: rectangle(x, y, one.width, one.height) }]
    const corners = rectangle(x, y, one.width, one.height, one.ccw_rotation ?? 0)
    return corners.map((a, i) => ({ corners: stroke(a, corners[(i + 1) % 4], pen) }))
  }
  if (one.type === "pcb_silkscreen_circle")
    return [
      {
        ring: {
          centre: one.center,
          inner: one.is_filled ? 0 : Math.max(0, one.radius - pen / 2),
          outer: one.radius + pen / 2,
        },
      },
    ]
  return []
}

const SIDES = { top: "top", bottom: "bottom" }
const onSide = (one, side) => {
  if (one.type === "pcb_plated_hole" || one.type === "pcb_hole") return true
  return (SIDES[one.layer] ?? "top") === side
}

/** Whether two lines cross. */
function cross(a, b, c, d) {
  const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0
}

/**
 * The artwork printed on the board, each picture placed once: the pieces tscircuit cut
 * it into (an outline, and the holes in it), its side, and its middle, to say where it is.
 */
function artworkOf(circuit) {
  const placed = new Map()
  for (const one of circuit) {
    const shape = one.type === "pcb_silkscreen_graphic" && one.brep_shape
    if (!shape?.outer_ring?.vertices?.length) continue
    // the pieces of one picture carry the one picture
    const key = `${one.layer}\n${one.image_asset?.url ?? one.pcb_silkscreen_graphic_id}`
    if (!placed.has(key)) placed.set(key, { side: one.layer === "bottom" ? "bottom" : "top", pieces: [] })
    placed.get(key).pieces.push({
      outer: shape.outer_ring.vertices,
      inners: (shape.inner_rings ?? []).map((ring) => ring.vertices),
    })
  }
  return [...placed.values()].map((art) => {
    const all = art.pieces.flatMap((piece) => piece.outer)
    const xs = all.map((p) => p.x)
    const ys = all.map((p) => p.y)
    return {
      ...art,
      middle: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
    }
  })
}

/** Whether a piece of artwork meets a shape: an outline, or a ring. */
function pieceMeets(piece, shape) {
  const filled = (p) => inside(p, piece.outer) && !piece.inners.some((ring) => inside(p, ring))
  const rings = [piece.outer, ...piece.inners]
  const edges = rings.flatMap((ring) => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]))
  if (shape.ring) {
    const { centre, inner, outer } = shape.ring
    const closest = filled(centre) ? 0 : Math.min(...edges.map(([a, b]) => near(centre, a, b)))
    const farthest = Math.max(...piece.outer.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)))
    return closest <= outer && farthest >= inner
  }
  const corners = shape.corners
  if (corners.some(filled) || piece.outer.some((p) => inside(p, corners))) return true
  const sides = corners.map((a, i) => [a, corners[(i + 1) % corners.length]])
  return edges.some(([a, b]) => sides.some(([c, d]) => cross(a, b, c, d)))
}

const at = ({ x, y }) => `(${x.toFixed(1)}, ${y.toFixed(1)})`

/**
 * What is wrong with the lettering on a built board (its circuit.json), as lines to say:
 * each word that is in lower case, that runs into anything, that goes over the edge, or
 * that reads upside down. None where it is all as it should be.
 */
export function letteringOf(circuit) {
  const names = new Map()
  const sources = new Map(
    circuit.filter((one) => one.type === "source_component").map((one) => [one.source_component_id, one.name])
  )
  for (const one of circuit)
    if (one.type === "pcb_component") names.set(one.pcb_component_id, sources.get(one.source_component_id))
  const partOf = (one) => names.get(one.pcb_component_id) ?? null
  const texts = circuit.filter((one) => one.type === "pcb_silkscreen_text" && String(one.text ?? "").trim())
  // a part's own name is the one of its words that is its name; any other is a word
  const call = (text) => {
    const part = partOf(text)
    return part && String(text.text).trim() === part ? `${part}'s name` : `"${String(text.text).replace(/\n/g, " ")}"`
  }
  const found = []
  const boxes = texts.map((text) => boxOf(text))
  const artwork = artworkOf(circuit)
  const sayArt = (art) => `the artwork at ${at(art.middle)}`
  const side = (text) => (text.layer === "bottom" ? "bottom" : "top")

  // in lower case
  for (const text of texts)
    if (/[a-z]/.test(String(text.text)))
      found.push(`${call(text)} at ${at(text.anchor_position)} has lower-case letters: print it in capitals.`)

  // too small
  for (const text of texts)
    if ((Number(text.font_size) || 1) < SMALLEST - 1e-6)
      found.push(
        `${call(text)} at ${at(text.anchor_position)} is ${Number(text.font_size)} mm tall: make it ${SMALLEST} mm or more, or leave it off.`
      )

  // the way it reads: from the bottom, or from the right
  for (const text of texts) {
    if (side(text) !== "top") continue
    const degrees = (((Number(text.ccw_rotation) || 0) % 360) + 360) % 360
    if (degrees > 90.5 && degrees < 359.5)
      found.push(
        `${call(text)} at ${at(text.anchor_position)} reads ${Math.abs(degrees - 180) < 0.5 ? "upside down" : "from top to bottom"} (turned ${Math.round(degrees)}°): turn it to read from the bottom of the board (0°), or from its right (90°).`
      )
  }

  // into each other
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      if (side(texts[i]) !== side(texts[j])) continue
      if (meet(grown(boxes[i], FROM_PRINT / 2), grown(boxes[j], FROM_PRINT / 2)))
        found.push(`${call(texts[i])} and ${call(texts[j])} run into each other, at ${at(texts[i].anchor_position)}.`)
    }

  // into pads, holes, outlines and dots
  const copper = circuit.filter((one) => ["pcb_smtpad", "pcb_plated_hole", "pcb_hole"].includes(one.type))
  const print = circuit.filter((one) =>
    ["pcb_silkscreen_path", "pcb_silkscreen_line", "pcb_silkscreen_rect", "pcb_silkscreen_circle"].includes(one.type)
  )
  texts.forEach((text, i) => {
    const hit = new Set()
    for (const one of copper) {
      if (!onSide(one, side(text))) continue
      const shape = copperOf(one, FROM_COPPER)
      if (!shape || !meets(boxes[i], shape)) continue
      const part = partOf(one)
      hit.add(
        one.type === "pcb_hole" ? `a hole at ${at(one)}` : part ? `${part}'s ${one.type === "pcb_smtpad" ? "pads" : "pins"}` : `a pad at ${at(one)}`
      )
    }
    const box = grown(boxes[i], FROM_PRINT)
    for (const one of print) {
      if (!onSide(one, side(text))) continue
      if (!printOf(one).some((shape) => meets(box, shape))) continue
      const part = partOf(one)
      const dot = one.type === "pcb_silkscreen_circle" && one.radius <= 0.5
      hit.add(part ? `${part}'s outline` : dot ? `the dot at ${at(one.center)}` : `a line printed at ${at(one.route?.[0] ?? one.center ?? { x: one.x1, y: one.y1 })}`)
    }
    for (const art of artwork)
      if (art.side === side(text) && art.pieces.some((piece) => pieceMeets(piece, { corners: box })))
        hit.add(sayArt(art))
    if (hit.size)
      found.push(
        `${call(text)} at ${at(text.anchor_position)} runs into ${[...hit].join(", ")}${[...hit].some((what) => /pads|pins|pad at|hole/.test(what)) ? ": what is printed on copper is cut away when the board is made" : ""}.`
      )
  })

  // the artwork into pads and holes
  for (const art of artwork) {
    const hit = new Set()
    for (const one of copper) {
      if (!onSide(one, art.side)) continue
      const shape = copperOf(one, FROM_COPPER)
      if (!shape || !art.pieces.some((piece) => pieceMeets(piece, shape))) continue
      const part = partOf(one)
      hit.add(
        one.type === "pcb_hole" ? `a hole at ${at(one)}` : part ? `${part}'s ${one.type === "pcb_smtpad" ? "pads" : "pins"}` : `a pad at ${at(one)}`
      )
    }
    if (hit.size)
      found.push(
        `The artwork at ${at(art.middle)} runs into ${[...hit].join(", ")}: what is printed on copper is cut away when the board is made.`
      )
  }

  // over the edge
  const board = circuit.find((one) => one.type === "pcb_board")
  if (board) {
    const edge = board.outline?.length
      ? board.outline
      : rectangle(board.center?.x ?? 0, board.center?.y ?? 0, board.width, board.height)
    const sides = edge.map((a, k) => stroke(a, edge[(k + 1) % edge.length], 0.01))
    texts.forEach((text, i) => {
      const box = grown(boxes[i], FROM_EDGE)
      const out = !boxes[i].every((corner) => inside(corner, edge))
      if (out || sides.some((line) => meet(box, line)))
        found.push(
          `${call(text)} at ${at(text.anchor_position)} ${out ? "goes over the board's edge" : `comes within ${FROM_EDGE} mm of the board's edge`}.`
        )
    })
    for (const art of artwork) {
      const points = art.pieces.flatMap((piece) => piece.outer)
      const out = !points.every((p) => inside(p, edge))
      const close = edge.some((a, k) => points.some((p) => near(p, a, edge[(k + 1) % edge.length]) < FROM_EDGE))
      if (out || close)
        found.push(
          `The artwork at ${at(art.middle)} ${out ? "goes over the board's edge" : `comes within ${FROM_EDGE} mm of the board's edge`}.`
        )
    }
  }
  return found
}
