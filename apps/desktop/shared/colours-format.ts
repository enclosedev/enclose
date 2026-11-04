// The colours and materials the user gives parts by hand in the app: kept in a file of
// the project's own, at the top of its folder, so that they go wherever the project goes:
// into its history with the rest of it, into each conversation's version of it, and to
// another machine. By part, as the manifest calls each ("id"). What the model names for a
// part is drawn only where the user has given it none.
//
// A part with a colour alone has that, as it is written: one of the palette's names, or
// "#rrggbb" picked by hand. One with a material as well has an object: its "color", if
// it has one, its "material" by id (see materials.ts), and how that is set.
//
//   { "case": "blue", "lid": { "color": "#3a7bd5", "material": "oak", "scale": 1.5 } }
import { materialOf, type PartMaterial } from "./materials"
import { FORMER_NAMES, PALETTE_NAMES, type PaletteName } from "./palette"

/** The file they are kept in, at the top of the project's folder. */
export const COLOURS_FILE = "enclose.colors.json"

/** A colour given by hand: one of the palette's, or "#rrggbb". */
export type PartColour = PaletteName | `#${string}`

/** The colours given to a project's parts by hand, by part. */
export type PartColours = Record<string, PartColour>

/** The materials given to a project's parts by hand, by part. */
export type PartMaterials = Record<string, PartMaterial>

/** Both, as the file has them. */
export type PartLooks = { colours: PartColours; materials: PartMaterials }

const NAMES = new Set<string>(PALETTE_NAMES)
const HEX = /^#[0-9a-f]{6}$/

/** A colour as written, if it is one: a palette's name, or "#rrggbb" (in small letters). */
export function colourOf(written: unknown): PartColour | null {
  if (typeof written !== "string") return null
  if (NAMES.has(written)) return written as PaletteName
  if (Object.hasOwn(FORMER_NAMES, written)) return FORMER_NAMES[written]
  const hex = written.trim().toLowerCase()
  return HEX.test(hex) ? (hex as PartColour) : null
}

/** A number written for a material's setting, if it is one, kept to what it may be. */
const setting = (written: unknown, least: number, most: number) =>
  typeof written === "number" && Number.isFinite(written)
    ? Math.min(most, Math.max(least, written))
    : undefined

/** A material as written, if it names one there is: with what is set of it. */
export function partMaterialOf(written: unknown): PartMaterial | null {
  if (typeof written !== "object" || written === null) return null
  const said = written as Record<string, unknown>
  const id = typeof said.material === "string" ? said.material : null
  if (!materialOf(id)) return null
  const material: PartMaterial = { material: id! }
  const roughness = setting(said.roughness, 0, 2)
  const scale = setting(said.scale, 0.1, 4)
  const rotation = setting(said.rotation, 0, 360)
  if (roughness !== undefined) material.roughness = roughness
  if (scale !== undefined) material.scale = scale
  if (rotation !== undefined) material.rotation = rotation
  return material
}

/**
 * The colours and materials a file says, as written: only those that are colours and
 * materials there are, of parts that are named. Nothing, where it says nothing that is.
 */
export function readLooks(written: unknown): PartLooks {
  const looks: PartLooks = { colours: {}, materials: {} }
  if (typeof written !== "object" || written === null || Array.isArray(written))
    return looks
  for (const [part, said] of Object.entries(written)) {
    if (!part || part === "__proto__") continue
    const colour = colourOf(
      typeof said === "object" && said !== null
        ? (said as Record<string, unknown>).color
        : said
    )
    if (colour) looks.colours[part] = colour
    const material = partMaterialOf(said)
    if (material) looks.materials[part] = material
  }
  return looks
}

/** The colours alone that a file says (see readLooks). */
export const readColours = (written: unknown): PartColours =>
  readLooks(written).colours

/**
 * What the file says: its parts in order, so that it changes only where a colour or a
 * material does. A part with a colour alone is written as it always was.
 */
export function looksFile({ colours, materials }: PartLooks): string {
  const parts = [
    ...new Set([...Object.keys(colours), ...Object.keys(materials)]),
  ].sort()
  const ordered = Object.fromEntries(
    parts.map((part) => {
      const colour = colours[part]
      const material = materials[part]
      if (!material) return [part, colour]
      return [part, colour ? { color: colour, ...material } : { ...material }]
    })
  )
  return `${JSON.stringify(ordered, null, 2)}\n`
}

/** The file for colours alone (see looksFile). */
export const coloursFile = (colours: PartColours): string =>
  looksFile({ colours, materials: {} })

/** Whether there is anything to keep: a colour or a material on any part. */
export const anyLooks = ({ colours, materials }: PartLooks) =>
  Object.keys(colours).length > 0 || Object.keys(materials).length > 0
