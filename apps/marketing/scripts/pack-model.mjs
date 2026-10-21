#!/usr/bin/env node
// Packs the SO-101 arm of examples/arm into something a web page can carry.
//
//   node scripts/pack-model.mjs        (from apps/marketing)
//
// Reads  ../../examples/arm/build   enclose.model.json + <id>.glb + <id>.edges.bin
// Writes public/model/arm.glb       one node per part, faces joined, meshopt-packed
//        public/model/arm.edges.bin every part's edge lines, uint16 against one box
//        public/model/arm.json      groups, parts, and where each part's edges are
//
// The printed links are what the page is about, so they are kept close to the CAD.
// What is bought and bolted on (servos, the board, screws, cables) is cut hard.

import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

import { Document, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = path.resolve(HERE, '../../../examples/arm/build')
const OUT = path.resolve(HERE, '../public/model')

/**
 * How hard each kind of part is cut. All lengths are mm.
 *
 *   surface   how far the simplified surface may stray from the CAD's
 *   prune     loose pieces of the part smaller than this are left out
 *   line      how far a simplified edge line may stray from the CAD's
 *   lineMin   an edge line smaller than this (the diagonal of its box) is left out
 *   boxBelow  a body of the part smaller than this is drawn as the box it fits in
 *
 * The edge lines are the CAD's own and are drawn over the surfaces, so `surface` has
 * to stay a small part of a pixel or the lines sink into the surface or lift off it.
 * At the size the page shows the arm a pixel is about 0.4 mm.
 */
const KINDS = {
  printed: { surface: 0.02, line: 0.03 },
  servoShell: { surface: 0.12, prune: 0.5, line: 0.08, lineMin: 1.5 },
  servoInside: { surface: 0.25, prune: 1, line: 0.15, lineMin: 3 },
  shaft: { surface: 0.2, prune: 0.8, line: 0.15, lineMin: 4 },
  horn: { surface: 0.1, line: 0.08, lineMin: 1 },
  screw: { surface: 0.1, line: 0.1, lineMin: 0.6 },
  cable: { surface: 0.1, line: 0.1 },
  board: { surface: 0.15, prune: 0.5, line: 0.1, lineMin: 1.5, boxBelow: 4 },
}

const RULES = [
  [/^servo-\d+-(case|top|bottom)$/, 'servoShell'],
  [/^servo-\d+-(motor|board)$/, 'servoInside'],
  [/^servo-\d+-shaft$/, 'shaft'],
  [/^servo-\d+-(idle-)?horn$/, 'horn'],
  [/^screw-/, 'screw'],
  [/^cable-/, 'cable'],
  [/^board$/, 'board'],
  [/./, 'printed'],
]

const kindOf = (id) => RULES.find(([test]) => test.test(id))[1]

// ---------------------------------------------------------------- surfaces

/**
 * The bodies of a part, each with the faces the CAD gave it joined into one list of
 * triangles. Kept in the file's own frame (Y-up), but in mm so the numbers above apply.
 */
function bodiesOf(doc) {
  const bodies = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    const flipped =
      m[0] * (m[5] * m[10] - m[6] * m[9]) -
        m[4] * (m[1] * m[10] - m[2] * m[9]) +
        m[8] * (m[1] * m[6] - m[2] * m[5]) <
      0
    const position = []
    const normal = []
    const face = [] // for each point, the face of the CAD it is on
    const index = []
    let faces = 0
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue
      faces++
      const p = primitive.getAttribute('POSITION').getArray()
      const n = primitive.getAttribute('NORMAL')?.getArray()
      const base = position.length / 3
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i]
        const y = p[i + 1]
        const z = p[i + 2]
        position.push(
          (m[0] * x + m[4] * y + m[8] * z + m[12]) * 1000,
          (m[1] * x + m[5] * y + m[9] * z + m[13]) * 1000,
          (m[2] * x + m[6] * y + m[10] * z + m[14]) * 1000
        )
        if (n) {
          const a = m[0] * n[i] + m[4] * n[i + 1] + m[8] * n[i + 2]
          const b = m[1] * n[i] + m[5] * n[i + 1] + m[9] * n[i + 2]
          const c = m[2] * n[i] + m[6] * n[i + 1] + m[10] * n[i + 2]
          const l = Math.hypot(a, b, c) || 1
          normal.push(a / l, b / l, c / l)
        } else normal.push(0, 0, 0)
        face.push(faces)
      }
      const indices = primitive.getIndices()?.getArray()
      const count = indices ? indices.length : p.length / 3
      for (let i = 0; i < count; i += 3) {
        const a = base + (indices ? indices[i] : i)
        const b = base + (indices ? indices[i + 1] : i + 1)
        const c = base + (indices ? indices[i + 2] : i + 2)
        if (flipped) index.push(a, c, b)
        else index.push(a, b, c)
      }
    }
    if (index.length) bodies.push({ position, normal, face, index })
  }
  return bodies
}

/**
 * Join the points a face of the CAD has more than once, and no others: where two faces
 * meet, each keeps its own points. A point then always carries the normal of the face
 * it is on, however far the simplifier moves the triangles about, so a flat face stays
 * flat to the light; and the simplifier only slides the points of an edge along that
 * edge, which is where the edge line is drawn. Every point at one place is given the
 * very same numbers: that is how the simplifier knows the faces meet there, and does
 * not pull them apart.
 */
function weld({ position, normal, face, index }) {
  const places = new Map()
  const points = new Map()
  const outPosition = []
  const outNormal = []
  const placeOf = []
  const remap = new Uint32Array(position.length / 3)
  for (let i = 0; i < remap.length; i++) {
    const x = position[i * 3]
    const y = position[i * 3 + 1]
    const z = position[i * 3 + 2]
    const placeKey = `${Math.round(x * 2000)},${Math.round(y * 2000)},${Math.round(z * 2000)}`
    let place = places.get(placeKey)
    if (!place) places.set(placeKey, (place = { id: places.size, x, y, z }))
    const key = `${place.id}|${face[i]}|${Math.round(normal[i * 3] * 40)},${Math.round(normal[i * 3 + 1] * 40)},${Math.round(normal[i * 3 + 2] * 40)}`
    let point = points.get(key)
    if (point === undefined) {
      points.set(key, (point = points.size))
      outPosition.push(place.x, place.y, place.z)
      outNormal.push(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2])
      placeOf.push(place.id)
    }
    remap[i] = point
  }
  const outIndex = []
  for (let i = 0; i < index.length; i += 3) {
    const a = remap[index[i]]
    const b = remap[index[i + 1]]
    const c = remap[index[i + 2]]
    if (placeOf[a] === placeOf[b] || placeOf[b] === placeOf[c] || placeOf[a] === placeOf[c]) continue
    outIndex.push(a, b, c)
  }
  return {
    position: new Float32Array(outPosition),
    normal: new Float32Array(outNormal),
    index: new Uint32Array(outIndex),
  }
}

function boundsOf(position) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < position.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (position[i + k] < min[k]) min[k] = position[i + k]
      if (position[i + k] > max[k]) max[k] = position[i + k]
    }
  return { min, max }
}

/** A body as the box it fits in: what a part too small to make out is drawn as. */
function boxOf({ min, max }) {
  const position = []
  const normal = []
  const index = []
  for (let axis = 0; axis < 3; axis++)
    for (const side of [-1, 1]) {
      const u = (axis + 1) % 3
      const v = (axis + 2) % 3
      const base = position.length / 3
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const point = [0, 0, 0]
        point[axis] = side < 0 ? min[axis] : max[axis]
        point[u] = a ? max[u] : min[u]
        point[v] = b ? max[v] : min[v]
        position.push(...point)
        const n = [0, 0, 0]
        n[axis] = side
        normal.push(...n)
      }
      if (side > 0) index.push(base, base + 1, base + 2, base, base + 2, base + 3)
      else index.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }
  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    index: new Uint32Array(index),
  }
}

function simplify(body, kind) {
  let index = body.index
  if (index.length === 0) return body
  ;[index] = MeshoptSimplifier.simplify(index, body.position, 3, 0, kind.surface, ['ErrorAbsolute'])
  if (kind.prune) {
    const scale = MeshoptSimplifier.getScale(body.position, 3)
    const pruned = MeshoptSimplifier.simplifyPrune(index, body.position, 3, kind.prune / scale)
    // never prune a part away altogether
    if (pruned.length) index = pruned
  }
  return { ...body, index }
}

/** The bodies of a part as one surface. */
function join(bodies) {
  let points = 0
  let corners = 0
  for (const body of bodies) {
    points += body.position.length / 3
    corners += body.index.length
  }
  const position = new Float32Array(points * 3)
  const normal = new Float32Array(points * 3)
  const index = new Uint32Array(corners)
  let p = 0
  let c = 0
  for (const body of bodies) {
    position.set(body.position, p * 3)
    normal.set(body.normal, p * 3)
    for (let i = 0; i < body.index.length; i++) index[c++] = body.index[i] + p
    p += body.position.length / 3
  }
  return { position, normal, index }
}

// Positions are written as 16-bit normalized numbers of metres, so that a node needs no
// transform of its own to undo the packing: a step is 1/32767 m, about 0.03 mm.
const STEPS = 32767

/**
 * What goes in the file: metres again, packed to whole numbers, the points no triangle
 * uses left out, and put in the order that packs and draws best.
 */
function packed({ position, normal, index }) {
  const place = new Int16Array(position.length)
  for (let i = 0; i < position.length; i++) {
    const q = Math.round((position[i] / 1000) * STEPS)
    if (q < -STEPS || q > STEPS) throw new Error('The model does not fit in a metre each way.')
    place[i] = q
  }
  const same = (a, b) =>
    place[a * 3] === place[b * 3] && place[a * 3 + 1] === place[b * 3 + 1] && place[a * 3 + 2] === place[b * 3 + 2]
  const kept = []
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]
    const b = index[i + 1]
    const c = index[i + 2]
    if (same(a, b) || same(b, c) || same(a, c)) continue
    kept.push(a, b, c)
  }
  // puts the triangles in the order that packs best, and renumbers the points to follow
  const order = new Uint32Array(kept)
  const [remap, count] = MeshoptEncoder.reorderMesh(order, true, true)
  const outPosition = new Int16Array(count * 3)
  const outNormal = new Int8Array(count * 3)
  for (let i = 0; i < remap.length && i * 3 < place.length; i++) {
    const to = remap[i]
    if (to === 0xffffffff) continue
    for (let k = 0; k < 3; k++) {
      outPosition[to * 3 + k] = place[i * 3 + k]
      outNormal[to * 3 + k] = Math.round(normal[i * 3 + k] * 127)
    }
  }
  const outIndex = count > 65535 ? order : new Uint16Array(order)
  return { position: outPosition, normal: outNormal, index: outIndex }
}

// ---------------------------------------------------------------- edge lines

/** The file's segments as the lines they make up: each a run of points, x y z, mm Z-up. */
function linesOf(segments) {
  const lines = []
  let line = null
  for (let i = 0; i + 5 < segments.length; i += 6) {
    const follows =
      line &&
      Math.abs(line[line.length - 3] - segments[i]) < 1e-4 &&
      Math.abs(line[line.length - 2] - segments[i + 1]) < 1e-4 &&
      Math.abs(line[line.length - 1] - segments[i + 2]) < 1e-4
    if (!follows) lines.push((line = [segments[i], segments[i + 1], segments[i + 2]]))
    line.push(segments[i + 3], segments[i + 4], segments[i + 5])
  }
  return lines
}

function away(line, i, a, b) {
  const px = line[i * 3] - line[a * 3]
  const py = line[i * 3 + 1] - line[a * 3 + 1]
  const pz = line[i * 3 + 2] - line[a * 3 + 2]
  const dx = line[b * 3] - line[a * 3]
  const dy = line[b * 3 + 1] - line[a * 3 + 1]
  const dz = line[b * 3 + 2] - line[a * 3 + 2]
  const length = dx * dx + dy * dy + dz * dz
  const t = length ? Math.min(1, Math.max(0, (px * dx + py * dy + pz * dz) / length)) : 0
  return Math.hypot(px - dx * t, py - dy * t, pz - dz * t)
}

/** The points of a line that have to stay for it to be within `tolerance` of itself. */
function straighten(line, tolerance) {
  const count = line.length / 3
  if (count <= 2) return line
  const keep = new Uint8Array(count)
  keep[0] = keep[count - 1] = 1
  const spans = [[0, count - 1]]
  const closed = away(line, count - 1, 0, 0) < 1e-4
  if (closed) {
    // a loop has no ends to hold it: hold it at the point across from where it starts
    let far = 0
    let most = -1
    for (let i = 1; i < count - 1; i++) {
      const d = away(line, i, 0, 0)
      if (d > most) {
        most = d
        far = i
      }
    }
    if (most <= tolerance) return null
    keep[far] = 1
    spans.length = 0
    spans.push([0, far], [far, count - 1])
  }
  while (spans.length) {
    const [a, b] = spans.pop()
    let far = -1
    let most = tolerance
    for (let i = a + 1; i < b; i++) {
      const d = away(line, i, a, b)
      if (d > most) {
        most = d
        far = i
      }
    }
    if (far < 0) continue
    keep[far] = 1
    spans.push([a, far], [far, b])
  }
  const out = []
  for (let i = 0; i < count; i++) if (keep[i]) out.push(line[i * 3], line[i * 3 + 1], line[i * 3 + 2])
  return out
}

function diagonal(line) {
  const { min, max } = boundsOf(line)
  return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2])
}

/** The edge lines of a part, cut down. `skip` says which lines to leave out whatever. */
function simplifyLines(segments, kind, skip) {
  const out = []
  for (const line of linesOf(segments)) {
    if (kind.lineMin && diagonal(line) < kind.lineMin) continue
    if (skip?.(line)) continue
    const straight = straighten(line, kind.line)
    if (!straight) continue
    for (let i = 0; i + 5 < straight.length; i += 3) out.push(...straight.slice(i, i + 6))
  }
  return out
}

/** The twelve edges of a box, as segments. */
function outline({ min, max }) {
  const out = []
  const corner = (i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]
  for (let i = 0; i < 8; i++)
    for (const bit of [1, 2, 4]) if (!(i & bit)) out.push(...corner(i), ...corner(i | bit))
  return out
}

// ---------------------------------------------------------------- the model

/** glTF Y-up mm to the model's Z-up mm, the turn load.ts gives a part (TO_MODEL). */
const toModel = ([x, y, z]) => [x, -z, y]

function modelBounds(position) {
  const { min, max } = boundsOf(position)
  const a = toModel(min)
  const b = toModel(max)
  return { min: a.map((v, k) => Math.min(v, b[k])), max: a.map((v, k) => Math.max(v, b[k])) }
}

async function main() {
  await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready])
  const manifest = JSON.parse(await fs.readFile(path.join(SOURCE, 'enclose.model.json'), 'utf8'))
  const reader = new NodeIO()

  const doc = new Document()
  doc.getRoot().getAsset().generator = 'enclose/apps/marketing/scripts/pack-model.mjs'
  const buffer = doc.createBuffer()
  const scene = doc.createScene('arm')
  doc.getRoot().setDefaultScene(scene)

  const parts = []
  const lines = []
  const tally = {}
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  const source = { bytes: 0, edgeBytes: 0 }

  for (const part of manifest.parts) {
    const kindName = kindOf(part.id)
    const kind = KINDS[kindName]
    const count = (tally[kindName] ??= { parts: 0, trianglesIn: 0, triangles: 0, segmentsIn: 0, segments: 0 })
    count.parts++

    const file = path.join(SOURCE, part.file)
    source.bytes += (await fs.stat(file)).size
    const bodies = bodiesOf(await reader.read(file))
    const boxes = [] // the bodies drawn as boxes: their own edge lines go, the box's are drawn
    const done = []
    for (const body of bodies) {
      count.trianglesIn += body.index.length / 3
      const bounds = boundsOf(body.position)
      const size = Math.max(...bounds.max.map((v, k) => v - bounds.min[k]))
      if (kind.boxBelow && bodies.length > 1 && size < kind.boxBelow) {
        boxes.push(modelBounds(body.position))
        done.push(boxOf(bounds))
      } else done.push(simplify(weld(body), kind))
    }
    const surface = packed(join(done))
    if (surface.index.length === 0) throw new Error(`Nothing is left of "${part.id}".`)
    count.triangles += surface.index.length / 3
    for (let i = 0; i < surface.position.length; i += 3) {
      const point = toModel([0, 1, 2].map((k) => (surface.position[i + k] / STEPS) * 1000))
      for (let k = 0; k < 3; k++) {
        if (point[k] < box.min[k]) box.min[k] = point[k]
        if (point[k] > box.max[k]) box.max[k] = point[k]
      }
    }

    const primitive = doc
      .createPrimitive()
      .setAttribute(
        'POSITION',
        doc.createAccessor().setType('VEC3').setArray(surface.position).setNormalized(true).setBuffer(buffer)
      )
      .setAttribute(
        'NORMAL',
        doc.createAccessor().setType('VEC3').setArray(surface.normal).setNormalized(true).setBuffer(buffer)
      )
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(surface.index).setBuffer(buffer))
    scene.addChild(doc.createNode(part.id).setMesh(doc.createMesh(part.id).addPrimitive(primitive)))

    let segments = []
    if (part.edges) {
      const bytes = await fs.readFile(path.join(SOURCE, part.edges))
      source.edgeBytes += bytes.length
      const raw = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      count.segmentsIn += raw.length / 6
      const inBox = (line) => {
        const { min, max } = boundsOf(line)
        return boxes.some((b) => [0, 1, 2].every((k) => min[k] > b.min[k] - 0.02 && max[k] < b.max[k] + 0.02))
      }
      segments = simplifyLines(raw, kind, boxes.length ? inBox : null)
      for (const b of boxes) segments.push(...outline(b))
    }
    lines.push(segments)

    parts.push({
      id: part.id,
      group: part.group,
      color: part.color ?? null,
      metal: part.finish === 'metal',
      explode: (part.explode ?? [0, 0, 0]).map((v) => Math.round(v * 1000) / 1000),
      edges: [0, 0],
    })
  }

  // ---- arm.edges.bin: every line against one box, and each part's place in it
  const edgeBox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  for (const segments of lines)
    for (let i = 0; i < segments.length; i++) {
      const k = i % 3
      if (segments[i] < edgeBox.min[k]) edgeBox.min[k] = segments[i]
      if (segments[i] > edgeBox.max[k]) edgeBox.max[k] = segments[i]
    }
  edgeBox.min = edgeBox.min.map((v) => Math.floor(v * 100) / 100)
  edgeBox.max = edgeBox.max.map((v) => Math.ceil(v * 100) / 100)
  const quantized = []
  lines.forEach((segments, at) => {
    const first = quantized.length / 6
    const seen = new Set()
    for (let i = 0; i < segments.length; i += 6) {
      const q = []
      for (let j = 0; j < 6; j++) {
        const k = j % 3
        q.push(Math.round(((segments[i + j] - edgeBox.min[k]) / (edgeBox.max[k] - edgeBox.min[k])) * 65535))
      }
      if (q[0] === q[3] && q[1] === q[4] && q[2] === q[5]) continue
      const a = q.slice(0, 3).join(',')
      const b = q.slice(3).join(',')
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (seen.has(key)) continue
      seen.add(key)
      quantized.push(...q)
    }
    parts[at].edges = [first, quantized.length / 6 - first]
    tally[kindOf(parts[at].id)].segments += parts[at].edges[1]
  })

  doc.createExtension(KHRMeshQuantization).setRequired(true)
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
  const writer = new NodeIO()
    .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

  await fs.mkdir(OUT, { recursive: true })
  const glb = await writer.writeBinary(doc)
  const edges = Buffer.from(new Uint16Array(quantized).buffer)
  const json = JSON.stringify({
    edgeBox,
    box: { min: box.min.map((v) => Math.round(v * 100) / 100), max: box.max.map((v) => Math.round(v * 100) / 100) },
    groups: manifest.groups.map(({ id, label }) => ({ id, label })),
    parts,
  })
  await fs.writeFile(path.join(OUT, 'arm.glb'), glb)
  await fs.writeFile(path.join(OUT, 'arm.edges.bin'), edges)
  await fs.writeFile(path.join(OUT, 'arm.json'), json)

  const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`
  const sent = (data) => `${kb(data.length)}, ${kb(zlib.gzipSync(data).length)} gzipped`
  const total = { parts: 0, trianglesIn: 0, triangles: 0, segmentsIn: 0, segments: 0 }
  console.log('kind         parts   triangles            edge segments')
  for (const [name, count] of Object.entries(tally)) {
    for (const key of Object.keys(total)) total[key] += count[key]
    console.log(
      `${name.padEnd(12)} ${String(count.parts).padStart(5)}   ${String(count.trianglesIn).padStart(7)} -> ${String(count.triangles).padEnd(7)}   ${String(count.segmentsIn).padStart(7)} -> ${count.segments}`
    )
  }
  console.log(
    `${'all'.padEnd(12)} ${String(total.parts).padStart(5)}   ${String(total.trianglesIn).padStart(7)} -> ${String(total.triangles).padEnd(7)}   ${String(total.segmentsIn).padStart(7)} -> ${total.segments}`
  )
  console.log(`arm.glb        ${sent(Buffer.from(glb))}   (from ${kb(source.bytes)} of .glb)`)
  console.log(`arm.edges.bin  ${sent(edges)}   (from ${kb(source.edgeBytes)} of .edges.bin)`)
  console.log(`arm.json       ${sent(Buffer.from(json))}`)
  console.log(`model box, mm Z-up: ${JSON.stringify(box.min.map((v) => +v.toFixed(1)))} to ${JSON.stringify(box.max.map((v) => +v.toFixed(1)))}`)
  const bare = parts.filter((part) => part.edges[1] === 0).map((part) => part.id)
  console.log(`parts with no edge lines: ${bare.length ? bare.join(', ') : 'none'}`)
}

await main()
