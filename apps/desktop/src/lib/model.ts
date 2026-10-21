// A project's model as the app uses it, read from whatever manifest the project wrote.
// The format is described in shared/manifest-format.ts.
import type { Vec3 } from "@shared/api"

/**
 * A named group of parts, as the parts list shows them. `shell` marks the outside of
 * the thing: the parts that come apart each on its own when the model is pulled apart.
 */
export type Group = { id: string; label: string; shell: boolean }

export type Part = {
  id: string
  label: string
  /** the group it is listed under */
  group: string
  file: string
  edges: string | null
  color: string | null
  /** all: the whole part wears `color`. bare: only faces the file left uncoloured do. */
  paint: "all" | "bare"
  /** 16 numbers, row-major */
  matrix: number[] | null
  explode: Vec3
  /** drawn as bare metal rather than plastic */
  metal: boolean
  /**
   * Made of something clear, as a window or a lens is: drawn see-through, so that what
   * is behind it shows, however the rest of the model is drawn.
   */
  clear: boolean
  /**
   * Made of a mesh's triangles (an STL or OBJ file): its file is one mesh, not one for
   * each face, and what was curved is drawn smooth from flats that meet at a slight angle
   */
  mesh: boolean
  /**
   * The name of the project's circuit board it has in it, if it has one: it is drawn in
   * green then, the colour boards are drawn in (see src/lib/palette.ts)
   */
  board: string | null
}

export type Keepout = {
  id: string
  label: string
  min: Vec3
  max: Vec3
  blocked: boolean
}

export type Download = {
  file: string
  name: string
  label: string
  detail: string
  kind: "full" | "set" | "part"
  bytes: number
  /** the part this file is, when it is one part */
  part: string | null
}

export type Model = {
  title: string | null
  /**
   * The reference scene of the app's that whoever built the model says the thing is best
   * seen in, by what the app knows it by ("table"); null where nothing is said.
   */
  reference: string | null
  parts: Part[]
  groups: Group[]
  keepouts: Keepout[]
  keepoutsLabel: string
  downloads: Download[]
}

// The first project this app opened wrote its manifest before groups could be declared:
// parts carry a `group`, and the viewer it came with knew what each one meant. A
// manifest that declares no groups is read the way that viewer read it.
const UNDECLARED: Record<string, Omit<Group, "id">> = {
  enclosure: { label: "Enclosure", shell: true },
  inside: { label: "Electronics", shell: false },
  screws: { label: "Screws", shell: false },
}
const UNDECLARED_KEEPOUTS = "Cables"

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null
const vec3 = (v: unknown): Vec3 | null =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number")
    ? (v as Vec3)
    : null
const titled = (id: string) =>
  id.charAt(0).toUpperCase() + id.slice(1).replaceAll("_", " ")

/** Turn a parsed manifest into a Model, or throw saying what is wrong with it. */
export function readModel(manifest: unknown): Model {
  if (!isObject(manifest) || !Array.isArray(manifest.parts)) {
    throw new Error("The manifest has no list of parts.")
  }
  // "layers" is what groups were called in the first version of the format
  const listed = manifest.groups ?? manifest.layers
  const declared = Array.isArray(listed)

  const parts: Part[] = manifest.parts.map((raw: unknown, index) => {
    if (!isObject(raw)) throw new Error(`Part ${index + 1} is not an object.`)
    const id = text(raw.id)
    const file = text(raw.file)
    if (!id || !file)
      throw new Error(`Part ${index + 1} needs an "id" and a "file".`)
    const group = text(raw.group) ?? text(raw.layer) ?? "model"
    const color = text(raw.color)
    const matrix =
      Array.isArray(raw.matrix) && raw.matrix.length === 16
        ? (raw.matrix as number[])
        : null
    return {
      id,
      label: text(raw.label) ?? id,
      group,
      file,
      edges: text(raw.edges),
      color,
      paint: color && (declared || group !== "inside") ? "all" : "bare",
      matrix,
      explode: vec3(raw.explode) ?? [0, 0, 0],
      metal: raw.finish === "metal" || (!declared && group === "screws"),
      clear: raw.finish === "glass",
      mesh: raw.mesh === true,
      board: text(raw.board),
    }
  })
  if (parts.length === 0) throw new Error("The manifest lists no parts.")
  const ids = new Set<string>()
  for (const part of parts) {
    if (ids.has(part.id))
      throw new Error(`Two parts share the id "${part.id}".`)
    ids.add(part.id)
  }

  const used = [...new Set(parts.map((p) => p.group))]
  let groups: Group[]
  if (declared) {
    groups = (listed as unknown[]).filter(isObject).flatMap((raw) => {
      const id = text(raw.id)
      if (!id) return []
      // "control": "shell" is how the first version of the format spelled it
      const shell = raw.shell === true || raw.control === "shell"
      return [{ id, label: text(raw.label) ?? titled(id), shell }]
    })
    for (const id of used) {
      if (!groups.some((g) => g.id === id))
        groups.push({ id, label: titled(id), shell: false })
    }
  } else {
    groups = used.map((id) => ({
      id,
      ...(UNDECLARED[id] ?? { label: titled(id), shell: false }),
    }))
  }

  const keepouts: Keepout[] = (
    Array.isArray(manifest.keepouts) ? manifest.keepouts : []
  )
    .filter(isObject)
    .flatMap((raw) => {
      const id = text(raw.id)
      const min = vec3(raw.min)
      const max = vec3(raw.max)
      if (!id || !min || !max) return []
      return [
        {
          id,
          label: text(raw.label) ?? id,
          min,
          max,
          blocked: Array.isArray(raw.hits) && raw.hits.length > 0,
        },
      ]
    })

  const downloads: Download[] = (
    Array.isArray(manifest.downloads) ? manifest.downloads : []
  )
    .filter(isObject)
    .flatMap((raw) => {
      const file = text(raw.file)
      if (!file) return []
      const name = text(raw.name) ?? file.split("/").at(-1) ?? file
      return [
        {
          file,
          name,
          label: text(raw.label) ?? name,
          detail: text(raw.detail) ?? "",
          kind:
            raw.kind === "full" || raw.kind === "set"
              ? raw.kind
              : ("part" as const),
          bytes: typeof raw.bytes === "number" ? raw.bytes : 0,
          part: text(raw.part),
        },
      ]
    })

  return {
    title: text(manifest.title),
    reference: text(manifest.reference),
    parts,
    groups,
    keepouts,
    keepoutsLabel:
      text(manifest.keepoutsLabel) ??
      (declared ? "Keep-outs" : UNDECLARED_KEEPOUTS),
    downloads,
  }
}

/**
 * The model in one file, for taking elsewhere: the one with every part in it, where the
 * build wrote one. A model of a single part has no such file, being all there in its
 * part's. None where the parts were written apart and nothing of the whole.
 */
export function oneFile(downloads: Download[]): Download | null {
  return (
    downloads.find((d) => d.kind === "full") ??
    downloads.find((d) => d.kind === "set") ??
    (downloads.length === 1 ? downloads[0] : null)
  )
}

/** The file of one part, if the model hands one out: by the part, or else by its name. */
export function partFile(
  downloads: Download[],
  partId: string,
  label: string
): Download | undefined {
  return (
    downloads.find((d) => d.part === partId) ??
    downloads.find(
      (d) => d.kind === "part" && d.label.toLowerCase() === label.toLowerCase()
    )
  )
}

/** How big a file is, said shortly: "1.2 MB", "340 kB". Nothing, for a size not known. */
export function sizeOf(bytes: number): string {
  if (!bytes) return ""
  return bytes >= 1e6
    ? `${(bytes / 1e6).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1e3))} kB`
}
