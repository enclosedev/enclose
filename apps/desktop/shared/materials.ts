// What a part can be made of, as the view draws it in Render: a few of each kind of
// thing, not all there are. Each is how its surface takes the light, in numbers, and for
// some a picture of its grain or weave (src/assets/materials, CC0 from ambientCG) or a
// pattern the app makes (brushed, hammered).
//
// A part is given one by hand, kept with the colours given by hand (see
// colours-format.ts), and the agent can give one too, by its id. In Solid, a part with
// one is drawn in its colour: its own (oak's light brown), or the part's where it takes
// the part's colour, as a plastic does.

export type MaterialKind =
  "plastic" | "metal" | "wood" | "glass" | "fabric" | "utility"

/** The kinds, in the order the list has them, and what each is called. */
export const MATERIAL_KINDS: { kind: MaterialKind; label: string }[] = [
  { kind: "plastic", label: "Plastic" },
  { kind: "metal", label: "Metal" },
  { kind: "wood", label: "Wood" },
  { kind: "glass", label: "Glass" },
  { kind: "fabric", label: "Fabric" },
  { kind: "utility", label: "Utility" },
]

/** A picture of a grain or a weave, by its name in src/assets/materials. */
export type MaterialTexture =
  | "oak"
  | "walnut"
  | "maple"
  | "cherry"
  | "plywood"
  | "woven"
  | "felt"
  | "carbon"

/** A pattern of the surface the app makes itself. */
export type MaterialPattern = "brushed" | "hammered"

export type Material = {
  id: string
  kind: MaterialKind
  /** what it is, and how it is finished: "ABS", "Glossy" */
  name: string
  finish: string
  /** it takes the part's colour: a plastic, a paint, a fabric, glass */
  tinted: boolean
  /**
   * The colour it has of its own, "#rrggbb": what it is drawn in where it takes none, and
   * what Solid draws it in. Of one with a picture of its grain, the picture's colour.
   */
  colour: string
  metalness: number
  roughness: number
  /** a coat of clear lacquer over it, 0 to 1, and how rough that is */
  clearcoat?: number
  clearcoatRoughness?: number
  /** how much light goes through it, 0 to 1, how thick it is taken to be (mm), and how it bends light */
  transmission?: number
  thickness?: number
  ior?: number
  /** the soft shine of cloth, 0 to 1 */
  sheen?: number
  /** how brightly it gives off light of its colour */
  glow?: number
  /** how much of it shows, where it is see-through without bending light */
  opacity?: number
  texture?: MaterialTexture
  pattern?: MaterialPattern
  /** how far across one picture or pattern of it is, mm */
  tile?: number
  /** how deep its grain or weave looks */
  relief?: number
}

/**
 * The ones there are, in the order the list has them. Ids are kept as they are once a
 * project uses one: they are what its file says.
 */
export const MATERIALS: Material[] = [
  // Plastic
  {
    id: "plastic-glossy",
    kind: "plastic",
    name: "Plastic",
    finish: "Glossy",
    tinted: true,
    colour: "#d4d4d4",
    metalness: 0,
    roughness: 0.18,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
  },
  {
    id: "plastic-matte",
    kind: "plastic",
    name: "Plastic",
    finish: "Matte",
    tinted: true,
    colour: "#d4d4d4",
    metalness: 0,
    roughness: 0.62,
  },
  {
    id: "plastic-soft",
    kind: "plastic",
    name: "Plastic",
    finish: "Soft-touch",
    tinted: true,
    colour: "#d4d4d4",
    metalness: 0,
    roughness: 0.9,
    sheen: 0.25,
  },
  {
    id: "plastic-translucent",
    kind: "plastic",
    name: "Plastic",
    finish: "Translucent",
    tinted: true,
    colour: "#ffffff",
    metalness: 0,
    roughness: 0.35,
    transmission: 0.7,
    thickness: 2,
    ior: 1.49,
  },
  {
    id: "carbon-fiber",
    kind: "plastic",
    name: "Carbon Fiber",
    finish: "Glossy",
    tinted: false,
    colour: "#2f2e31",
    metalness: 0.2,
    roughness: 0.4,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    texture: "carbon",
    tile: 24,
    relief: 0.6,
  },
  // Metal
  {
    id: "aluminium-polished",
    kind: "metal",
    name: "Aluminium",
    finish: "Polished",
    tinted: false,
    colour: "#d6d8db",
    metalness: 1,
    roughness: 0.12,
  },
  {
    id: "aluminium-brushed",
    kind: "metal",
    name: "Aluminium",
    finish: "Brushed",
    tinted: false,
    colour: "#c9ccd0",
    metalness: 1,
    roughness: 0.32,
    pattern: "brushed",
    tile: 40,
    relief: 0.2,
  },
  {
    id: "aluminium-anodised",
    kind: "metal",
    name: "Aluminium",
    finish: "Anodised",
    tinted: true,
    colour: "#9a9ea4",
    metalness: 0.85,
    roughness: 0.38,
  },
  {
    id: "steel",
    kind: "metal",
    name: "Steel",
    finish: "Satin",
    tinted: false,
    colour: "#a9adb2",
    metalness: 1,
    roughness: 0.3,
  },
  {
    id: "steel-hammered",
    kind: "metal",
    name: "Steel",
    finish: "Hammered",
    tinted: false,
    colour: "#9fa3a8",
    metalness: 1,
    roughness: 0.28,
    pattern: "hammered",
    tile: 30,
    relief: 0.8,
  },
  {
    id: "brass",
    kind: "metal",
    name: "Brass",
    finish: "Polished",
    tinted: false,
    colour: "#d4b06a",
    metalness: 1,
    roughness: 0.16,
  },
  {
    id: "copper",
    kind: "metal",
    name: "Copper",
    finish: "Polished",
    tinted: false,
    colour: "#d08a68",
    metalness: 1,
    roughness: 0.2,
  },
  // Wood: the colour of each is the average of its picture
  {
    id: "oak",
    kind: "wood",
    name: "Oak",
    finish: "Oiled",
    tinted: false,
    colour: "#7b634e",
    metalness: 0,
    roughness: 0.6,
    texture: "oak",
    tile: 160,
    relief: 0.5,
  },
  {
    id: "walnut",
    kind: "wood",
    name: "Walnut",
    finish: "Clearcoat",
    tinted: false,
    colour: "#41342e",
    metalness: 0,
    roughness: 0.55,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    texture: "walnut",
    tile: 160,
    relief: 0.4,
  },
  {
    id: "maple",
    kind: "wood",
    name: "Maple",
    finish: "Sanded",
    tinted: false,
    colour: "#ac8a6c",
    metalness: 0,
    roughness: 0.7,
    texture: "maple",
    tile: 160,
    relief: 0.3,
  },
  {
    id: "cherry",
    kind: "wood",
    name: "Cherry",
    finish: "Clearcoat",
    tinted: false,
    colour: "#593414",
    metalness: 0,
    roughness: 0.5,
    clearcoat: 0.6,
    clearcoatRoughness: 0.12,
    texture: "cherry",
    tile: 160,
    relief: 0.3,
  },
  {
    id: "plywood",
    kind: "wood",
    name: "Plywood",
    finish: "Sanded",
    tinted: false,
    colour: "#b09065",
    metalness: 0,
    roughness: 0.72,
    texture: "plywood",
    tile: 200,
    relief: 0.5,
  },
  // Glass
  {
    id: "glass-clear",
    kind: "glass",
    name: "Glass",
    finish: "Clear",
    tinted: true,
    colour: "#ffffff",
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 3,
    ior: 1.5,
  },
  {
    id: "glass-frosted",
    kind: "glass",
    name: "Glass",
    finish: "Frosted",
    tinted: true,
    colour: "#ffffff",
    metalness: 0,
    roughness: 0.45,
    transmission: 1,
    thickness: 3,
    ior: 1.5,
  },
  // Fabric: pale, so that they take the part's colour
  {
    id: "fabric-woven",
    kind: "fabric",
    name: "Fabric",
    finish: "Woven",
    tinted: true,
    colour: "#bababa",
    metalness: 0,
    roughness: 0.9,
    sheen: 0.8,
    texture: "woven",
    tile: 40,
    relief: 1,
  },
  {
    id: "fabric-felt",
    kind: "fabric",
    name: "Fabric",
    finish: "Felt",
    tinted: true,
    colour: "#a19fa5",
    metalness: 0,
    roughness: 0.95,
    sheen: 1,
    texture: "felt",
    tile: 60,
    relief: 0.6,
  },
  // Utility
  {
    id: "emissive",
    kind: "utility",
    name: "Light",
    finish: "Emissive",
    tinted: true,
    colour: "#ffffff",
    metalness: 0,
    roughness: 0.5,
    glow: 2.5,
  },
  {
    id: "transparent",
    kind: "utility",
    name: "Transparent",
    finish: "Simple",
    tinted: true,
    colour: "#ffffff",
    metalness: 0,
    roughness: 0.3,
    opacity: 0.35,
  },
]

const BY_ID = new Map(MATERIALS.map((material) => [material.id, material]))

/** The material a project's file names, if it is one there is. */
export const materialOf = (id: string | null | undefined): Material | null =>
  (id && BY_ID.get(id)) || null

/** How it is said: "Glossy Plastic", the way a list of them reads. */
export const materialSaid = (material: Material) =>
  `${material.finish} ${material.name}`

/**
 * How a part's material is given: which one, and how it is set beyond that. Each of
 * these is a share of the material's own: roughness 1 is as rough as it is, scale 2
 * makes its grain twice as big. Rotation turns its grain, in degrees.
 */
export type PartMaterial = {
  material: string
  roughness?: number
  scale?: number
  rotation?: number
}

/** How far each may be set, and what it is at to begin with. */
export const MATERIAL_SETTINGS = {
  roughness: { min: 0, max: 2, step: 0.05, initial: 1 },
  scale: { min: 0.1, max: 4, step: 0.05, initial: 1 },
  rotation: { min: 0, max: 180, step: 1, initial: 0 },
} as const

/** Whether a material has a grain or a pattern, and so a size and a direction to it. */
export const hasGrain = (material: Material) =>
  Boolean(material.texture || material.pattern)

/**
 * The colour Solid draws a part in, given the material it has, if any: the part's own,
 * where the material takes the part's colour, and otherwise the material's.
 */
export const solidOf = (
  given: string | null,
  material: Material | null
): string | null => (material && !material.tinted ? material.colour : given)

/**
 * The colours Solid draws parts in, by part: those given by hand, and for a part with a
 * material that has a colour of its own, that one (see solidOf). The very colours given,
 * where no part has such a material.
 */
export function solidColours<Colour extends string>(
  given: Record<string, Colour>,
  materials: Record<string, PartMaterial>
): Record<string, Colour | string> {
  let next: Record<string, Colour | string> = given
  for (const [part, chosen] of Object.entries(materials)) {
    const material = materialOf(chosen.material)
    if (!material || material.tinted) continue
    if (next === given) next = { ...given }
    next[part] = material.colour
  }
  return next
}
